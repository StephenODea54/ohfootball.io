import * as acm from 'aws-cdk-lib/aws-certificatemanager'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as route53 from 'aws-cdk-lib/aws-route53'
import * as targets from 'aws-cdk-lib/aws-route53-targets'
import { Construct } from 'constructs'

/**
 * A name to serve a distribution under.
 *
 * The certificate is read by its ARN and the zone by its id, so a synth needs no account and no
 * network. A certificate for a distribution has to live in us-east-1, wherever the rest of the
 * stack lives.
 */
export interface SiteDomain {
  readonly domainName: string
  readonly certificateArn: string
  /** Set both to have the stack write the record. Leave them out to point the name by hand. */
  readonly hostedZoneId?: string
  readonly zoneName?: string
}

/** Reads a domain out of stack context. Returns undefined when the keys are absent. */
export function domainFromContext(scope: Construct, prefix: string): SiteDomain | undefined {
  const domainName = scope.node.tryGetContext(`${prefix}DomainName`)
  const certificateArn = scope.node.tryGetContext(`${prefix}CertificateArn`)
  if (!domainName || !certificateArn) {
    return undefined
  }
  return {
    domainName,
    certificateArn,
    hostedZoneId: scope.node.tryGetContext(`${prefix}HostedZoneId`),
    zoneName: scope.node.tryGetContext(`${prefix}ZoneName`),
  }
}

/**
 * Returns the distribution settings that carry a domain, or nothing when there is no domain.
 *
 * The lowest protocol version is set here rather than beside the distribution, because it only
 * takes effect against a certificate of our own. A distribution on the default certificate carries
 * a policy that cannot be changed, and setting the version there is ignored.
 */
export function domainSettings(scope: Construct, domain?: SiteDomain) {
  if (!domain) {
    return {}
  }
  return {
    domainNames: [domain.domainName],
    certificate: acm.Certificate.fromCertificateArn(scope, 'Certificate', domain.certificateArn),
    minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
  }
}

/**
 * Points the domain at the distribution. Does nothing without a hosted zone, which lets a domain
 * held somewhere other than Route 53 still serve the distribution.
 */
export function pointDomainAt(
  scope: Construct,
  distribution: cloudfront.IDistribution,
  domain?: SiteDomain,
): void {
  if (!domain?.hostedZoneId || !domain.zoneName) {
    return
  }
  const zone = route53.HostedZone.fromHostedZoneAttributes(scope, 'Zone', {
    hostedZoneId: domain.hostedZoneId,
    zoneName: domain.zoneName,
  })
  new route53.ARecord(scope, 'AliasRecord', {
    zone,
    recordName: domain.domainName,
    target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
  })
}
