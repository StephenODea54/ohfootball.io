.PHONY: build bootstrap generate test vet fmt

build: generate
	mkdir -p bin
	go build -o bin/server ./cmd/server

# The deployed runtime starts a binary named bootstrap. It runs on arm64 Linux, and the pure Go
# SQLite driver lets the build stay free of cgo, so the result is one static file.
bootstrap: generate
	mkdir -p bin
	CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build \
		-trimpath \
		-ldflags="-s -w" \
		-o bin/bootstrap \
		./cmd/lambda

generate:
	go generate ./...

test: generate
	go test ./...

vet: generate
	go vet ./...

fmt:
	gofmt -w $$(find . -name '*.go' -not -path './vendor/*')
