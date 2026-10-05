FROM golang:1.27-alpine AS build

WORKDIR /src
COPY services/api ./services/api

WORKDIR /src/services/api
RUN go mod download
RUN CGO_ENABLED=0 GOOS=linux go build \
    -trimpath \
    -ldflags="-s -w" \
    -o /out/ohfootball-api \
    ./cmd/server

FROM alpine:3.24

RUN apk add --no-cache ca-certificates
COPY --from=build /out/ohfootball-api /usr/local/bin/ohfootball-api

USER nobody
EXPOSE 8082

# The host waits for this check to pass before it counts a new container as running. With the
# update order set to start-first, the old container answers until then, so a deploy does not
# stop the API.
#
# The check reads /healthz, which answers without reading the warehouse. A check of /readyz would
# mark every container unhealthy while the warehouse restarts, and the host would then restart the
# API as well.
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q --spider http://127.0.0.1:8082/healthz || exit 1

ENTRYPOINT ["ohfootball-api"]
