.PHONY: install dev build test test-watch typecheck preview audit clean

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

clean:
	rm -rf dist
