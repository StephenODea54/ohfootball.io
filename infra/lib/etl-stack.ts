import * as cdk from 'aws-cdk-lib'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as ecr from 'aws-cdk-lib/aws-ecr'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as rds from 'aws-cdk-lib/aws-rds'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as scheduler from 'aws-cdk-lib/aws-scheduler'
import * as sfn from 'aws-cdk-lib/aws-stepfunctions'
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks'
import * as ssm from 'aws-cdk-lib/aws-ssm'
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

/** How long a single step may run before the pipeline gives up on it. */
const STEP_TIMEOUT = cdk.Duration.hours(2)

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
  readonly repositories: Record<string, ecr.Repository> = {}

  private readonly cluster: ecs.Cluster
  private readonly taskSecurityGroup: ec2.SecurityGroup
  private readonly logGroup: logs.LogGroup
  private readonly props: EtlStackProps

  constructor(scope: Construct, id: string, props: EtlStackProps) {
    super(scope, id, props)
    this.props = props

    this.cluster = new ecs.Cluster(this, 'Cluster', { vpc: props.vpc, containerInsightsV2: ecs.ContainerInsights.DISABLED })

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
    const transform = this.runTask('Transform', 'analytics', {}, ['build'])
    const rate = this.runTask('Rate', 'predictor', {}, ['run'])

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
    const buildSite = this.runTask('BuildSite', 'site', {
      SITE_BUCKET: siteBucketName,
      VITE_GRAPHQL_URL: apiUrl,
    })

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

    this.stateMachine = new sfn.StateMachine(this, 'Pipeline', {
      stateMachineType: sfn.StateMachineType.STANDARD,
      // A run wakes the warehouse, scrapes a site politely, and rebuilds every mart. Hours is the
      // right unit for the whole of it.
      timeout: cdk.Duration.hours(6),
      definitionBody: sfn.DefinitionBody.fromChainable(
        scrape.next(transform).next(rate).next(pack).next(publishApi).next(buildSite).next(clearCache),
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
    command?: string[],
  ): tasks.EcsRunTask {
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
      // The password is the only part that has to stay out of the template. Everything reading it
      // takes it the way libpq does, so the connection string beside it carries no password.
      secrets: {
        PGPASSWORD: ecs.Secret.fromSecretsManager(secret, 'password'),
        DBT_PASSWORD: ecs.Secret.fromSecretsManager(secret, 'password'),
      },
      command,
    })

    this.props.artifacts.grantReadWrite(definition.taskRole)
    this.props.raw.grantReadWrite(definition.taskRole)

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
      taskTimeout: sfn.Timeout.duration(STEP_TIMEOUT),
      resultPath: sfn.JsonPath.DISCARD,
    })
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
