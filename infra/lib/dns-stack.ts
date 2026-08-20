import * as cdk from 'aws-cdk-lib'
import * as route53 from 'aws-cdk-lib/aws-route53'
import { Construct } from 'constructs'

/** The name the site answers on. */
export const SITE_DOMAIN = 'ohfootball.io'

/** The name the API answers on. */
export const API_DOMAIN = `api.${SITE_DOMAIN}`

/**
 * The hosted zone every name of the project is written into.
 *
 * This stack is deployed first and on its own. The registrar has to be told to hand the domain to
 * the four nameservers of this zone, and that is done by hand because the nameservers of a domain
 * are held by the registrar and not by AWS. Until that is done the zone answers nobody, and a
 * certificate cannot be issued, because a certificate is validated by a record read over the
 * public internet.
 *
 * Read the nameservers after the first deployment:
 *
 *     id=$(aws route53 list-hosted-zones-by-name --dns-name ohfootball.io \
 *       --query 'HostedZones[0].Id' --output text)
 *     aws route53 get-hosted-zone --id "$id" --query 'DelegationSet.NameServers' --output text
 *
 * Then check the registrar carries them:
 *
 *     dig +short NS ohfootball.io
 *
 * Route 53 is a global service, so the region this stack is deployed to does not reach the zone.
 */
export class DnsStack extends cdk.Stack {
  readonly zone: route53.PublicHostedZone

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    this.zone = new route53.PublicHostedZone(this, 'Zone', { zoneName: SITE_DOMAIN })

    // The zone outlives every stack that writes a record into it. Taking it down would mint a new
    // set of nameservers on the way back, and the domain would answer nobody until the registrar
    // is told the new four.
    this.zone.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN)
  }
}
