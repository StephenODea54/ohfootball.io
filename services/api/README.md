# GraphQL API

The API exposes current dbt marts and published rating snapshots without
leaking source-system identifiers. The rating job stores the rating of each team and a prediction
for each game, so the API reads them and calculates nothing. Start PostgreSQL, publish a rating
snapshot, then run:

```bash
go run ./cmd/server
```

GraphQL is served at <http://localhost:8082/graphql>; the development explorer
is available at <http://localhost:8082/>.

The core local stack includes the API:

```bash
docker compose up -d --build --wait
```

## Rank movement

Each rating carries `rank` and `previousRank`. `previousRank` is the rank of the team one week
before the date of the rating, among the teams of the same snapshot. A rating changes only when a
team plays, and the rating service keeps the ratings that both teams carried into each played game.
So the API reads the rating of each team on that day from its first game of that week, or keeps
the rating of the snapshot when the team did not play. It needs no earlier snapshot. A snapshot
with no game in the week before it, such as one of 31 December, shows no movement. A client finds
the movement of a team as `previousRank - rank`, so a positive number means the team moved up.

## Games the rating leaves out

Each team carries `outOfStateGamesPlayed`. It is the number of games this season that the team
played against a team that is not recorded as an Ohio team. The rating counts only games between
two Ohio teams, so it leaves these games out. A game counts here only when it has a result of win,
loss, or tie and both scores. A canceled game and a forfeit do not count. An opponent with no
state, or with no current row in `dim_teams`, counts as out of state, because the rating also
leaves out its games.

## Program history

The `team` query gives `programHistory`, one row for each season the program played as an Ohio
team, oldest first. The source id follows the program from one season to the next. A season in
which the source id is recorded in another state is left out, because it has no Ohio rating. Each
row holds the record and the playoff record of the season. A game counts in a record only when it
has a result of win, loss, or tie.

The rating of a row comes from the end-of-season snapshot. This is the last snapshot of that
season. For a past season it is the snapshot of 31 December. For the season in progress it is the
latest weekly snapshot, so the row of that season equals the rating of the team. The rank counts
every team in the snapshot, and two teams with the same rating share a rank. `previousRank` is
always null in a row of the history. `rating` is null when the season has no snapshot.

The rating job writes the 31 December snapshot of each past season again on each run. A past rank
can therefore move by a place when the model or the data changes. The `teams` query answers an
empty list for `programHistory` and for `ratingHistory`, because it does not read the history of
each team.

## Rules for callers

The API needs no sign-in. Each caller follows two rules.

Each request to `/graphql` names a contact. The `User-Agent` header, or else the `From` header,
holds an email address or an http(s) URL with a dotted host name:

```sh
curl https://api.ohfootball.io/graphql \
  -H 'Content-Type: application/json' \
  -H 'User-Agent: my-football-app/1.0 (me@example.com)' \
  -d '{"query":"{ currentSeason }"}'
```

A request without a contact gets 400 and a body in the form of a GraphQL error, with the code
`CONTACT_REQUIRED` and a message that tells the caller what to send. The default `User-Agent` of
curl, such as `curl/8.7.1`, holds no contact. A browser does not let a page set `User-Agent`, so
the playground at `/` fills its Headers pane with a `From` header. The caller writes a contact
there. The `From` header works in a browser only in the playground, because the API sends no CORS
headers and `From` is not a header that a page on another site may send without them. The API
logs the contact and the address of each request that passes, and never the other headers.

A query that reads only the schema needs no contact, so the playground and the tools that read the
schema, such as a code generator, work without one. The API reads the query from the `query`
parameter of a GET, or from the JSON body of a POST. It reads at most 64 KiB of the body. The query
must parse, each operation must be a query, and each top-level selection of each operation must
be the field `__schema`, `__type`, or `__typename`. An alias does not change the field. A fragment
spread or an inline fragment at the top level gets the contact rule, and so does a batch, a body
that is not JSON, and a larger body. These queries count toward the rate limits, and the log
marks them with `schema=true`. They also follow the limits on the size of a query below, because
a short query can ask for the schema many times.

Each query also has limits on its size. The API checks them before it validates or runs the query:

- A request body to `/graphql` may have at most 1 MiB. A larger body gets 413 and a GraphQL error
  with the code `BODY_TOO_LARGE`. A body that cannot be read gets 400 and `BODY_NOT_READ`.
- A query may have at most 10000 tokens. A token is a name, a punctuation mark, or a value. A
  longer query gets 422 and `TOKEN_LIMIT_EXCEEDED`. The introspection query of GraphiQL has about
  160 tokens. gqlgen has its own token limit, but at v0.17.64 it runs the part of a longer query
  that it parsed, so the API checks the limit itself.
- A query may select at most `GRAPHQL_FIELD_LIMIT` fields, 300 by default. Each alias, each
  `__typename`, and each field of a fragment each time the query uses the fragment counts as one
  field. The count holds each operation of the document and each fragment that no operation uses.
  A larger query gets 422 and `FIELD_LIMIT_EXCEEDED`. The complexity limit of gqlgen does not
  count the fields of `__Schema`, so this limit is the one that holds for introspection. The
  introspection query of GraphiQL selects 217 fields, and each query of the site selects at most
  58.

The complexity limit then runs, and a query over it gets 422 and `COMPLEXITY_LIMIT_EXCEEDED`.

Each address stays inside the rate limits. One address may send 60 requests a minute: up to 20 at
once, and then one more each second. All callers together may send 20 requests a second, with up
to 40 at once. The burst of one address may not be larger than the total burst, so one address
cannot use all of the total burst and lock out the other callers. The server does not start with
such settings. A request over a limit gets 429, a `Retry-After` header in whole seconds, and a
GraphQL error with the code `RATE_LIMITED`. A request that gets 429 uses no part of a limit. A
request that gets 400 is counted. An IPv6 address counts as its whole /64 network. A caller that
holds a larger IPv6 block, such as a /48, can still use many /64 networks and so many buckets. The
total limit holds for it too. The limits are counted in memory, so a restart starts every count
again.

The playground page needs no contact, because a browser cannot send one when it opens the page.
It counts toward the limits. When it opens, it loads the schema, so the documentation and the
completion work at once. The query editor shows an example query with comments that tell the
caller to write a contact in the `From` header before a query runs. GraphiQL keeps the Headers
pane in the local storage of the browser, so the contact stays after a reload. The placeholder
shows only on the first visit. `/healthz` and `/readyz` skip both rules, because the health
checks of Docker send no contact.

The build of the site skips both rules when it sends `Authorization: Bearer <key>` and the key
equals `SITE_BUILD_KEY`. The API compares the two in constant time. The build sends the GitHub
secret `GRAPHQL_API_KEY`, so the two values must be the same. An empty `SITE_BUILD_KEY` lets no
request skip the rules.

The API sends no CORS headers. No page of ohfootball.io calls it from a browser, and the
playground is on the origin of the API, so a page on another origin cannot read it.

## Settings

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | a local database | The connection URL of the warehouse. |
| `HTTP_ADDR` | `:8082` | The address the server listens on. |
| `SITE_BUILD_KEY` | empty | The key that lets the build of the site skip the rules. It must have at least 16 characters and no white space at either end. |
| `RATE_LIMIT_ADDRESS_PER_MINUTE` | `60` | The requests one address may send each minute. |
| `RATE_LIMIT_ADDRESS_BURST` | `20` | The requests one address may send at once. It may not be larger than `RATE_LIMIT_TOTAL_BURST`. |
| `RATE_LIMIT_TOTAL_PER_SECOND` | `20` | The requests all callers together may send each second. |
| `RATE_LIMIT_TOTAL_BURST` | `40` | The requests all callers together may send at once. |
| `GRAPHQL_COMPLEXITY_LIMIT` | `1000` | The highest cost of one operation. |
| `GRAPHQL_FIELD_LIMIT` | `300` | The most fields that one query may select. It must be a whole number of at least 1. |

Each limit is a whole number of at least 1. The server does not start when a setting is not valid.

For a local build of the site against the compose stack, set `SITE_BUILD_KEY` in the shell that
runs `docker compose`, and set the same value as `GRAPHQL_API_KEY` in `services/frontend/.env`.
Without the key, the build gets 429 after its first 20 requests.

## The address of a caller

The API counts each caller by the `X-Real-Ip` header. When that header is missing or holds no
address, it uses the address of the connection.

In production, Traefik is in front of the API. Dokploy installs Traefik 3 and writes entry points
that set no `forwardedHeaders` options. With those options unset, Traefik trusts no sender. It
removes the `X-Real-Ip` and `X-Forwarded-*` headers that a client sends, and it sets `X-Real-Ip`
to the address that opened the connection. So a client cannot choose the address that the API
counts. This is true only while all of these hold:

- the entry points do not set `forwardedHeaders.insecure` or `forwardedHeaders.trustedIPs`,
- port 8082 of the `api` application is not published on the host, so each request comes through
  Traefik,
- the DNS record of `api` is not proxied by Cloudflare. A proxied record makes `X-Real-Ip` the
  address of a Cloudflare server, and many callers then share one limit.

To check it on the host:

1. Run `docker inspect dokploy-traefik --format '{{.Config.Image}}'`. It must show Traefik 3.
   Read the static configuration of Traefik, `/etc/dokploy/traefik/traefik.yml`. The entry points
   `web` and `websecure` must have no `forwardedHeaders` block.
2. Run `docker service inspect <api service> --format '{{json .Endpoint.Ports}}'`. It must show no
   published port.
3. Send a request with a false address from a machine outside the host. Send it one time over
   IPv4 and one time over IPv6:
   ```sh
   for family in -4 -6; do
     curl "$family" -s -o /dev/null -A "check$family (me@example.com)" \
       -H 'X-Real-Ip: 192.0.2.1' -H 'X-Forwarded-For: 192.0.2.1' \
       -H 'Content-Type: application/json' -d '{"query":"{ currentSeason }"}' \
       https://api.ohfootball.io/graphql
   done
   ```
   The log of the API shows two lines `request` with `contact=me@example.com`. The `address` of
   each must be the public IPv4 address or the IPv6 /64 of that machine, and not `192.0.2.1`. A
   private address, such as `172.17.0.1`, means that Docker hides the address of the client from
   Traefik. Every caller of that family then shares one limit. This is likely for IPv6 when `api`
   has an AAAA record and the Docker network has no IPv6. Docker then passes each IPv6 connection
   to Traefik from the address of the bridge gateway, so all IPv6 clients share one bucket. The
   curl with `-6` fails when there is no AAAA record, and that is correct.
