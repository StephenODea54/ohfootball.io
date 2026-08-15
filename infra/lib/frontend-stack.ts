import * as cdk from 'aws-cdk-lib'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as ssm from 'aws-cdk-lib/aws-ssm'
import { Construct } from 'constructs'
import { SiteDomain, domainSettings, pointDomainAt } from './site-domain'

export interface FrontendStackProps extends cdk.StackProps {
  readonly domain?: SiteDomain
}

/**
 * The site.
 *
 * Every page is built ahead of time and written to the bucket, so a visitor reads a file and
 * nothing runs to answer them. The bucket stays closed to the public and is read only by the
 * distribution.
 */
export class FrontendStack extends cdk.Stack {
  readonly bucket: s3.Bucket
  readonly distribution: cloudfront.Distribution

  constructor(scope: Construct, id: string, props: FrontendStackProps = {}) {
    super(scope, id, props)

    this.bucket = new s3.Bucket(this, 'Site', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    })

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: 'ohfootball.io',
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
      },
      // The router draws a page the build did not write, so a path the bucket does not hold is
      // answered with the application rather than with an error from the bucket.
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
      ],
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      ...domainSettings(this, props.domain),
    })

    pointDomainAt(this, this.distribution, props.domain)

    // The pipeline writes the built site here and then clears the distribution. It reads both
    // names from here rather than through a stack reference.
    new ssm.StringParameter(this, 'SiteBucketParameter', {
      parameterName: '/ohfootball/site/bucket-name',
      stringValue: this.bucket.bucketName,
    })
    new ssm.StringParameter(this, 'SiteDistributionParameter', {
      parameterName: '/ohfootball/site/distribution-id',
      stringValue: this.distribution.distributionId,
    })

    new cdk.CfnOutput(this, 'SiteBucket', { value: this.bucket.bucketName })
    new cdk.CfnOutput(this, 'SiteUrl', {
      value: `https://${props.domain?.domainName ?? this.distribution.distributionDomainName}`,
    })
    new cdk.CfnOutput(this, 'SiteDistributionId', {
      value: this.distribution.distributionId,
    })
  }
}
