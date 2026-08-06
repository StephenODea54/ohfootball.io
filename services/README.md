# Services

- `api`: Go GraphQL API consumed by the frontend.
- `predictor`: Elo model evaluation and rating publication.
- `scraper`: Joe Eitel ingestion commands.

Run the core local stack with `docker compose up -d --wait`. This starts
PostgreSQL, pgAdmin, and the GraphQL API. The data tooling remains behind the
`tools` Compose profile.
