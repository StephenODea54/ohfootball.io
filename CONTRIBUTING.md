# Contributing

## Set up

Install these tools:

| Tool | Version | Used by |
| --- | --- | --- |
| Go | 1.25 | the API and the scrapers |
| Python | 3.12 | the rating, the dataset, the recruiting snapshot, the migrations and their tests |
| uv | any | installs Python 3.12, ruff and sqlfluff |
| Node | 22.12 or later | the site |
| pnpm | 10 | the site. `corepack enable` installs the version that `package.json` names. |
| Docker | any | the local stack |

Then run these commands one time:

```sh
make hooks
make tools
pnpm -C services/frontend install
make doctor
```

`make hooks` points Git at `.githooks`. `make tools` installs the versions of ruff and sqlfluff
that the Makefile names. `make doctor` names each tool that is missing.

`.python-version` names Python 3.12, and CI and every image use it. The `python3` of your machine
can be another version. To use 3.12 in a shell, run `uv venv && . .venv/bin/activate` at the root
of the repository. Git ignores `.venv`.

On a network that inspects TLS, uv can refuse the certificate of the package index. Set
`UV_NATIVE_TLS=1` so that uv uses the certificates of the system.

## Check a change

| Command | Does |
| --- | --- |
| `make fmt` | Fixes the format of the Go, the Python, the SQL and the site. |
| `make lint` | Checks the format and the lint rules, and changes nothing. |
| `make vet` | Runs `go vet` and compiles the Python. |
| `make test` | Runs every unit test. |

The tools are gofmt for Go, ruff for Python, sqlfluff for SQL, Biome for TypeScript and JSON, and
Prettier for the Astro pages. Each one reads its settings from a file in the repository:
`ruff.toml`, `.sqlfluff`, `services/frontend/biome.json`, and the `prettier` key of
`services/frontend/package.json`.

The pre-commit hook runs `make lint`, `make vet` and `make test`. It stops when ruff or sqlfluff
is missing or is not the version that the Makefile names. A machine without pnpm skips the checks
of the site. CI runs the same checks on each pull request and each push to `main`, so a check that
the hook skips still runs there.

The hook checks the files in the working tree, and not only the staged content. An unformatted
file that you do not commit can stop the commit. A staged file that is not formatted can pass the
hook when the copy in the working tree is formatted, and then CI stops it. Run `make fmt` and
stage the result to keep the two the same.

## Editor

`.vscode/settings.json` formats each file on save with the same tool and settings that
`make lint` uses. `.vscode/extensions.json` names the extensions. Two of them need a note:

- The sqlfluff extension runs the `sqlfluff` on the PATH of the editor. An editor that starts from
  the Dock on macOS may not have `~/.local/bin` on its PATH. If the extension cannot find
  sqlfluff, set `sqlfluff.executablePath` to the full path in your user settings.
- The sqlfluff extension formats a file through standard input. It gives sqlfluff the name of the
  file only when it finds sqlfluff 3.0.6 or later. With the name, sqlfluff reads
  `infra/postgres/.sqlfluff`, and a save of an applied migration changes nothing. Without the
  name, a save can change a migration. The digest test in `make test` then stops the commit.
  Undo the change with `git checkout` on the file.
- The Biome extension reads the binary and the config of the site. It works only after
  `pnpm -C services/frontend install`.

## Rules that the checks do not hold

- Never change a migration that the warehouse holds. Write a new migration instead, and add its
  digest to `infra/postgres/tests/test_migrations.py`.
- Add or update a component in `services/frontend/src/components/ui` only through the shadcn
  command line. The format and lint tools skip that directory.
- Dependabot does not read the versions of dbt, sustained and psycopg in the Dockerfiles, or the
  versions of ruff and sqlfluff in the Makefile. Raise them by hand.

## Commit messages

- Write the subject as a short statement of the work, for example "Add sqlfluff for the SQL of
  the dbt project".
- Write the body in full sentences and paragraphs, with no lists.
- Say why the change is necessary, how it does what it must do, and what it does not do yet.
- Keep each sentence short.
- Make one commit for each logical change. Keep a change of format out of a commit that changes
  what the code does.
- A commit must make sense without other context. Do not refer to a chat, a review, or a ticket
  by an internal label.

Write comments and docs in simple technical English: short sentences, one idea each, and the same
word for the same thing.

## Security

[SECURITY.md](SECURITY.md) tells you how to report a security fault in private.
