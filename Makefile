.PHONY: install dev frontend build typecheck

# 一条命令装齐依赖并起本地开发环境；依赖已装好时直接启动，不额外安装。
dev:
	npm run dev

install:
	npm run install:web

frontend:
	npm run dev --prefix frontend

build:
	npm run build

typecheck:
	npm run typecheck
