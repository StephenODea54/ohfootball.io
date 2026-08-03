FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.work ./
COPY pkg/database ./pkg/database
COPY services/scraper ./services/scraper
WORKDIR /src/services/scraper
RUN go mod download
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/joe-eitel ./cmd/joe-eitel

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/joe-eitel /joe-eitel
ENTRYPOINT ["/joe-eitel"]
