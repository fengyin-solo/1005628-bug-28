#!/usr/bin/env node
// 装依赖前的环境自检：Node 版本与 package.json 里的依赖版本必须是合法值。
// 任一项不合法直接非零退出，npm install 随之终止，避免装到一半才发现环境不对。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const pkgPath = join(here, '..', 'package.json')

const MIN_NODE_MAJOR = 18
const KNOWN_TAGS = new Set(['latest', 'next', 'beta', 'alpha', 'rc', 'edge', 'dev'])

function fail(message) {
  console.error(`[check-env] ${message}`)
  process.exitCode = 1
}

// 依赖版本允许的写法：
//   1) semver 版本/范围：1.2.3、^1.2.3、~1.2.0、>=1.0.0 <2.0.0、1.x、*
//   2) 常见发布标签：latest/next/beta/alpha/rc/edge/dev
//   3) 外部资源：git 地址、http(s) tarball、github 简写、npm 别名、file:/link:/workspace: 路径
// 其余（如 "latestxxx"、"abc"、"^"、空串）一律视为无效值挡回。
const COMPARATOR = '(?:\\^|~|>=?|<=?|=|>)?\\s*v?\\d+(?:\\.\\d+){0,2}(?:\\.[xX*]|[xX*])?(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?'
const SEMVER_RANGE = new RegExp(`^${COMPARATOR}(?:\\s+${COMPARATOR})*$`)
const EXTERNAL =
  /^(?:git(@|\+|:|\/\/)|https?:\/\/|github:|bitbucket:|gitlab:|npm:|file:|link:|workspace:|[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/

export function isValidVersionSpec(spec) {
  const value = String(spec).trim()
  if (value === '') {
    return false
  }
  if (value === '*' || value === 'x' || value === 'X') {
    return true
  }
  if (KNOWN_TAGS.has(value)) {
    return true
  }
  if (EXTERNAL.test(value)) {
    return true
  }
  return SEMVER_RANGE.test(value)
}

function main() {
  // 校验 Node 主版本：纯前端工具链（Vite 5 / vue-tsc 2）要求 Node 18+。
  const major = Number(process.versions.node.split('.')[0])
  if (!Number.isFinite(major) || major < MIN_NODE_MAJOR) {
    fail(`Node 版本过低，当前 ${process.versions.node}，需要 Node ${MIN_NODE_MAJOR} 或更高版本`)
  }

  let pkg
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  } catch (error) {
    fail(`无法读取 package.json：${error instanceof Error ? error.message : String(error)}`)
    return
  }

  const groups = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']
  let bad = 0
  for (const group of groups) {
    const deps = pkg[group]
    if (!deps) {
      continue
    }
    for (const [name, spec] of Object.entries(deps)) {
      if (!isValidVersionSpec(String(spec))) {
        fail(`${group} 中 ${name} 的版本 "${spec}" 不是合法的 semver 版本或可安装来源`)
        bad += 1
      }
    }
  }

  if (bad > 0) {
    fail('请把上面的依赖版本改成合法的 semver 范围（如 ^1.2.3）、发布标签（如 latest）或可安装来源后重试')
  } else {
    console.log(
      `[check-env] Node ${process.versions.node} 满足要求，${pkg.name ?? 'package.json'} 依赖版本校验通过`,
    )
  }
}

// 直接执行时跑自检；被测试以模块方式 import 时只取校验函数。
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
}
