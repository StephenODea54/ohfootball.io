.PHONY: build test vet fmt sqlc-generate sqlc-vet db-up db-down db-logs

build:
	$(MAKE) -C services/scraper build

test:
	$(MAKE) -C services/scraper test
	go -C pkg/database test ./...

vet:
	$(MAKE) -C services/scraper vet
	go -C pkg/database vet ./...

fmt:
	$(MAKE) -C services/scraper fmt
	gofmt -w pkg/database/*.go pkg/database/db/*.go

sqlc-generate:
	go -C pkg/database run github.com/sqlc-dev/sqlc/cmd/sqlc@v1.30.0 generate

sqlc-vet:
	go -C pkg/database run github.com/sqlc-dev/sqlc/cmd/sqlc@v1.30.0 vet

db-up:
	docker compose up -d --wait

db-down:
	docker compose down
