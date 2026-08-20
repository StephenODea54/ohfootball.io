# infra

The AWS stacks for ohfootball.io, written with the CDK.

## What is where

| Stack                 | Holds                                                             |
| --------------------- | ----------------------------------------------------------------- |
| `OhfootballDns`       | The hosted zone every name of the project is written into          |
| `OhfootballInfra`     | Network, Aurora Serverless v2 warehouse, raw and artifact buckets  |
| `OhfootballSecrets`   | Every secret of the project, raised empty and filled by hand        |
| `OhfootballBackend`   | The API function, its function URL, and the distribution in front  |
| `OhfootballFrontend`  | The site bucket and the distribution in front of it                |
| `OhfootballEtl`       | Registries, pipeline tasks, the weekly run, and its schedule       |

Every stack is deployed to `us-east-2`. The state the site describes is Ohio, so the state the
site runs in is Ohio.

`OhfootballDns` is deployed first and on its own, because the registrar has to hand the domain over
before any name can be served. See the section on names below.

`OhfootballInfra` is the only stack the others read from. Nothing crosses between the backend and
the frontend, so each carries its own distribution and its own name.

`OhfootballSecrets` is read by nobody. It publishes the ARN of each secret as a parameter, and a
stack that needs one reads the parameter. The pipeline is deployed after it, which is stated in
`bin/ohfootball.ts` and adds no reference between the two.

Every secret there is kept when the stack is taken down, because a credential is held nowhere else.
A secret therefore outlives its stack, and raising the stack again over a surviving secret of the
same name fails. Remove the survivor, or bring it into the stack with an import. A removal without
`--force-delete-without-recovery` holds the name for a recovery window of at least seven days, and
`restore-secret` is the way back inside it.

The pipeline changes the API and the site, and reads the name of each from a parameter that stack
publishes rather than through a stack reference. A reference has to be undone before either side
can change, and a parameter does not. The names are read when the pipeline stack is deployed, so a
function or a distribution that is replaced needs `OhfootballEtl` deployed again to be seen.

## The weekly run

    Scrape -> Transform -> Rate -> Package -> PublishApi -> BuildSite -> ClearCache
      -> PublishDataset

Each step but `PublishApi` and `ClearCache` is a container the pipeline waits for. `PublishApi` and
`ClearCache` call the service directly, so neither needs a container of its own.

Each container has a registry of its own under `ohfootball/`. The code pipeline pushes to them.
The images are built from `services/scraper/Dockerfile`, `analytics/Dockerfile`,
`services/elo/Dockerfile`, `services/api/cmd/snapshot/Dockerfile`, `frontend/Dockerfile`, and
`services/dataset/Dockerfile`.

`Package` writes the snapshot from the warehouse, fetches the binary the code pipeline last built,
and puts the two together. That split keeps a weekly data run from needing a Go toolchain, and
keeps a code change from needing the warehouse.

Only the password reaches a task from Secrets Manager. Everything else about the connection is
plain, and the connection string carries no password, so the tasks read it the way libpq does.

`PublishDataset` writes the marts out as CSV and publishes them to Kaggle as one dataset with a
version per run. It is last because nothing else in the run reads what it writes, so Kaggle being
down costs the publication of the dataset and not the publication of the site. It fails the
execution when Kaggle refuses, after two retries, and no alarm is raised anywhere in this stack, so
a failure shows in the history of the state machine and nowhere else.

The Kaggle account, its token, and the name of the dataset are held in one secret. The secrets
stack raises it with a key for each of the three and nothing in any of them, and publishes its ARN
as `/ohfootball/kaggle/secret-arn`. Reading one key out of a secret needs the whole ARN, including
the suffix minted when the secret was created, which is why the ARN is published rather than
written into a stack.

The values are written by hand once. A deployment that leaves the shape of the secret alone leaves
the values alone with it.

```sh
aws secretsmanager put-secret-value --secret-id ohfootball/kaggle \
  --secret-string '{"username":"...","key":"...","dataset":"owner/slug"}'
```

Changing the shape is different. CloudFormation writes a new version of a secret whenever the
property describing how to generate it changes, so adding a key to one of the secrets in
`secrets-stack.ts` puts the empty template back and the values written by hand are gone. Write them
again after any such change.

The pipeline reads the ARN when the pipeline stack is deployed. A secret that is ever recreated
carries a new suffix, and the tasks hold the old ARN until something changes the pipeline stack, so
a recreated secret needs `OhfootballEtl` deployed again.

The dataset does not have to exist. The first run creates it, public, under CC0-1.0, and every run
after that adds a version to it. A run against a secret still holding empty values fails when it
reaches Kaggle.

## The size of the site

Every page is drawn ahead of time, including one for each season a program has played. That is
about 39,500 team pages plus the four fixed routes, drawn from 55 seasons.

Measured against the current data, the build draws about 55 pages a second, so the whole site takes
roughly twelve minutes on a laptop and longer against an API across a network. The step is allowed
two hours, which is far longer than the fifteen minutes every other step of the run is given.
Drawing the site is the one step whose work grows with the record rather than with the week. A team page is about 110 KB and the whole site is about 4 GB, which costs around ten
cents a month to hold and twenty cents to write in full. The upload only sends what changed, so a
week that adds one round of games sends very little.

The leaderboard page is 3.5 MB, because it carries every team of the season twice, once as markup
and once as the data behind it. It is served compressed, but it is worth trimming.

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

## What deploys what

Two workflows publish code. Neither touches the data.

`checks.yml` runs the format, vet, and test gates for Go, Python, and the stacks on every pull
request. The pre-commit hook runs the same things, but it can be skipped and it only guards the
machine it runs on.

`deploy.yml` publishes on a merge to main. It builds the seven images and pushes them, builds the
arm64 binary and writes it to the artifact bucket, then deploys the five stacks. The weekly run
cannot do any of this itself: a task pulls its image before it starts, so it cannot build the image
it runs on, and it cannot build the binary it packs with the snapshot.

`migrate.yml` applies the migrations. It never connects to the warehouse, because nothing outside
the network can. It starts a task inside the network through the AWS API and waits for it. Every
migration is written to be applied again without harm, so the task applies all of them every time
and keeps no record of what ran. A migration that cannot be repeated needs a table recording what
has been applied, and `postgres/Dockerfile` would have to read it.

The workflows take on a role by presenting a token GitHub signed, so no key is stored anywhere.
The trust accepts that token only from this repository. Set `AWS_ACCOUNT_ID` as a repository secret
and `githubRepository` in context if the repository is renamed or moved.

## Deploying the first time

The stack reads the API package from a fixed key in the artifact bucket, and deliberately does not
record which version. The pipeline replaces the code once a week, and a recorded version would let
the next deployment of the stack put the older package back. Both settle on one object instead.

That leaves a circle to break. `OhfootballBackend` needs the package before it can deploy, and the
run that writes the package needs the API to exist. The way through uses the data already on the
machine you develop on.

```sh
# 1. Bootstrap the region, hand the domain over, then raise the shared base and the secrets.
#    Handing the domain over is described under Names below. Nothing that carries a name can be
#    deployed until it is done.
npx cdk bootstrap aws://ACCOUNT/us-east-2
npx cdk deploy OhfootballDns
npx cdk deploy OhfootballInfra OhfootballSecrets

# Each secret comes up with a placeholder in every key. Write the real values now. There is one
# secret so far.
aws secretsmanager put-secret-value --secret-id ohfootball/kaggle \
  --secret-string '{"username":"...","key":"...","dataset":"owner/slug"}'

# 2. Build a package from the local warehouse, and put it where the API stack reads.
make -C ../services/api bootstrap
make -C ../services/api snapshot
cd ../services/api/bin && zip -9 bootstrap.zip bootstrap ohfootball.db
bucket=$(aws ssm get-parameter --name /ohfootball/artifacts/bucket-name \
  --query Parameter.Value --output text)
aws s3 cp bootstrap.zip "s3://${bucket}/api/bootstrap.zip"

# 3. Raise the API and the site. Both publish names the pipeline reads.
npx cdk deploy OhfootballBackend OhfootballFrontend

# 4. Push the images, then raise the pipeline, then migrate and run it once.
#    Merging to main does the pushing. The pipeline can be started by hand from the console.
npx cdk deploy OhfootballEtl
```

After that the workflows own it, and the only step done by hand is starting a run out of turn.

A step added to the run needs its registry before its image can be pushed, and the registry is
raised by this stack. So the stack is deployed first and the image is pushed after. Between the two
the run holds a step pointing at an empty registry, and a scheduled run in that window fails on the
image it cannot pull. Deploy the two together, and away from Tuesday morning.

## Names

The domain is served by a Route 53 hosted zone that `OhfootballDns` owns. The registrar holds the
nameservers of a domain, not AWS, so the domain is handed over by hand once. Until that is done the
zone answers nobody, and a certificate cannot be issued, because a certificate is validated by a
record read over the public internet. A deployment that waits on a record nobody can read waits
until CloudFormation gives up.

```sh
# 1. Raise the zone.
npx cdk deploy OhfootballDns

# 2. Read the four nameservers it was given.
id=$(aws route53 list-hosted-zones-by-name --dns-name ohfootball.io \
  --query 'HostedZones[0].Id' --output text)
aws route53 get-hosted-zone --id "$id" --query 'DelegationSet.NameServers' --output text

# 3. At the registrar, replace its nameservers with those four.

# 4. Check the change has spread. This answers with the four AWS names when it is done, and it
#    usually takes under an hour.
dig +short NS ohfootball.io
```

The zone is kept when the stack is taken down. Raising it again would mint a new set of
nameservers, and the domain would answer nobody until the registrar was told the new four.

A certificate for a distribution has to live in `us-east-1`, because CloudFront is a global service
and reads certificates from there alone. A certificate for a regional endpoint has to live in the
region of that endpoint, which is `us-east-2`. So the site and the API each carry their own
certificate and the two sit in different regions. Route 53 is global, so both validate against the
one zone.

```sh
npx cdk deploy --all \
  -c siteDomainName=ohfootball.io \
  -c siteCertificateArn=arn:aws:acm:us-east-1:...:certificate/... \
  -c apiDomainName=api.ohfootball.io \
  -c apiCertificateArn=arn:aws:acm:us-east-2:...:certificate/...
```

Add `siteHostedZoneId` and `siteZoneName` (and the same pair for the API) to have the stack write
the alias record.

Until a site domain is set, the API answers a browser from any origin, because the name of the site
distribution is not known until it is deployed.
