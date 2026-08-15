FROM golang:1.25-alpine AS build
# The build reads the module graph, not the workspace. A workspace file names every module of the
# repository, so copying it would force this image to carry services it does not build. The module
# replaces the shared database package with the copied directory instead.
WORKDIR /src
COPY pkg/database ./pkg/database
COPY services/scraper ./services/scraper
WORKDIR /src/services/scraper
RUN GOWORK=off go mod download
RUN CGO_ENABLED=0 GOOS=linux GOWORK=off go build -trimpath -ldflags="-s -w" -o /out/joe-eitel ./cmd/joe-eitel

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/joe-eitel /joe-eitel
ENTRYPOINT ["/joe-eitel"]
