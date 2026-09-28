# GraphQL API

The API exposes current dbt marts and published Elo rating snapshots without
leaking source-system identifiers. Start PostgreSQL, publish a rating snapshot,
then run:

```bash
go run ./cmd/server
```

GraphQL is served at <http://localhost:8082/graphql>; the development explorer
is available at <http://localhost:8082/>.

The core local stack includes the API:

```bash
docker compose up -d --build --wait
```

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
headers and `From` is not a header that a page on another site may send without them. The API logs the contact and the address of each request that passes, and never the other
headers.

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
It counts toward the limits. When it opens, it asks for the schema with the text in the `From`
header, which holds no contact, so it shows the 400 message. After the caller writes a contact
there, queries work at once. GraphiQL does not ask for the schema again by itself, so the caller
selects Re-fetch GraphQL schema in the bar on the left, or presses `Shift+Ctrl+R`. A reload puts
the text back in the header. `/healthz` and `/readyz` skip both rules, because the health checks
of Docker send no contact.

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
| `ELO_HOME_ADVANTAGE`, `ELO_RATING_SCALE` | `30`, `400` | The settings of the win chance. |

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
