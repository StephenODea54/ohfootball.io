import * as cdk from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { BackendStack } from '../lib/backend-stack'
import { FrontendStack } from '../lib/frontend-stack'
import { InfraStack } from '../lib/infra-stack'
import { domainFromContext } from '../lib/site-domain'

interface Stacks {
  infra: Template
  backend: Template
  frontend: Template
}

function build(context: Record<string, string> = {}): Stacks {
  const app = new cdk.App({ context })
  const siteDomain = domainFromContext(app, 'site')
  const infra = new InfraStack(app, 'Infra')
  const frontend = new FrontendStack(app, 'Frontend', { domain: siteDomain })
  const backend = new BackendStack(app, 'Backend', {
    artifacts: infra.artifacts,
    codeKey: 'api/bootstrap.zip',
    siteOrigin: siteDomain ? `https://${siteDomain.domainName}` : '*',
    domain: domainFromContext(app, 'api'),
  })
  return {
    infra: Template.fromStack(infra),
    backend: Template.fromStack(backend),
    frontend: Template.fromStack(frontend),
  }
}

describe('the network', () => {
  // A NAT gateway costs more per month than everything else here put together. Nothing needs one,
  // because the pipeline tasks run in a public subnet and reach the internet through the internet
  // gateway. This is the single most expensive mistake the stack could make.
  test('carries no NAT gateway', () => {
    build().infra.resourceCountIs('AWS::EC2::NatGateway', 0)
  })

  test('carries a public subnet for the pipeline and an isolated subnet for the warehouse', () => {
    build().infra.resourceCountIs('AWS::EC2::Subnet', 4)
  })
})

describe('the warehouse', () => {
  // Without a minimum of zero the cluster never stops, and the whole reason for choosing this
  // engine goes away.
  test('scales down to nothing and pauses as soon as the service allows', () => {
    build().infra.hasResourceProperties('AWS::RDS::DBCluster', {
      ServerlessV2ScalingConfiguration: {
        MinCapacity: 0,
        MaxCapacity: 2,
        SecondsUntilAutoPause: 300,
      },
    })
  })

  test('is not reachable from outside the network', () => {
    build().infra.hasResourceProperties('AWS::RDS::DBInstance', {
      PubliclyAccessible: false,
    })
  })

  test('holds its data through a stack being torn down', () => {
    build().infra.hasResource('AWS::RDS::DBCluster', {
      DeletionPolicy: 'Retain',
      Properties: Match.objectLike({ DeletionProtection: true, StorageEncrypted: true }),
    })
  })
})

describe('the API', () => {
  // The function reads a snapshot from its own package. Giving it a place on the network would add
  // a network interface to every cold start and buy nothing.
  test('has no place on the network', () => {
    const functions = build().backend.findResources('AWS::Lambda::Function')
    const api = Object.values(functions).filter((each) => each.Properties?.Handler === 'bootstrap')
    expect(api).toHaveLength(1)
    expect(api[0].Properties.VpcConfig).toBeUndefined()
  })

  test('runs on arm64 with room for a cold start to read the snapshot', () => {
    build().backend.hasResourceProperties('AWS::Lambda::Function', {
      Handler: 'bootstrap',
      Architectures: ['arm64'],
      Timeout: 30,
      MemorySize: 512,
    })
  })

  // An open function URL would let a caller go around the distribution.
  test('answers its function URL only for a signed request', () => {
    build().backend.hasResourceProperties('AWS::Lambda::Url', {
      AuthType: 'AWS_IAM',
      InvokeMode: 'BUFFERED',
    })
  })

  test('is reached through a distribution that signs what it forwards', () => {
    const backend = build().backend
    backend.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1)
    backend.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        DefaultCacheBehavior: Match.objectLike({
          ViewerProtocolPolicy: 'redirect-to-https',
        }),
      }),
    })
  })
})

describe('the site', () => {
  test('keeps its bucket closed to the public', () => {
    build().frontend.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    })
  })

  test('is read through an origin access control rather than a public bucket', () => {
    build().frontend.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1)
  })
})

describe('a domain', () => {
  const context = {
    siteDomainName: 'ohfootball.io',
    siteCertificateArn: 'arn:aws:acm:us-east-1:111111111111:certificate/abc',
    apiDomainName: 'api.ohfootball.io',
    apiCertificateArn: 'arn:aws:acm:us-east-1:111111111111:certificate/def',
  }

  test('is left off when the context does not carry one', () => {
    const distribution = Object.values(
      build().frontend.findResources('AWS::CloudFront::Distribution'),
    )[0]
    expect(distribution.Properties.DistributionConfig.Aliases).toBeUndefined()
  })

  test('is carried by both distributions when the context sets one', () => {
    const stacks = build(context)
    stacks.frontend.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({ Aliases: ['ohfootball.io'] }),
    })
    stacks.backend.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({ Aliases: ['api.ohfootball.io'] }),
    })
  })

  // Without a domain the browser cannot be told which origin to expect, because the name of the
  // distribution is not known until it is deployed.
  test('sets the origin the API answers for', () => {
    build(context).backend.hasResourceProperties('AWS::Lambda::Function', {
      Handler: 'bootstrap',
      Environment: { Variables: Match.objectLike({ CORS_ORIGIN: 'https://ohfootball.io' }) },
    })
  })
})

describe('the deployment role', () => {
  // Without the condition on the subject, a workflow in any repository anywhere could take this
  // role on and deploy into the account.
  test('is narrowed to one repository', () => {
    build().infra.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'ohfootball-deploy',
      AssumeRolePolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'sts:AssumeRoleWithWebIdentity',
            Condition: Match.objectLike({
              StringEquals: {
                'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
              },
              StringLike: {
                'token.actions.githubusercontent.com:sub': 'repo:StephenODea54/ohfootball.io:*',
              },
            }),
          }),
        ]),
      }),
    })
  })

  // An account holds one provider for each issuer, so the provider belongs to the account and is
  // created beside the bootstrap. Naming it rather than raising it is what keeps a second stack in
  // a second region from trying to create one that already exists.
  test('takes the provider the account already holds rather than raising one', () => {
    const infra = build().infra
    infra.resourceCountIs('Custom::AWSCDKOpenIdConnectProvider', 0)
    infra.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'ohfootball-deploy',
      AssumeRolePolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'sts:AssumeRoleWithWebIdentity',
            Condition: Match.objectLike({
              StringLike: {
                'token.actions.githubusercontent.com:sub':
                  'repo:StephenODea54/ohfootball.io:*',
              },
            }),
          }),
        ]),
      }),
    })
  })

  // The workflow publishes code. It has no reason to read the warehouse, and the warehouse answers
  // only from inside the network in any case.
  test('is given no way to read the warehouse or its password', () => {
    const policies = JSON.stringify(build().infra.findResources('AWS::IAM::Policy'))
    expect(policies).not.toContain('secretsmanager:')
    expect(policies).not.toContain('rds-db:connect')
    expect(policies).not.toContain('rds:')
  })
})
