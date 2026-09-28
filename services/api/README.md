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

`CORS_ORIGIN` names the one origin whose pages may read the API from a browser.
The site does not need it, because only the build of the site reads the API.
