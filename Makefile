.PHONY: check-env install frontend build

# 一条命令装齐本地开发环境：先做 Node/依赖版本自检（preinstall 内挂同一校验），再装依赖。
check-env:
	cd frontend && npm run check-env

install:
	cd frontend && npm install

frontend:
	cd frontend && npm run dev

build:
	cd frontend && npm run build
