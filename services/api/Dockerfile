FROM golang:1.25-alpine AS build

# The build reads the module graph, not the workspace. A workspace file names every module of the
# repository, so copying it would force this image to carry services it does not build. The module
# replaces the shared database package with the copied directory instead.
WORKDIR /src
COPY pkg/database ./pkg/database
COPY services/api ./services/api

WORKDIR /src/services/api
RUN GOWORK=off go mod download
RUN CGO_ENABLED=0 GOOS=linux GOWORK=off go build \
    -trimpath \
    -ldflags="-s -w" \
    -o /out/ohfootball-api \
    ./cmd/server

FROM alpine:3.22

RUN apk add --no-cache ca-certificates
COPY --from=build /out/ohfootball-api /usr/local/bin/ohfootball-api

USER nobody
EXPOSE 8082

ENTRYPOINT ["ohfootball-api"]
