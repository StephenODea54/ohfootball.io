# Security

## Report a fault

Do not open a public issue for a security fault. Report it in private:

1. On GitHub, open the Security tab of this repository and select "Report a vulnerability".
2. If that is not possible, send an email to hey@ohfootball.io.

Tell us what you found, how to see it again, and what it lets a person do. We answer within seven
days. We tell you when the fault is fixed, and we credit you in the fix if you want that.

## What this covers

- The code on the `main` branch of this repository.
- The API at `api.ohfootball.io`.
- The site at `ohfootball.io`.
- The dataset that the weekly run publishes to Kaggle.

## What the API does to protect itself

The API needs no sign-in, and it serves only data that the site and the dataset already publish.
[services/api/README.md](services/api/README.md) gives the full rules. In short:

- Each request names a contact in the `User-Agent` or the `From` header.
- Each address may send 60 requests a minute, and all callers together may send 20 a second.
- A query has limits on the size of the body, the number of tokens, the number of fields, and its
  complexity. The API checks them before it runs the query.
- The build of the site sends a key that lets it skip the contact rule and the rate limits. The
  key has at least 16 characters, and the API compares it in constant time. `make pages` stops a
  build of the site that holds the key.
- The API sends no CORS headers, so a page on another site cannot read it from a browser.

## What counts as a fault

- A way around the contact rule, the rate limits, or the limits on a query.
- A way to read data that the marts do not publish, or to change any data.
- A key, a token, or a password in the repository, in the site, or in the dataset.
- A way to run SQL or code through the API or through the weekly run.

These are not security faults: a request that gets 429 inside the limits, and a wrong score or a
wrong rating. Open a public issue for a wrong score or a wrong rating.

## Secrets in the repository

Git ignores each `.env` file, and no Docker build reads one. Each `.env.example` holds only
placeholders and the defaults of the local stack. The passwords in `compose.yaml` are for the
local database that `make db-up` starts.
