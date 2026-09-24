.PHONY: build generate test vet fmt

build: generate
	mkdir -p bin
	go build -o bin/server ./cmd/server

generate:
	go generate ./...

test: generate
	go test ./...

vet: generate
	go vet ./...

fmt:
	gofmt -w $$(find . -name '*.go' -not -path './vendor/*')
