// 读 Electron 程序里的 fuse 位：哨兵字符串后面是版本号、长度，再往后每个字节一个 fuse（'1' 开、'0' 关、'r' 已删）
// 字段顺序照 @electron/fuses 的 FuseV1Options
import { readFileSync } from 'node:fs'

const SENTINEL = Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX')
const FUSE_NAMES = [
  'RunAsNode',
  'EnableCookieEncryption',
  'EnableNodeOptionsEnvironmentVariable',
  'EnableNodeCliInspectArguments',
  'EnableEmbeddedAsarIntegrityValidation',
  'OnlyLoadAppFromAsar',
  'LoadBrowserProcessSpecificV8Snapshot',
  'GrantFileProtocolExtraPrivileges',
  'WasmTrapHandlers',
]
const STATES = { 0x31: 'enabled', 0x30: 'disabled', 0x72: 'removed' }

const files = process.argv.slice(2)
if (files.length === 0) throw new Error('用法：node read-fuses.mjs <ZCode.exe 路径>…')
for (const file of files) {
  const binary = readFileSync(file)
  const sentinelAt = binary.indexOf(SENTINEL)
  if (sentinelAt < 0) throw new Error(`${file} 里没有 fuse 哨兵`)
  const version = binary[sentinelAt + SENTINEL.length]
  const length = binary[sentinelAt + SENTINEL.length + 1]
  const fuseBytes = binary.subarray(sentinelAt + SENTINEL.length + 2, sentinelAt + SENTINEL.length + 2 + length)
  console.log(`${file}  offset=${sentinelAt} version=${version} length=${length}`)
  fuseBytes.forEach((byte, index) => console.log(`  ${FUSE_NAMES[index] ?? `#${index}`}: ${STATES[byte] ?? `未知 0x${byte.toString(16)}`}`))
}
