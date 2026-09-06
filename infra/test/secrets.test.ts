import * as cdk from 'aws-cdk-lib'
import { Template } from 'aws-cdk-lib/assertions'
import { EtlStack } from '../lib/etl-stack'
import { InfraStack } from '../lib/infra-stack'
import { SecretsStack } from '../lib/secrets-stack'

function build(): { template: Template; raw: string } {
  const app = new cdk.App()
  const secrets = new SecretsStack(app, 'Secrets')
  const template = Template.fromStack(secrets)
  return { template, raw: JSON.stringify(template.toJSON()) }
}

describe('the secrets', () => {
  // A template is stored by CloudFormation and read by anyone who can read the stack. The stack
  // raises the secret and never the value in it.
  test('are raised with nothing in any key', () => {
    const { template } = build()
    const secrets = Object.values(template.findResources('AWS::SecretsManager::Secret'))
    expect(secrets.length).toBeGreaterThan(0)
    for (const secret of secrets) {
      const generated = secret.Properties.GenerateSecretString
      expect(generated.GenerateStringKey).toBeTruthy()
      const keys = JSON.parse(generated.SecretStringTemplate)
      expect(Object.keys(keys).length).toBeGreaterThan(0)
      // Every key of the template holds nothing, whatever the secret is and whatever it is for.
      for (const [name, value] of Object.entries(keys)) {
        expect(value).toEqual('')
        expect(name).not.toEqual(generated.GenerateStringKey)
      }
      // A value written into the stack would arrive under this name instead.
      expect(secret.Properties.SecretString).toBeUndefined()
    }
  })

  test('name the Kaggle account, its token, and the dataset it owns', () => {
    build().template.hasResourceProperties('AWS::SecretsManager::Secret', {
      Name: 'ohfootball/kaggle',
      GenerateSecretString: {
        SecretStringTemplate: '{"username":"","dataset":""}',
        GenerateStringKey: 'key',
      },
    })
  })

  // A credential is held nowhere else. A stack removed by mistake may not take it away.
  test('are kept when the stack is taken down', () => {
    const { template } = build()
    const secrets = Object.values(template.findResources('AWS::SecretsManager::Secret'))
    expect(secrets.length).toBeGreaterThan(0)
    for (const secret of secrets) {
      expect(secret.DeletionPolicy).toEqual('Retain')
      expect(secret.UpdateReplacePolicy).toEqual('Retain')
    }
  })

  // Nothing here publishes anything. A stack that reads a secret names it, and the name is what
  // this stack sets, so there is no parameter and no output to keep in step with it.
  test('are published nowhere, because a reader names them', () => {
    const { template } = build()
    template.resourceCountIs('AWS::SSM::Parameter', 0)
    expect(template.toJSON().Outputs ?? {}).toEqual({})
  })
})

// The name is the whole of the agreement between the two stacks. Nothing else ties them, so
// nothing else would catch it being changed on one side only.
describe('the pipeline and the secrets', () => {
  test('agree on the name of the Kaggle secret', () => {
    const app = new cdk.App()
    const infra = new InfraStack(app, 'Infra')
    const secrets = new SecretsStack(app, 'Secrets')
    const etl = new EtlStack(app, 'Etl', {
      vpc: infra.vpc,
      warehouse: infra.warehouse,
      artifacts: infra.artifacts,
      raw: infra.raw,
      codeKey: 'api/bootstrap.zip',
    })

    const raised = Object.values(
      Template.fromStack(secrets).findResources('AWS::SecretsManager::Secret'),
    ).map((secret) => secret.Properties.Name)
    expect(raised).toContain('ohfootball/kaggle')

    // The pipeline names the secret in the grant it holds and in the value the task reads.
    const etlRaw = JSON.stringify(Template.fromStack(etl).toJSON())
    for (const name of raised) {
      expect(etlRaw).toContain(name)
    }
  })

  // The pipeline may not own the secret. A stack that raised it would put the credential in a
  // template, and two stacks would then raise the same name.
  test('leave the secret to the stack that raises it', () => {
    const app = new cdk.App()
    const infra = new InfraStack(app, 'Infra')
    const etl = new EtlStack(app, 'Etl', {
      vpc: infra.vpc,
      warehouse: infra.warehouse,
      artifacts: infra.artifacts,
      raw: infra.raw,
      codeKey: 'api/bootstrap.zip',
    })
    Template.fromStack(etl).resourceCountIs('AWS::SecretsManager::Secret', 0)
  })
})
