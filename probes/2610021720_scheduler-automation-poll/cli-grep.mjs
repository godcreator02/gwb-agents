// 在 ZCode 安装包自带的 CLI 文件 resources/glm/zcode.cjs 里搜源码，打印每处命中前后的字符
// 用法：node cli-grep.mjs '<正则>' [上下文字符数]
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const [pattern, context = '300'] = process.argv.slice(2)
if (!pattern) throw new Error("用法：node cli-grep.mjs '<正则>' [上下文字符数]")
const text = readFileSync(join(process.env.LOCALAPPDATA, 'Programs', 'ZCode', 'resources', 'glm', 'zcode.cjs'), 'utf8')
const re = new RegExp(pattern, 'g')
let match
let count = 0
while ((match = re.exec(text)) && count < 8) {
  count++
  const contextChars = Number(context)
  console.log(`== zcode.cjs @${match.index}\n${text.slice(Math.max(0, match.index - contextChars), match.index + match[0].length + contextChars)}\n`)
}
