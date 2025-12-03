.PHONY: build test test-js test-go build-js build-go generate clean docker-build docker-run docker-stop

build: build-js build-go

build-js:
	npm run build

build-go:
	go build -o dist/pirates-server ./server/cmd/server

test: test-js test-go

test-js:
	npm test

test-go:
	go test ./server/...

generate:
	cd server && buf generate

clean:
	rm -rf dist/

docker-build:
	docker build -t bataille-de-pirates .

docker-run: docker-build
	docker run -d --name bataille-de-pirates -p 8080:8080 bataille-de-pirates
	@echo "Game running at http://localhost:8080"

docker-stop:
	docker stop bataille-de-pirates && docker rm bataille-de-pirates
