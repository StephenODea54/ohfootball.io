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
  const body = machines[0].Properties.DefinitionString
  if (typeof body === 'string') {
    return body
  }
  const pieces = body['Fn::Join'][1] as unknown[]
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
      expect(JSON.stringify(url)).not.toContain('PGPASSWORD')
      expect(JSON.stringify(url)).toContain('sslmode=require')
    }
  })

  test('have a registry each to be pushed to', () => {
    build().template.resourceCountIs('AWS::ECR::Repository', 5)
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
  test('collects, rebuilds, rates, packages, publishes, builds, and clears in that order', () => {
    const { definition } = build()
    const order = ['Scrape', 'Transform', 'Rate', 'Package', 'PublishApi', 'BuildSite', 'ClearCache']
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

  test('gives up on a task that never finishes', () => {
    expect(build().definition).toContain('"TimeoutSeconds":7200')
  })
})

describe('the things the run changes', () => {
  // Reading these through a stack reference would tie the stacks together, and a reference has to
  // be undone before either side can change.
  test('are read from parameters rather than from another stack', () => {
    const { template, raw } = build()
    // Each name arrives as a parameter the deployment reads from the parameter store, rather than
    // as a value exported by the stack that owns it.
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
