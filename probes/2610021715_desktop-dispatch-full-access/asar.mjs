// 读 asar：list [过滤正则] | cat <文件> | grep <正则> [文件过滤正则] [上下文字符数]
import { openSync, readSync } from 'node:fs';
const asarPath = process.env.LOCALAPPDATA + '\\Programs\\ZCode\\resources\\app.asar';
const fd = openSync(asarPath, 'r');
const head = Buffer.alloc(16); readSync(fd, head, 0, 16, 0);
const headerSize = head.readUInt32LE(4);
const jsonLen = head.readUInt32LE(12);
const hb = Buffer.alloc(jsonLen); readSync(fd, hb, 0, jsonLen, 16);
const header = JSON.parse(hb.toString('utf8'));
const base = 8 + headerSize;
const files = [];
(function walk(node, prefix) {
  for (const [name, n] of Object.entries(node.files)) {
    const p = prefix ? prefix + '/' + name : name;
    if (n.files) walk(n, p); else if (!n.unpacked) files.push({ p, size: n.size, offset: Number(n.offset) });
  }
})(header, '');
const read = f => { const b = Buffer.alloc(f.size); readSync(fd, b, 0, f.size, base + f.offset); return b.toString('utf8'); };
const [cmd, a, b, c] = process.argv.slice(2);
if (cmd === 'list') {
  const re = new RegExp(a ?? '.');
  for (const f of files) if (re.test(f.p) && !f.p.includes('node_modules')) console.log(f.size, f.p);
} else if (cmd === 'cat') {
  console.log(read(files.find(f => f.p === a)));
} else if (cmd === 'grep') {
  const re = new RegExp(a, 'g'); const fre = new RegExp(b ?? '\\.(c?js|mjs)$'); const ctx = Number(c ?? 150);
  for (const f of files) {
    if (!fre.test(f.p) || f.p.includes('node_modules') || f.size > 60e6) continue;
    const t = read(f); let m, n = 0;
    while ((m = re.exec(t)) && n < 8) { n++; console.log(`== ${f.p} @${m.index}\n${t.slice(Math.max(0, m.index - ctx), m.index + m[0].length + ctx)}\n`); }
  }
} else throw new Error('未知子命令：' + cmd);
