import * as cdk from 'aws-cdk-lib'
import { Template } from 'aws-cdk-lib/assertions'
import { API_DOMAIN, DnsStack, SITE_DOMAIN } from '../lib/dns-stack'

function build(): Template {
  return Template.fromStack(new DnsStack(new cdk.App(), 'Dns'))
}

describe('the zone', () => {
  test('carries the domain of the site', () => {
    build().hasResourceProperties('AWS::Route53::HostedZone', { Name: `${SITE_DOMAIN}.` })
  })

  // Taking the zone down mints a new set of nameservers on the way back, and the domain answers
  // nobody until the registrar is told the new four. Keeping it is what makes a rebuild safe.
  test('is kept when the stack is taken down', () => {
    const zone = Object.values(build().findResources('AWS::Route53::HostedZone'))[0]
    expect(zone.DeletionPolicy).toBe('Retain')
    expect(zone.UpdateReplacePolicy).toBe('Retain')
  })

  test('holds one zone and nothing else', () => {
    build().resourceCountIs('AWS::Route53::HostedZone', 1)
  })
})

describe('the names', () => {
  test('put the API under the domain of the site', () => {
    expect(API_DOMAIN).toBe(`api.${SITE_DOMAIN}`)
  })
})
