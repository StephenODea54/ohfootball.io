# infra

The AWS stacks for ohfootball.io, written with the CDK.

## What is where

| Stack                 | Holds                                                          |
| --------------------- | -------------------------------------------------------------- |
| `OhfootballInfra`     | Network, Aurora Serverless v2 warehouse, raw and artifact buckets |
| `OhfootballBackend`   | The API function, its function URL, and the distribution in front |
| `OhfootballFrontend`  | The site bucket and the distribution in front of it              |

`OhfootballInfra` is the only stack the others read from. Nothing crosses between the backend and
the frontend, so each carries its own distribution and its own name.

## Two decisions that carry the cost

The network holds **no NAT gateway**. A NAT gateway costs more per month than the rest of this put
together. The pipeline tasks run in a public subnet with a public address and reach the internet
through the internet gateway, which is free. The warehouse sits in an isolated subnet and answers
only from inside the network. A test asserts the count of NAT gateways is zero.

The warehouse **scales down to nothing**. Its lowest capacity is zero and it pauses after five
minutes without work, which is the shortest the service allows. Only the weekly pipeline wakes it.
Waking takes about fifteen seconds, which a scheduled run can wait for.

Nothing may read the warehouse on a repeating schedule. A check that runs every minute keeps the
cluster awake and the bill runs as though it never paused. For the same reason, point an uptime
check at `/healthz` on the API rather than `/readyz`, because `/readyz` reads the store.

## The API function holds no database connection

It reads a SQLite snapshot that ships inside its own package, so it has no subnet, no security
group, and no network interface to build before it can answer.

## Deploying the first time

The stack reads the API package from a fixed key in the artifact bucket, and deliberately does not
record which version. The pipeline replaces the code once a week, and a recorded version would let
the next deployment of the stack put the older package back. Both settle on one object instead.

That leaves an ordering to respect. The object has to exist before `OhfootballBackend` is deployed
for the first time:

```sh
make -C ../services/api bootstrap      # builds bin/bootstrap for arm64
make -C ../services/api snapshot       # writes bin/ohfootball.db from the warehouse
cd ../services/api/bin && zip -9 bootstrap.zip bootstrap ohfootball.db
aws s3 cp bootstrap.zip "s3://$ARTIFACT_BUCKET/api/bootstrap.zip"
```

Then deploy in order, because the backend reads the artifact bucket from the infra stack:

```sh
npx cdk deploy OhfootballInfra
npx cdk deploy OhfootballBackend OhfootballFrontend
```

## Names

Both distributions run on their generated name until a domain is set. A certificate for a
distribution has to live in `us-east-1`, wherever the rest of the stack lives.

```sh
npx cdk deploy --all \
  -c siteDomainName=ohfootball.io \
  -c siteCertificateArn=arn:aws:acm:us-east-1:...:certificate/... \
  -c apiDomainName=api.ohfootball.io \
  -c apiCertificateArn=arn:aws:acm:us-east-1:...:certificate/...
```

Add `siteHostedZoneId` and `siteZoneName` (and the same pair for the API) to have the stack write
the alias record. Leave them out to point the name by hand, which is what a domain held somewhere
other than Route 53 needs.

Until a site domain is set, the API answers a browser from any origin, because the name of the site
distribution is not known until it is deployed.

## Working on it

```sh
pnpm install
pnpm test      # asserts the decisions above against the generated templates
pnpm synth     # needs no credentials
```

A synth reads no account and no network, so it runs anywhere. Only a deployment needs credentials.
