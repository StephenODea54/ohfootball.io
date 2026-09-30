# Services

- `analytics`: The dbt project. It builds the staging, intermediate and mart layers of the
  warehouse from the raw scrape.
- `api`: The Go GraphQL API. The build of the site reads it, and so can any other program.
- `dataset`: The publication of the marts to Kaggle as a public dataset, and as a zip on
  `data.ohfootball.io`.
- `rating`: The margin rating. It is evaluated here, and it publishes the ratings and the
  predictions to the marts.
- `recruiting`: The weekly snapshot of the recruiting data of CollegeFootballData for the Ohio
  players who are still in high school. It writes a private schema that nothing publishes.
- `frontend`: The site. Astro draws every page at build time from the API, and Cloudflare Pages
  serves the files.
- `scraper`: The two scrapers. `joe-eitel` reads joeeitel.com each week. `ohhsfbdb` reads the
  seasons from 1972 to 1999 from ohhsfbdb.net, one time.

Run the core local stack with `docker compose up -d --wait`. This starts
PostgreSQL, applies the migrations, and starts pgAdmin and the GraphQL API. The
data tooling remains behind the `tools` Compose profile.
