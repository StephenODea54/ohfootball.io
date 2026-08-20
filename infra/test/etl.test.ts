import * as cdk from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { EtlStack } from '../lib/etl-stack'
import { InfraStack } from '../lib/infra-stack'

/**
 * The body of the state machine is assembled from pieces, because the names it carries are only
 * known once the stack is deployed. This puts the pieces back together so a test can read it.
 */
function definitionOf(template: Template): string {
  const machines = Object.values(template.findResources('AWS::StepFunctions::StateMachine'))
  const pieces: unknown[] = machines[0].Properties.DefinitionString['Fn::Join'][1]
  return pieces.map((piece) => (typeof piece === 'string' ? piece : JSON.stringify(piece))).join('')
}

function build(): { template: Template; raw: string; definition: string } {
  const app = new cdk.App()
  const infra = new InfraStack(app, 'Infra')
  const etl = new EtlStack(app, 'Etl', {
    vpc: infra.vpc,
    warehouse: infra.warehouse,
    artifacts: infra.artifacts,
    raw: infra.raw,
    codeKey: 'api/bootstrap.zip',
  })
  const template = Template.fromStack(etl)
  return {
    template,
    raw: JSON.stringify(template.toJSON()),
    definition: definitionOf(template),
  }
}

describe('the pipeline tasks', () => {
  // A task without a public address cannot pull its image, reach the site it scrapes, or read a
  // secret, and the only other way to give it those is a NAT gateway.
  test('carry a public address instead of a NAT gateway', () => {
    expect(build().definition).toContain('"AssignPublicIp":"ENABLED"')
  })

  test('run on arm64', () => {
    build().template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      RuntimePlatform: { CpuArchitecture: 'ARM64', OperatingSystemFamily: 'LINUX' },
    })
  })

  // The template is stored and read by anyone who can read the stack, so the password may only
  // ever arrive as a reference to the secret.
  test('read the warehouse password from the secret rather than from the template', () => {
    const { template } = build()
    const definitions = Object.values(template.findResources('AWS::ECS::TaskDefinition'))
    expect(definitions.length).toBeGreaterThan(0)
    for (const definition of definitions) {
      const container = definition.Properties.ContainerDefinitions[0]
      const names = container.Secrets.map((each: { Name: string }) => each.Name)
      expect(names).toContain('PGPASSWORD')
      expect(names).toContain('DBT_PASSWORD')
    }
  })

  test('carry a connection string that holds no password', () => {
    const { template } = build()
    const definitions = Object.values(template.findResources('AWS::ECS::TaskDefinition'))
    for (const definition of definitions) {
      const container = definition.Properties.ContainerDefinitions[0]
      const url = container.Environment.find(
        (each: { Name: string }) => each.Name === 'DATABASE_URL',
      )
      expect(JSON.stringify(url)).not.toContain('resolve:secretsmanager')
      expect(JSON.stringify(url)).toContain('sslmode=require')
    }
  })

  test('have a registry each to be pushed to', () => {
    // Six for the run, plus the one the migration task uses.
    build().template.resourceCountIs('AWS::ECR::Repository', 7)
  })
})

describe('the warehouse rule', () => {
  // Written in this stack rather than through the connections of the warehouse. The other way puts
  // the rule in the stack that owns the warehouse, and the two stacks then wait on each other.
  test('is held by the pipeline stack and names a port', () => {
    build().template.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
      IpProtocol: 'tcp',
      FromPort: 5432,
      ToPort: 5432,
    })
  })
})

describe('the run', () => {
  test('collects, rebuilds, rates, packages, publishes, builds, clears, and shares in order', () => {
    const { definition } = build()
    const order = [
      'Scrape',
      'Transform',
      'Rate',
      'Package',
      'PublishApi',
      'BuildSite',
      'ClearCache',
      'PublishDataset',
    ]
    const positions = order.map((state) => definition.indexOf(`"${state}"`))
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect([...positions].sort((left, right) => left - right)).toEqual(positions)
  })

  test('waits for each task rather than starting it and moving on', () => {
    expect(build().definition).toContain('ecs:runTask.sync')
  })

  test('starts on a schedule and at no other time', () => {
    build().template.hasResourceProperties('AWS::Scheduler::Schedule', {
      FlexibleTimeWindow: { Mode: 'OFF' },
      ScheduleExpression: 'cron(0 9 ? * TUE *)',
      ScheduleExpressionTimezone: 'America/New_York',
    })
  })

  // A step that runs long has stopped making progress rather than being slow, and a run that waits
  // hours to find that out holds the warehouse awake while it waits. The two steps allowed longer
  // are the ones whose work is not bounded by the week: drawing every page of the site, and sending
  // the dataset to a service this project does not own.
  test('gives up on a task that never finishes', () => {
    const { definition } = build()
    const allowed: Record<string, number> = {
      Scrape: 900,
      Transform: 900,
      Rate: 900,
      Package: 900,
      BuildSite: 7200,
      PublishDataset: 1800,
    }
    for (const [state, seconds] of Object.entries(allowed)) {
      const start = definition.indexOf(`"${state}":{`)
      expect(start).toBeGreaterThan(0)
      const found = /"TimeoutSeconds":(\d+)/.exec(definition.slice(start))
      expect(found).not.toBeNull()
      expect(Number(found![1])).toEqual(seconds)
    }
  })
})

describe('the things the run changes', () => {
  // Reading these through a stack reference would tie the stacks together, and a reference has to
  // be undone before either side can change.
  test('are read from parameters rather than from another stack', () => {
    const { template, raw } = build()
    for (const name of [
      '/ohfootball/api/function-name',
      '/ohfootball/site/bucket-name',
      '/ohfootball/site/distribution-id',
    ]) {
      template.hasParameter('*', {
        Type: 'AWS::SSM::Parameter::Value<String>',
        Default: name,
      })
    }
    // What this stack does read from another stack is the shared base, and only the shared base.
    const imports = raw.match(/"Fn::ImportValue":"[^"]+"/g) ?? []
    expect(imports.length).toBeGreaterThan(0)
    for (const each of imports) {
      expect(each).toContain('Infra:')
    }
  })

  test('include replacing the code of the API', () => {
    const { definition } = build()
    expect(definition).toContain('lambda:updateFunctionCode')
    expect(definition).toContain('cloudfront:createInvalidation')
  })
})

// The dataset is published out of the same marts the site was built from, and it is published last
// so a Kaggle outage costs the dataset and not the site.
describe('the published dataset', () => {
  // The image of a container is a reference to the registry it is pulled from rather than a name,
  // so a container is found by the step that owns it.
  function containersOf(template: Template, step: string): Record<string, any>[] {
    return Object.entries(template.findResources('AWS::ECS::TaskDefinition'))
      .filter(([id]) => id.startsWith(`${step}Task`))
      .map(([, definition]) => definition.Properties.ContainerDefinitions[0])
  }

  function containerOf(template: Template, step: string): Record<string, any> {
    const found = containersOf(template, step)
    expect(found).toHaveLength(1)
    return found[0]
  }

  test('is the last thing the run does', () => {
    const { definition } = build()
    const positions = ['ClearCache', 'PublishDataset'].map((state) =>
      definition.indexOf(`"${state}"`),
    )
    expect(positions[0]).toBeGreaterThan(0)
    expect(positions[1]).toBeGreaterThan(positions[0])
  })

  // The account, its token, and the name of the dataset are all read from the secret. None of the
  // three may be written into the template, which anyone who can read the stack can read.
  test('reads the Kaggle account from a secret and never from the template', () => {
    const { template } = build()
    const container = containerOf(template, 'PublishDataset')
    const secrets = container.Secrets.map((each: { Name: string }) => each.Name)
    const environment = container.Environment.map((each: { Name: string }) => each.Name)
    for (const name of ['KAGGLE_USERNAME', 'KAGGLE_KEY', 'KAGGLE_DATASET']) {
      expect(secrets).toContain(name)
      expect(environment).not.toContain(name)
    }
  })

  // A task reads one key out of the secret, and that needs the whole ARN including the suffix the
  // secret was given when it was created. The suffix cannot be written here, so the ARN is read
  // from a parameter, the same way the names of the API and the site are read.
  test('is told which secret to read by a parameter', () => {
    const { template, raw } = build()
    template.hasParameter('*', {
      Type: 'AWS::SSM::Parameter::Value<String>',
      Default: '/ohfootball/kaggle/secret-arn',
    })
    // A grant on part of an ARN ends in the wildcard CDK adds for a secret it only knows by name.
    expect(raw).not.toContain('-??????')
  })

  // The secret is created by hand, so nothing here may try to own it. A stack that created it
  // would put the credential in a template.
  test('reads a secret this stack does not create', () => {
    build().template.resourceCountIs('AWS::SecretsManager::Secret', 0)
  })

  test('is published by a task that can still read the warehouse', () => {
    const { template } = build()
    const container = containerOf(template, 'PublishDataset')
    const secrets = container.Secrets.map((each: { Name: string }) => each.Name)
    expect(secrets).toContain('PGPASSWORD')
    expect(container.Command).toEqual(['publish'])
  })

  // The extra secrets belong to the one step that asked for them.
  test('leaves the Kaggle account out of every other task', () => {
    const { template } = build()
    const others = Object.entries(template.findResources('AWS::ECS::TaskDefinition'))
      .filter(([id]) => !id.startsWith('PublishDatasetTask'))
      .map(([, definition]) => definition.Properties.ContainerDefinitions[0])
    expect(others).toHaveLength(6)
    for (const container of others) {
      const secrets = container.Secrets.map((each: { Name: string }) => each.Name)
      expect(secrets).not.toContain('KAGGLE_KEY')
      expect(secrets).not.toContain('KAGGLE_USERNAME')
      expect(secrets).not.toContain('KAGGLE_DATASET')
    }
  })

  test('is tried again when Kaggle refuses once', () => {
    const { definition } = build()
    const state = definition.slice(definition.indexOf('"PublishDataset"'))
    expect(state).toContain('"MaxAttempts":2')
    expect(state).toContain('"States.TaskFailed"')
  })
})

// The warehouse answers only from inside the network, so nothing outside can migrate it. The task
// runs inside, and the deployment workflow starts it through the AWS API.
describe('the migration task', () => {
  test('exists as a task rather than as a step of the run', () => {
    const { template, definition } = build()
    // Six tasks the run waits for, plus this one, which only the deployment workflow starts.
    template.resourceCountIs('AWS::ECS::TaskDefinition', 7)
    // The weekly run rebuilds data. It does not change the shape of the warehouse.
    expect(definition).not.toContain('Migrate')
  })

  test('publishes what the workflow needs to start it', () => {
    const { template } = build()
    for (const name of ['cluster-arn', 'migrate-task-arn', 'subnet-ids', 'security-group-id']) {
      template.hasResourceProperties('AWS::SSM::Parameter', {
        Name: `/ohfootball/pipeline/${name}`,
      })
    }
  })
})

describe('the pipeline role', () => {
  test('lets the scheduler start the run and nothing else', () => {
    build().template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Principal: { Service: 'scheduler.amazonaws.com' },
            Action: 'sts:AssumeRole',
          }),
        ]),
      }),
    })
  })
})
