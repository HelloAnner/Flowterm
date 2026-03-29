.PHONY: deps install test build start

deps:
	pnpm install

install:
	node ./scripts/install-macos-app.mjs

test:
	pnpm test
	cargo test --manifest-path src-tauri/Cargo.toml

build:
	pnpm build

start:
	node ./scripts/ensure-frontend-deps.mjs
	pnpm start
