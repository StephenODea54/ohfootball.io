.PHONY: build test vet fmt

build:
	mkdir -p bin
	go build -o bin/joe-eitel ./cmd/joe-eitel
	go build -o bin/ohhsfbdb ./cmd/ohhsfbdb

test:
	go test ./...

vet:
	go vet ./...

fmt:
	gofmt -w $$(find . -name '*.go' -not -path './vendor/*')
