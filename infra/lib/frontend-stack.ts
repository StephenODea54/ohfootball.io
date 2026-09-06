import * as cdk from 'aws-cdk-lib'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as ssm from 'aws-cdk-lib/aws-ssm'
import { Construct } from 'constructs'
import { SITE_DISTRIBUTION_PARAMETER, bucketName } from './names'
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
      // The step that writes the built site names the bucket, so the name is set rather than
      // generated.
      bucketName: bucketName(this, 'site'),
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
      // Every page the site has is written as a file, so an address the bucket does not hold is an
      // address the site does not have. The reply carries the application, which draws its own not
      // found page, and it carries 404 so that a crawler is told the truth. A closed bucket answers
      // a missing key with 403, so that is answered the same way.
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 404,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 404,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
      ],
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      ...domainSettings(this, props.domain),
    })

    pointDomainAt(this, this.distribution, props.domain)

    // A distribution is given its id when it is created, so the id cannot be written down ahead of
    // time the way the bucket name can. The pipeline clears the cache and needs it, so this one
    // name is published and every other one the pipeline uses is fixed.
    new ssm.StringParameter(this, 'SiteDistributionParameter', {
      parameterName: SITE_DISTRIBUTION_PARAMETER,
      stringValue: this.distribution.distributionId,
    })
  }
}
