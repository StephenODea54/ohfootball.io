# infra

The AWS stacks for ohfootball.io, written with the CDK.

## What is where

| Stack                 | Holds                                                             |
| --------------------- | ----------------------------------------------------------------- |
| `OhfootballInfra`     | Network, Aurora Serverless v2 warehouse, raw and artifact buckets  |
| `OhfootballBackend`   | The API function, its function URL, and the distribution in front  |
| `OhfootballFrontend`  | The site bucket and the distribution in front of it                |
| `OhfootballEtl`       | Registries, pipeline tasks, the weekly run, and its schedule       |

`OhfootballInfra` is the only stack the others read from. Nothing crosses between the backend and
the frontend, so each carries its own distribution and its own name.

The pipeline changes the API and the site, and reads the name of each from a parameter that stack
publishes rather than through a stack reference. A reference has to be undone before either side
can change, and a parameter does not. The names are read when the pipeline stack is deployed, so a
function or a distribution that is replaced needs `OhfootballEtl` deployed again to be seen.

## The weekly run

    Scrape -> Transform -> Rate -> Package -> PublishApi -> BuildSite -> ClearCache

Each of the first four and the sixth is a container the pipeline waits for. `PublishApi` and
`ClearCache` call the service directly, so neither needs a container of its own.

Each container has a registry of its own under `ohfootball/`. The code pipeline pushes to them.
The images are built from `services/scraper/Dockerfile`, `analytics/Dockerfile`,
`services/predictor/Dockerfile`, `services/api/cmd/snapshot/Dockerfile`, and `frontend/Dockerfile`.

`Package` writes the snapshot from the warehouse, fetches the binary the code pipeline last built,
and puts the two together. That split keeps a weekly data run from needing a Go toolchain, and
keeps a code change from needing the warehouse.

Only the password reaches a task from Secrets Manager. Everything else about the connection is
plain, and the connection string carries no password, so the tasks read it the way libpq does.

## The size of the site

Every page is drawn ahead of time, including one for each season a program has played. That is
about 39,500 team pages plus the four fixed routes, drawn from 55 seasons.

Measured against the current data, the build draws about 55 pages a second, so the whole site takes
roughly twelve minutes on a laptop and longer against an API across a network. The step is allowed
two hours. A team page is about 110 KB and the whole site is about 4 GB, which costs around ten
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

`deploy.yml` publishes on a merge to main. It builds the six images and pushes them, builds the
arm64 binary and writes it to the artifact bucket, then deploys the four stacks. The weekly run
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
# 1. Bootstrap the account and raise the shared base.
npx cdk bootstrap
npx cdk deploy OhfootballInfra

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
