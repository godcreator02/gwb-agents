// 列出 ZCode 安装包里带 steer 的标识符与字符串（找「立即」把排队消息插进当前这一轮用的方法）。用法：node steer-names.mjs [正则] [文件过滤正则]
import { openSync, readSync } from 'node:fs'
const asarPath = process.env.LOCALAPPDATA + '\\Programs\\ZCode\\resources\\app.asar'
const fd = openSync(asarPath, 'r')
const head = Buffer.alloc(16); readSync(fd, head, 0, 16, 0)
const headerSize = head.readUInt32LE(4), jsonLen = head.readUInt32LE(12)
const hb = Buffer.alloc(jsonLen); readSync(fd, hb, 0, jsonLen, 16)
const header = JSON.parse(hb.toString('utf8'))
const base = 8 + headerSize
const files = []
;(function walk(node, prefix) {
  for (const [name, n] of Object.entries(node.files)) {
    const p = prefix ? prefix + '/' + name : name
    if (n.files) walk(n, p); else if (!n.unpacked) files.push({ p, size: n.size, offset: Number(n.offset) })
  }
})(header, '')
const [pattern = '[A-Za-z_$][\\w$]*[Ss]teer[\\w$]*', fileFilter = '^out/(renderer|main)/.*\\.(c?js|mjs)$'] = process.argv.slice(2)
const re = new RegExp(pattern, 'g'), fre = new RegExp(fileFilter)
const counts = new Map()
for (const f of files) {
  if (!fre.test(f.p) || f.p.includes('node_modules') || f.size > 60e6) continue
  const b = Buffer.alloc(f.size); readSync(fd, b, 0, f.size, base + f.offset)
  for (const m of b.toString('utf8').matchAll(re)) {
    const key = `${m[0]}  (${f.p.split('/').slice(0, 2).join('/')})`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
}
for (const [k, n] of [...counts].sort()) console.log(n, k)
