#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib'
import { BackendStack } from '../lib/backend-stack'
import { FrontendStack } from '../lib/frontend-stack'
import { InfraStack } from '../lib/infra-stack'
import { domainFromContext } from '../lib/site-domain'

const app = new cdk.App()

// Left unset, every stack builds without an account and a synth needs no credentials. The pipeline
// sets both from the runner.
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
}

const siteDomain = domainFromContext(app, 'site')
const apiDomain = domainFromContext(app, 'api')

const infra = new InfraStack(app, 'OhfootballInfra', { env })

new FrontendStack(app, 'OhfootballFrontend', { env, domain: siteDomain })

new BackendStack(app, 'OhfootballBackend', {
  env,
  artifacts: infra.artifacts,
  codeKey: app.node.tryGetContext('apiCodeKey') ?? 'api/bootstrap.zip',
  // The API answers the built site. Without a domain the distribution name is not known until the
  // site stack is deployed, so the browser is told to expect any origin until one is set.
  siteOrigin: siteDomain ? `https://${siteDomain.domainName}` : '*',
  domain: apiDomain,
})

cdk.Tags.of(app).add('project', 'ohfootball.io')
