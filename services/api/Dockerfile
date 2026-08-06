FROM golang:1.25-alpine AS build

WORKDIR /src
COPY services/api/go.mod services/api/go.sum ./
RUN go mod download

COPY services/api ./
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
