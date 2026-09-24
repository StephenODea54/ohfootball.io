FROM golang:1.25-alpine AS build

WORKDIR /src
COPY services/api ./services/api

WORKDIR /src/services/api
RUN go mod download
RUN CGO_ENABLED=0 GOOS=linux go build \
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
