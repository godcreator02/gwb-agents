import { readFile, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ClaudeAgentSdk, SdkQueryFunction } from './sdk-types.js'

export const SDK_PACKAGE_NAME = '@anthropic-ai/claude-agent-sdk'
/** 本插件照 0.3.299 的接口写；0.x 的次版本号一变接口就可能不兼容，所以只认 0.3.299 起的 0.3.x */
export const SUPPORTED_SDK_VERSIONS = '>=0.3.299 <0.4.0'
export const SETUP_SKILL_NAME = 'claude-agent-setup'

export interface SdkInstallation {
  /** SDK 包目录，即设置 sdk-dir 的值 */
  dir: string
  version: string
  /** SDK 附带的 Claude Code 版本（SDK 0.3.N 配 Claude Code 2.1.N） */
  claudeCodeVersion: string
  /** SDK 附带的 Claude Code 程序，装在平台包里 */
  claudeCodeExecutable: string
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

export function isSupportedSdkVersion(version: string): boolean {
  const match = /^0\.3\.(\d+)$/u.exec(version)
  return match !== null && Number(match[1]) >= 299
}

/** 系统边界：sdk-dir 是人填的路径。不对就报错并指向初始化说明书，不去别处找 */
export async function inspectSdkInstallation(sdkDir: string): Promise<SdkInstallation> {
  if (sdkDir === '') throw new Error(`没配设置 sdk-dir（SDK 包目录）；读说明书 ${SETUP_SKILL_NAME}`)
  if (!path.isAbsolute(sdkDir)) throw new Error(`设置 sdk-dir 要是 SDK 包目录的绝对路径，现在是 ${JSON.stringify(sdkDir)}；读说明书 ${SETUP_SKILL_NAME}`)
  const manifestFile = path.join(sdkDir, 'package.json')
  let manifestText: string
  try {
    manifestText = await readFile(manifestFile, 'utf8')
  } catch (error) {
    throw new Error(`读不到 ${manifestFile}：sdk-dir 指的目录里没有装 SDK（${String(error)}）；读说明书 ${SETUP_SKILL_NAME}`)
  }
  const manifest: unknown = JSON.parse(manifestText)
  if (!isRecord(manifest) || manifest['name'] !== SDK_PACKAGE_NAME || typeof manifest['version'] !== 'string' || typeof manifest['claudeCodeVersion'] !== 'string') {
    throw new Error(`${manifestFile} 不是 ${SDK_PACKAGE_NAME} 的包：sdk-dir 要指到 …\\node_modules\\@anthropic-ai\\claude-agent-sdk 这一层`)
  }
  const version = manifest['version']
  if (!isSupportedSdkVersion(version)) {
    throw new Error(`装的 SDK 是 ${version}，本插件支持 ${SUPPORTED_SDK_VERSIONS}；照说明书 ${SETUP_SKILL_NAME} 重装`)
  }
  const claudeCodeExecutable = bundledClaudeCodeExecutable(sdkDir)
  try {
    await stat(claudeCodeExecutable)
  } catch (error) {
    throw new Error(`SDK 附带的 Claude Code 不在 ${claudeCodeExecutable}（${String(error)}）；照说明书 ${SETUP_SKILL_NAME} 重装`)
  }
  return { dir: sdkDir, version, claudeCodeVersion: manifest['claudeCodeVersion'], claudeCodeExecutable }
}

/** 平台包按 node 的解析规则从 SDK 包目录找，和 SDK 自己找它的方式一样；npm 全局安装时它在 SDK 自己的 node_modules 下 */
function bundledClaudeCodeExecutable(sdkDir: string): string {
  const platformPackage = `${SDK_PACKAGE_NAME}-${process.platform}-${process.arch}`
  let platformManifest: string
  try {
    platformManifest = createRequire(path.join(sdkDir, 'package.json')).resolve(`${platformPackage}/package.json`)
  } catch (error) {
    throw new Error(`SDK 旁边没有平台包 ${platformPackage}，装 SDK 时别加 --omit=optional（${String(error)}）；照说明书 ${SETUP_SKILL_NAME} 重装`)
  }
  return path.join(path.dirname(platformManifest), process.platform === 'win32' ? 'claude.exe' : 'claude')
}

/** 地址带上版本号：同一个目录重装成别的版本后，import 拿到的是新版本而不是模块缓存里的旧版本 */
export async function importSdk(installation: SdkInstallation): Promise<ClaudeAgentSdk> {
  const moduleUrl = `${pathToFileURL(path.join(installation.dir, 'sdk.mjs')).href}?version=${installation.version}`
  const loaded: unknown = await import(moduleUrl)
  if (!isRecord(loaded) || typeof loaded['query'] !== 'function') throw new Error(`${moduleUrl} 没有导出 query`)
  return { query: loaded['query'] as SdkQueryFunction }
}
