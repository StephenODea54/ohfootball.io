# ohfootball.io

## Setup

Run these commands one time after you clone the repository:

```sh
make hooks
make tools
pnpm -C services/frontend install
```

`make hooks` points Git at `.githooks`. The pre-commit hook then runs `make lint`, `make vet`, and
`make test` before each commit. `make fmt` fixes the format of each language, and `make lint`
checks what it cannot fix.

`make tools` installs ruff and sqlfluff with uv. The hook stops when either is missing. The site
checks need the packages of the site. A machine without pnpm skips them, and CI runs them.

## How it fits together

[docs/architecture.md](docs/architecture.md) describes the two pipelines, what each step of the
weekly run touches, and what a visitor reaches.
