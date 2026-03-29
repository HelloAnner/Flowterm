.PHONY: install test build start

install:
	pnpm install

test:
	pnpm test
	cargo test --manifest-path src-tauri/Cargo.toml

build:
	pnpm build

start:
	pnpm start
