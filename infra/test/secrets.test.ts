import * as cdk from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
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

  // A task reading one key out of a secret needs the whole ARN, suffix and all, and the suffix is
  // minted when the secret is created. Publishing it is what lets another stack name it.
  test('publish the whole ARN of each one as a parameter', () => {
    const { template } = build()
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/ohfootball/kaggle/secret-arn',
      Type: 'String',
      Value: Match.objectLike({ Ref: Match.stringLikeRegexp('KaggleSecret.*') }),
    })
  })

  // Every secret is named somewhere a reader can find it. A secret raised without a parameter is a
  // secret nothing can read one key out of.
  test('are published one parameter each, and every parameter names a secret of this stack', () => {
    const { template } = build()
    const secrets = Object.keys(template.findResources('AWS::SecretsManager::Secret'))
    const parameters = Object.values(template.findResources('AWS::SSM::Parameter'))
    expect(parameters).toHaveLength(secrets.length)
    const named = parameters.map((parameter) => parameter.Properties.Value.Ref)
    expect([...named].sort()).toEqual([...secrets].sort())
  })
})

// The parameter is the whole of the agreement between the two stacks. Nothing else ties them, so
// nothing else would catch the name being changed on one side only.
describe('the pipeline and the secrets', () => {
  test('agree on where the ARN of the Kaggle secret is published', () => {
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

    const published = Object.values(
      Template.fromStack(secrets).findResources('AWS::SSM::Parameter'),
    ).map((parameter) => parameter.Properties.Name)
    expect(published).toContain('/ohfootball/kaggle/secret-arn')

    // The name of the parameter the pipeline reads, and the reference CloudFormation gives it.
    const etlTemplate = Template.fromStack(etl)
    const entry = Object.entries(etlTemplate.toJSON().Parameters ?? {}).find(
      ([, parameter]: [string, any]) => published.includes(parameter.Default),
    )
    expect(entry).toBeDefined()
    const [reference] = entry!

    // Reading the parameter proves nothing on its own. What matters is that the ARN it carries is
    // what the publishing task is told to read its Kaggle account out of.
    const container = Object.entries(etlTemplate.findResources('AWS::ECS::TaskDefinition'))
      .filter(([id]) => id.startsWith('PublishDatasetTask'))
      .map(([, definition]) => definition.Properties.ContainerDefinitions[0])
    expect(container).toHaveLength(1)
    const kaggle = container[0].Secrets.filter((each: { Name: string }) =>
      each.Name.startsWith('KAGGLE_'),
    )
    expect(kaggle).toHaveLength(3)
    for (const secret of kaggle) {
      expect(JSON.stringify(secret.ValueFrom)).toContain(reference)
    }
  })
})
