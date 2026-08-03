.PHONY: build test vet fmt

build:
	mkdir -p bin
	go build -o bin/joe-eitel ./cmd/joe-eitel

test:
	go test ./...

vet:
	go vet ./...

fmt:
	gofmt -w $$(find . -name '*.go' -not -path './vendor/*')
