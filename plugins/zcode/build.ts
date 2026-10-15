import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

/** node 侧用 esbuild 打成一个文件，外置名单之外的依赖全部打包进去 */
const here = path.dirname(fileURLToPath(import.meta.url))

/**
 * 外置名单：peer 里的包（home 里装着）、electron，以及 cordis——按值 import 了 cordis 却没写进 peer 时，
 * 产物里留下包名、被发版前检查拦住，而不是悄悄打包进一份拷贝
 */
function nodeSideExternals(): string[] {
  const manifest: unknown = JSON.parse(fs.readFileSync(path.join(here, 'package.json'), 'utf8'))
  const peers = isRecord(manifest) && isRecord(manifest['peerDependencies']) ? Object.keys(manifest['peerDependencies']) : []
  return ['electron', 'cordis', ...peers]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// 上一次构建留下的文件会随 files 白名单一起发出去，先清空
fs.rmSync(path.join(here, 'dist'), { recursive: true, force: true })

/** 插件本体，加上给 Monitor 用的等待脚本（只用 node 内置模块，用户直接 node 运行） */
const entries = [
  { source: 'src/index.ts', output: 'dist/index.js' },
  { source: 'src/wait-round-main.ts', output: 'dist/wait-round.js' },
]

for (const { source, output } of entries) {
  await build({
    entryPoints: [source],
    outfile: output,
    external: nodeSideExternals(),
    format: 'esm',
    platform: 'node',
    target: 'node22',
    bundle: true,
    minify: false,
    legalComments: 'none',
    logLevel: 'warning',
    absWorkingDir: here,
  })
  console.log(`[zcode] ${output} ← ${source}`)
}
