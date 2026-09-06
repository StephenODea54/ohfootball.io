import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'

/**
 * Every fixed name of the project.
 *
 * A name is written here rather than passed in context or published as a parameter. The workflows
 * read the same names, so a name that changes here changes in `.github/workflows` as well.
 */

/** The name the site answers on. */
export const SITE_DOMAIN = 'ohfootball.io'

/** The name the API answers on. */
export const API_DOMAIN = `api.${SITE_DOMAIN}`

/** Where the browser sends its queries. The site is built against this. */
export const API_GRAPHQL_URL = `https://${API_DOMAIN}/graphql`

/** Repository the workflows run from, as owner/name. */
export const REPOSITORY = 'StephenODea54/ohfootball.io'

/** Where GitHub signs the token a workflow presents. */
export const GITHUB_ISSUER = 'token.actions.githubusercontent.com'

/** Key of the API package inside the artifact bucket. */
export const API_CODE_KEY = 'api/bootstrap.zip'

/** The API function. The pipeline names it to replace its code. */
export const API_FUNCTION = 'ohfootball-api'

/** When the weekly run starts, as a cron the scheduler understands. */
export const PIPELINE_SCHEDULE = 'cron(0 9 ? * TUE *)'

/** The state machine that applies the migrations. The migrate workflow starts it by this name. */
export const MIGRATION_STATE_MACHINE = 'ohfootball-migrate'

/**
 * Where the id of the site distribution is published.
 *
 * This is the one parameter the project keeps. A distribution is given its id when it is created,
 * so the id cannot be written down ahead of time the way every other name here can, and the
 * pipeline needs it to clear the cache.
 */
export const SITE_DISTRIBUTION_PARAMETER = '/ohfootball/site/distribution-id'

/**
 * Buckets are named across the whole of S3 rather than inside one account, so each carries the
 * account it belongs to. The account is read from the stack and not from context.
 */
export function bucketName(scope: Construct, name: string): string {
  return `ohfootball-${name}-${cdk.Stack.of(scope).account}`
}

/**
 * The provider that lets STS trust a token GitHub signed.
 *
 * An account holds one provider for each issuer, so this one is shared by every project in the
 * account and is created beside the bootstrap rather than by a stack. The ARN carries nothing
 * generated, so it is built here instead of being looked up.
 */
export function githubProviderArn(scope: Construct): string {
  return cdk.Arn.format(
    { region: '', service: 'iam', resource: 'oidc-provider', resourceName: GITHUB_ISSUER },
    cdk.Stack.of(scope),
  )
}

/** The state machine that applies the migrations, named without reading the stack that owns it. */
export function migrationStateMachineArn(scope: Construct): string {
  return cdk.Arn.format(
    {
      service: 'states',
      resource: 'stateMachine',
      resourceName: MIGRATION_STATE_MACHINE,
      arnFormat: cdk.ArnFormat.COLON_RESOURCE_NAME,
    },
    cdk.Stack.of(scope),
  )
}
