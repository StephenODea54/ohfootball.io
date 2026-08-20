import * as cdk from 'aws-cdk-lib'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as ecr from 'aws-cdk-lib/aws-ecr'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as rds from 'aws-cdk-lib/aws-rds'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as scheduler from 'aws-cdk-lib/aws-scheduler'
import * as ssm from 'aws-cdk-lib/aws-ssm'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import * as sfn from 'aws-cdk-lib/aws-stepfunctions'
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks'
import { Construct } from 'constructs'
import { WAREHOUSE_DATABASE, WAREHOUSE_PORT, WAREHOUSE_USERNAME } from './infra-stack'

export interface EtlStackProps extends cdk.StackProps {
  readonly vpc: ec2.IVpc
  readonly warehouse: rds.DatabaseCluster
  readonly artifacts: s3.IBucket
  readonly raw: s3.IBucket
  /** Key of the API package the pipeline replaces each run. */
  readonly codeKey: string
  /** When the run starts, as a cron the scheduler understands. */
  readonly schedule?: string
}

/** What one step of the pipeline may set beyond the image it runs and what it reads. */
interface StepOptions {
  /** Replaces the command the image was built with. */
  readonly command?: string[]
  /** Read from Secrets Manager on top of the warehouse password every task is given. */
  readonly secrets?: Record<string, ecs.Secret>
  /** Replaces the timeout every step is given. */
  readonly timeout?: cdk.Duration
}

/**
 * How long a step may run before the pipeline gives up on it.
 *
 * Most steps are quick. A scrape reads one round of games, and the steps that rebuild the marts,
 * rate every team, and write the snapshot each read the whole record but do one pass over it.
 * Fifteen minutes is generous for any of them, and a step that runs longer than that has stopped
 * making progress rather than being slow.
 */
const STEP_TIMEOUT = cdk.Duration.minutes(15)

/**
 * How long the steps that are slow by nature may run.
 *
 * Drawing the site is the one step whose work grows with the record rather than with the week. It
 * writes a page for every season every program has played, which is about 39,500 of them, at
 * roughly 55 a second against an API on the same machine and slower across a network. Two hours
 * holds it with room to grow.
 *
 * Publishing the dataset writes about 70 MB and uploads it to a service this project does not own,
 * so the time it takes is not ours to predict. Half an hour is enough for the upload to be slow
 * without being stuck.
 */
const SITE_TIMEOUT = cdk.Duration.hours(2)
const DATASET_TIMEOUT = cdk.Duration.minutes(30)

/**
 * The parameter naming the secret that holds the Kaggle account which owns the published dataset.
 *
 * The secret is raised by the secrets stack and holds the keys username, key, and dataset. Its
 * values are written by hand, because a template is readable by anyone who can read the stack.
 *
 * What is read here is a parameter holding the whole ARN of that secret, suffix and all. A task
 * reads one key out of the secret, and reading one key needs the whole ARN. The suffix is minted
 * when the secret is created, so it cannot be written here.
 *
 * A run whose secret holds no value fails when it reaches Kaggle, and a run whose parameter is
 * missing fails before the container starts.
 */
const KAGGLE_SECRET_PARAMETER = '/ohfootball/kaggle/secret-arn'

/**
 * The weekly run that collects, rebuilds, and publishes.
 *
 * Every task runs in a public subnet with a public address. That is what lets a task reach the
 * site it scrapes, the registry it pulls its image from, and Secrets Manager, without a NAT
 * gateway anywhere in the network. The warehouse stays in an isolated subnet and answers only
 * these tasks.
 *
 * The pipeline never reads a stack reference for the things it changes. It reads the name of the
 * API function and the site from parameters those stacks publish, so neither stack has to be
 * undone before the other can change.
 */
export class EtlStack extends cdk.Stack {
  readonly stateMachine: sfn.StateMachine

  private readonly repositories: Record<string, ecr.Repository> = {}
  private readonly cluster: ecs.Cluster
  private readonly taskSecurityGroup: ec2.SecurityGroup
  private readonly logGroup: logs.LogGroup
  private readonly props: EtlStackProps

  constructor(scope: Construct, id: string, props: EtlStackProps) {
    super(scope, id, props)
    this.props = props

    this.cluster = new ecs.Cluster(this, 'Cluster', {
      vpc: props.vpc,
      containerInsightsV2: ecs.ContainerInsights.DISABLED,
    })

    this.logGroup = new logs.LogGroup(this, 'PipelineLogs', {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })

    this.taskSecurityGroup = new ec2.SecurityGroup(this, 'TaskSecurityGroup', {
      vpc: props.vpc,
      description: 'Pipeline tasks',
      allowAllOutbound: true,
    })
    // The rule is written here rather than through the connections of the warehouse. Letting the
    // warehouse open itself to this group would put the rule in the stack that owns the warehouse,
    // and that stack would then depend on this one while this one depends on it for the network.
    new ec2.CfnSecurityGroupIngress(this, 'WarehouseFromTasks', {
      groupId: props.warehouse.connections.securityGroups[0].securityGroupId,
      sourceSecurityGroupId: this.taskSecurityGroup.securityGroupId,
      ipProtocol: 'tcp',
      fromPort: WAREHOUSE_PORT,
      toPort: WAREHOUSE_PORT,
      description: 'Pipeline tasks read and write the warehouse',
    })

    const apiFunctionName = ssm.StringParameter.valueForStringParameter(
      this,
      '/ohfootball/api/function-name',
    )
    const apiUrl = ssm.StringParameter.valueForStringParameter(this, '/ohfootball/api/url')
    const siteBucketName = ssm.StringParameter.valueForStringParameter(
      this,
      '/ohfootball/site/bucket-name',
    )
    const siteDistributionId = ssm.StringParameter.valueForStringParameter(
      this,
      '/ohfootball/site/distribution-id',
    )

    // Collect what the season has added, then rebuild the marts from everything collected so far,
    // then rate every team from the rebuilt marts.
    const scrape = this.runTask('Scrape', 'scraper', { RAW_BUCKET: props.raw.bucketName })
    const transform = this.runTask('Transform', 'analytics', {}, { command: ['build'] })
    const rate = this.runTask('Rate', 'elo', {}, { command: ['run'] })

    // Write the snapshot the API reads, fetch the binary the code pipeline built, and put the two
    // together as the package the function runs.
    const pack = this.runTask('Package', 'snapshot', {
      ARTIFACTS_BUCKET: props.artifacts.bucketName,
      CODE_KEY: props.codeKey,
    })

    // Replacing the code directly is what keeps the stack and the pipeline from overwriting each
    // other. The stack points at the key and records no version, so this is the only thing that
    // moves the function forward.
    const publishApi = new tasks.CallAwsService(this, 'PublishApi', {
      service: 'lambda',
      action: 'updateFunctionCode',
      parameters: {
        FunctionName: apiFunctionName,
        S3Bucket: props.artifacts.bucketName,
        S3Key: props.codeKey,
      },
      iamResources: [
        cdk.Arn.format({ service: 'lambda', resource: 'function', resourceName: '*' }, this),
      ],
    })

    // The site is built against the API that was just published, so the pages carry the ratings of
    // this run.
    const buildSite = this.runTask(
      'BuildSite',
      'site',
      {
        SITE_BUCKET: siteBucketName,
        VITE_GRAPHQL_URL: apiUrl,
      },
      { timeout: SITE_TIMEOUT },
    )

    // Every page is written fresh, so the distribution has to be told to stop serving the old one.
    const clearCache = new tasks.CallAwsService(this, 'ClearCache', {
      service: 'cloudfront',
      action: 'createInvalidation',
      parameters: {
        DistributionId: siteDistributionId,
        InvalidationBatch: {
          CallerReference: sfn.JsonPath.stringAt('$$.Execution.Name'),
          Paths: { Quantity: 1, Items: ['/*'] },
        },
      },
      iamResources: [
        cdk.Arn.format(
          { service: 'cloudfront', region: '', resource: 'distribution', resourceName: '*' },
          this,
        ),
      ],
    })

    // The dataset is published last, out of the same marts the site was built from. It is last
    // because nothing else in the run reads it, so a Kaggle outage costs the publication of the
    // dataset and not the publication of the site.
    const kaggleSecret = secretsmanager.Secret.fromSecretCompleteArn(
      this,
      'KaggleSecret',
      ssm.StringParameter.valueForStringParameter(this, KAGGLE_SECRET_PARAMETER),
    )
    const publishDataset = this.runTask('PublishDataset', 'dataset', {}, {
      command: ['publish'],
      secrets: {
        KAGGLE_USERNAME: ecs.Secret.fromSecretsManager(kaggleSecret, 'username'),
        KAGGLE_KEY: ecs.Secret.fromSecretsManager(kaggleSecret, 'key'),
        // The dataset is named in the secret rather than here, so the account and the thing it
        // owns are set in one place and neither reaches the template.
        KAGGLE_DATASET: ecs.Secret.fromSecretsManager(kaggleSecret, 'dataset'),
      },
      timeout: DATASET_TIMEOUT,
    })
    // Kaggle refusing once is usually Kaggle refusing once. A retry runs the whole task again,
    // which exports the marts again, so the run pays for the attempt in full.
    publishDataset.addRetry({
      errors: ['States.TaskFailed'],
      maxAttempts: 2,
      interval: cdk.Duration.minutes(1),
      backoffRate: 2,
    })

    this.stateMachine = new sfn.StateMachine(this, 'Pipeline', {
      stateMachineType: sfn.StateMachineType.STANDARD,
      // A run wakes the warehouse, scrapes a site politely, and rebuilds every mart. Hours is the
      // right unit for the whole of it.
      timeout: cdk.Duration.hours(6),
      definitionBody: sfn.DefinitionBody.fromChainable(
        scrape
          .next(transform)
          .next(rate)
          .next(pack)
          .next(publishApi)
          .next(buildSite)
          .next(clearCache)
          .next(publishDataset),
      ),
      logs: {
        destination: new logs.LogGroup(this, 'PipelineStateLogs', {
          retention: logs.RetentionDays.ONE_MONTH,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        }),
        level: sfn.LogLevel.ERROR,
      },
      tracingEnabled: false,
    })

    props.artifacts.grantReadWrite(this.stateMachine)

    new scheduler.CfnSchedule(this, 'WeeklyRun', {
      // The data changes about once a week in season, so a run on a schedule is enough and nothing
      // else ever wakes the warehouse.
      scheduleExpression: props.schedule ?? 'cron(0 9 ? * TUE *)',
      scheduleExpressionTimezone: 'America/New_York',
      flexibleTimeWindow: { mode: 'OFF' },
      target: {
        arn: this.stateMachine.stateMachineArn,
        roleArn: this.schedulerRole().roleArn,
      },
    })

    // The warehouse answers only from inside the network. A migration therefore runs as a task
    // here, and the deployment workflow starts it through the AWS API rather than by reaching the
    // database. Nothing outside the network ever needs a route to it.
    const migrate = this.taskDefinition('Migrate', 'migrate', {})

    // What the workflow has to name to start that task. They are published rather than printed,
    // because a workflow can read a parameter without being told the name of a stack.
    const subnets = props.vpc.selectSubnets({ subnetType: ec2.SubnetType.PUBLIC })
    const handles: Record<string, string> = {
      'cluster-arn': this.cluster.clusterArn,
      'migrate-task-arn': migrate.taskDefinitionArn,
      'subnet-ids': subnets.subnetIds.join(','),
      'security-group-id': this.taskSecurityGroup.securityGroupId,
    }
    for (const [name, value] of Object.entries(handles)) {
      new ssm.StringParameter(this, `Pipeline${name}`, {
        parameterName: `/ohfootball/pipeline/${name}`,
        stringValue: value,
      })
    }

    new cdk.CfnOutput(this, 'PipelineArn', { value: this.stateMachine.stateMachineArn })
    for (const [name, repository] of Object.entries(this.repositories)) {
      new cdk.CfnOutput(this, `${name}RepositoryUri`, { value: repository.repositoryUri })
    }
  }

  /**
   * Builds one step of the pipeline: a registry to push the image to, a task to run it, and the
   * state that waits for it to finish.
   */
  private runTask(
    id: string,
    image: string,
    environment: Record<string, string>,
    options: StepOptions = {},
  ): tasks.EcsRunTask {
    const definition = this.taskDefinition(id, image, environment, options)
    return new tasks.EcsRunTask(this, id, {
      cluster: this.cluster,
      taskDefinition: definition,
      launchTarget: new tasks.EcsFargateLaunchTarget({
        platformVersion: ecs.FargatePlatformVersion.LATEST,
      }),
      // A public address is what replaces a NAT gateway. Without it a task in a public subnet
      // cannot pull its image or reach anything outside the network.
      assignPublicIp: true,
      subnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroups: [this.taskSecurityGroup],
      // The pipeline waits for the task to finish rather than starting it and moving on.
      integrationPattern: sfn.IntegrationPattern.RUN_JOB,
      taskTimeout: sfn.Timeout.duration(options.timeout ?? STEP_TIMEOUT),
      resultPath: sfn.JsonPath.DISCARD,
    })
  }

  /** Builds a registry to push an image to, and the task that runs it. */
  private taskDefinition(
    id: string,
    image: string,
    environment: Record<string, string>,
    options: StepOptions = {},
  ): ecs.FargateTaskDefinition {
    const repository = new ecr.Repository(this, `${id}Repository`, {
      repositoryName: `ohfootball/${image}`,
      imageScanOnPush: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: true,
      lifecycleRules: [{ maxImageCount: 10 }],
    })
    this.repositories[id] = repository

    const definition = new ecs.FargateTaskDefinition(this, `${id}Task`, {
      cpu: 1024,
      memoryLimitMiB: 2048,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    })

    const secret = this.props.warehouse.secret!
    definition.addContainer('Main', {
      image: ecs.ContainerImage.fromEcrRepository(repository, 'latest'),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: id, logGroup: this.logGroup }),
      environment: {
        ...this.warehouseEnvironment(),
        ...environment,
      },
      // The warehouse password has to stay out of the template. Everything reading it takes it the
      // way libpq does, so the connection string beside it carries no password. A step that reads
      // something else out of a secret names it here, and reads the warehouse the same way.
      secrets: {
        PGPASSWORD: ecs.Secret.fromSecretsManager(secret, 'password'),
        DBT_PASSWORD: ecs.Secret.fromSecretsManager(secret, 'password'),
        ...options.secrets,
      },
      command: options.command,
    })

    this.props.artifacts.grantReadWrite(definition.taskRole)
    this.props.raw.grantReadWrite(definition.taskRole)

    return definition
  }

  /** The parts of the connection every task needs, with the password left out. */
  private warehouseEnvironment(): Record<string, string> {
    const host = this.props.warehouse.clusterEndpoint.hostname
    const port = String(WAREHOUSE_PORT)
    return {
      PGHOST: host,
      PGPORT: port,
      PGUSER: WAREHOUSE_USERNAME,
      PGDATABASE: WAREHOUSE_DATABASE,
      PGSSLMODE: 'require',
      DATABASE_URL: `postgres://${WAREHOUSE_USERNAME}@${host}:${port}/${WAREHOUSE_DATABASE}?sslmode=require`,
      DBT_HOST: host,
      DBT_PORT: port,
      DBT_USER: WAREHOUSE_USERNAME,
      DBT_DATABASE: WAREHOUSE_DATABASE,
      DBT_SCHEMA: 'ohfootball_stg',
      DBT_PROFILES_DIR: '/usr/app',
    }
  }

  private schedulerRole(): iam.Role {
    const role = new iam.Role(this, 'SchedulerRole', {
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
    })
    this.stateMachine.grantStartExecution(role)
    return role
  }
}
