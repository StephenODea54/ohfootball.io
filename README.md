# ohfootball.io

## Setup

Run this command one time after you clone the repository:

```sh
make hooks
```

It points Git at `.githooks`. The pre-commit hook then checks the format of the Go files,
runs `make vet`, and runs `make test` before each commit.

## How it fits together

[docs/architecture.md](docs/architecture.md) describes the two pipelines, what each step of the
weekly run touches, and what a visitor reaches.

# TODO

Need to have check in repo root that checks for installation of required technologies
from webcolors import name_to_hex

print(name_to_hex("crimson"))  # Output: #dc143c
