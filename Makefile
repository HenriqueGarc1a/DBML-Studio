.PHONY: install dev build test test-watch typecheck preview audit docker-build docker-up docker-down docker-logs clean

install:
	npm install

dev:
	npm run dev

build:
	npm run build

test:
	npm test

test-watch:
	npm run test:watch

typecheck:
	npm run typecheck

preview:
	npm run preview

audit:
	npm audit

docker-build:
	docker compose build

docker-up:
	docker compose up --build -d

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f

clean:
	rm -rf dist
