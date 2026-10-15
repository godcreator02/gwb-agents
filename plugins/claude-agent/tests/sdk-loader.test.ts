import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { importSdk, inspectSdkInstallation, isSupportedSdkVersion } from '../src/sdk-loader.js'

const tempDirs: string[] = []
afterEach(async () => { await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))) })

/** 照 npm 全局安装的样子摆一份假的 SDK：平台包在 SDK 自己的 node_modules 下 */
async function fakeSdk({ version = '0.3.299', withPlatformPackage = true, withExecutable = true } = {}): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'claude-agent-sdk-'))
  tempDirs.push(root)
  const sdkDir = path.join(root, 'node_modules', '@anthropic-ai', 'claude-agent-sdk')
  await mkdir(sdkDir, { recursive: true })
  await writeFile(path.join(sdkDir, 'package.json'), JSON.stringify({ name: '@anthropic-ai/claude-agent-sdk', version, claudeCodeVersion: '2.1.299' }))
  await writeFile(path.join(sdkDir, 'sdk.mjs'), 'export function query() { return "fake" }\n')
  if (withPlatformPackage) {
    const platformDir = path.join(sdkDir, 'node_modules', '@anthropic-ai', `claude-agent-sdk-${process.platform}-${process.arch}`)
    await mkdir(platformDir, { recursive: true })
    await writeFile(path.join(platformDir, 'package.json'), JSON.stringify({ name: `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}`, version }))
    if (withExecutable) await writeFile(path.join(platformDir, process.platform === 'win32' ? 'claude.exe' : 'claude'), '')
  }
  return sdkDir
}

describe('SDK 安装', () => {
  it('只认 0.3.299 起的 0.3.x', () => {
    expect(['0.3.299', '0.3.300', '0.3.1000'].every(isSupportedSdkVersion)).toBe(true)
    expect(['0.3.298', '0.4.0', '1.0.0', '0.3.300-beta.1'].some(isSupportedSdkVersion)).toBe(false)
  })

  it('认出版本与附带的 Claude Code，按路径 import 出 query', async () => {
    const sdkDir = await fakeSdk()
    const installation = await inspectSdkInstallation(sdkDir)
    expect(installation).toMatchObject({ dir: sdkDir, version: '0.3.299', claudeCodeVersion: '2.1.299' })
    expect(installation.claudeCodeExecutable).toContain(`claude-agent-sdk-${process.platform}-${process.arch}`)
    expect(typeof (await importSdk(installation)).query).toBe('function')
  })

  it('没配、相对路径、不是 SDK、版本不对、缺平台包或程序都报错并指向说明书', async () => {
    await expect(inspectSdkInstallation('')).rejects.toThrow('没配设置 sdk-dir')
    await expect(inspectSdkInstallation('relative/dir')).rejects.toThrow('绝对路径')
    await expect(inspectSdkInstallation(path.join(tmpdir(), 'no-such-sdk-dir'))).rejects.toThrow('claude-agent-setup')
    await expect(inspectSdkInstallation(await fakeSdk({ version: '0.4.0' }))).rejects.toThrow('本插件支持 >=0.3.299 <0.4.0')
    await expect(inspectSdkInstallation(await fakeSdk({ withPlatformPackage: false }))).rejects.toThrow('没有平台包')
    await expect(inspectSdkInstallation(await fakeSdk({ withExecutable: false }))).rejects.toThrow('附带的 Claude Code 不在')
  })
})
