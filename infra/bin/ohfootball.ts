#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib'
import { BackendStack } from '../lib/backend-stack'
import { DnsStack } from '../lib/dns-stack'
import { EtlStack } from '../lib/etl-stack'
import { FrontendStack } from '../lib/frontend-stack'
import { InfraStack } from '../lib/infra-stack'
import { API_CODE_KEY } from '../lib/names'
import { SecretsStack } from '../lib/secrets-stack'
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

// Deployed first and on its own. Every certificate is validated by a record in this zone, so the
// registrar has to hand the domain over before anything that carries a name can be raised.
new DnsStack(app, 'OhfootballDns', { env })

const infra = new InfraStack(app, 'OhfootballInfra', { env })

// Raised empty and filled by hand. Nothing else here holds a credential.
const secrets = new SecretsStack(app, 'OhfootballSecrets', { env })

new FrontendStack(app, 'OhfootballFrontend', { env, domain: siteDomain })

new BackendStack(app, 'OhfootballBackend', {
  env,
  artifacts: infra.artifacts,
  codeKey: API_CODE_KEY,
  // The API answers the built site. Without a domain the distribution name is not known until the
  // site stack is deployed, so the browser is told to expect any origin until one is set.
  siteOrigin: siteDomain ? `https://${siteDomain.domainName}` : '*',
  domain: apiDomain,
})

// The pipeline reads the API and the site through parameters those stacks publish, so it depends
// on the shared base and on nothing else.
const etl = new EtlStack(app, 'OhfootballEtl', {
  env,
  vpc: infra.vpc,
  warehouse: infra.warehouse,
  artifacts: infra.artifacts,
  raw: infra.raw,
  codeKey: API_CODE_KEY,
})

// A pipeline task reads a secret by name, and a name resolves to nothing until the secret exists.
// The order is stated here rather than left to chance, and it adds no reference between the two, so
// either can still change alone.
etl.addDependency(secrets)

cdk.Tags.of(app).add('project', 'ohfootball.io')
