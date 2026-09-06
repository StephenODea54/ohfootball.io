import * as cdk from 'aws-cdk-lib'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as s3 from 'aws-cdk-lib/aws-s3'
import { Construct } from 'constructs'
import { API_FUNCTION } from './names'
import { SiteDomain, domainSettings, pointDomainAt } from './site-domain'

export interface BackendStackProps extends cdk.StackProps {
  /** Holds the deployment package. */
  readonly artifacts: s3.IBucket
  /**
   * Key of the package inside that bucket.
   *
   * The pipeline writes this key and the stack reads it, so both settle on one object rather than
   * overwriting each other. The object has to exist before the first deployment of this stack.
   */
  readonly codeKey: string
  /** Origin the browser calls the API from. */
  readonly siteOrigin: string
  readonly domain?: SiteDomain
}

/**
 * The public API.
 *
 * The function reads a SQLite snapshot that ships inside its own package, so it holds no database
 * connection and needs no place on the network. That leaves it with no subnet, no security group,
 * and no network interface to build before it can answer.
 *
 * The function URL answers only to signed requests, and only the distribution can sign one. That
 * keeps the generated URL from being called around the distribution.
 */
export class BackendStack extends cdk.Stack {
  readonly distribution: cloudfront.Distribution

  constructor(scope: Construct, id: string, props: BackendStackProps) {
    super(scope, id, props)

    const api = new lambda.Function(this, 'Api', {
      // The pipeline replaces the code of this function every week and names it to do so, so the
      // name is set rather than generated.
      functionName: API_FUNCTION,
      runtime: lambda.Runtime.PROVIDED_AL2023,
      architecture: lambda.Architecture.ARM_64,
      handler: 'bootstrap',
      code: lambda.Code.fromBucket(props.artifacts, props.codeKey),
      memorySize: 512,
      // A request reads a local file, so it finishes quickly. The allowance covers a cold start
      // that has to read the snapshot for the first time.
      timeout: cdk.Duration.seconds(30),
      logGroup: new logs.LogGroup(this, 'ApiLogs', {
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      environment: {
        CORS_ORIGIN: props.siteOrigin,
        SNAPSHOT_PATH: '/var/task/ohfootball.db',
      },
    })

    const url = api.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.AWS_IAM,
      invokeMode: lambda.InvokeMode.BUFFERED,
    })

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: 'ohfootball.io GraphQL API',
      defaultBehavior: {
        origin: origins.FunctionUrlOrigin.withOriginAccessControl(url),
        // GraphQL asks over POST, and no distribution caches a POST. The cache is switched off
        // rather than left to look like it does something.
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        // The distribution signs what it forwards, so the host header has to stay behind.
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      ...domainSettings(this, props.domain),
    })

    pointDomainAt(this, this.distribution, props.domain)
  }
}
