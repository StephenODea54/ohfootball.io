# Writes the snapshot and puts together the package the API function runs.
#
# The binary inside the package is not built here. The code pipeline builds it whenever the Go
# changes and leaves it in the artifact bucket. This image fetches that binary, writes a snapshot
# from the warehouse as it stands after the run, and packs the two together. Splitting it that way
# keeps a weekly data run from needing a Go toolchain, and keeps a code change from needing the
# warehouse.
#
# Build from the repository root:
#   docker build -f services/api/cmd/snapshot/Dockerfile -t ohfootball/snapshot .

FROM golang:1.25-alpine AS build

WORKDIR /src
COPY go.work ./
COPY pkg/database ./pkg/database
COPY services/api ./services/api

WORKDIR /src/services/api
RUN go mod download
RUN CGO_ENABLED=0 GOOS=linux go build \
    -trimpath \
    -ldflags="-s -w" \
    -o /out/snapshot \
    ./cmd/snapshot

FROM alpine:3.22

RUN apk add --no-cache ca-certificates aws-cli zip

COPY --from=build /out/snapshot /usr/local/bin/snapshot

RUN cat > /usr/local/bin/package <<'SCRIPT' && chmod +x /usr/local/bin/package
#!/bin/sh
# Fails on the first error, on an unset variable, and on any failure inside a pipe. A package built
# from a half written snapshot would serve wrong answers without reporting anything.
set -eu

: "${ARTIFACTS_BUCKET:?ARTIFACTS_BUCKET is required}"
: "${CODE_KEY:?CODE_KEY is required}"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# The binary the code pipeline last built. Its key is the package key without the suffix.
binary_key="${CODE_KEY%.zip}"

snapshot -out "$work/ohfootball.db"
aws s3 cp "s3://${ARTIFACTS_BUCKET}/${binary_key}" "$work/bootstrap"
chmod +x "$work/bootstrap"

# The runtime looks for both names at the root of the package, so the paths are dropped.
(cd "$work" && zip -q -9 -j package.zip bootstrap ohfootball.db)

aws s3 cp "$work/package.zip" "s3://${ARTIFACTS_BUCKET}/${CODE_KEY}"

echo "wrote s3://${ARTIFACTS_BUCKET}/${CODE_KEY}"
SCRIPT

ENTRYPOINT ["/usr/local/bin/package"]
