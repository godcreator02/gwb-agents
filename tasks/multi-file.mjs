import { cp, access } from 'node:fs/promises'
import { join } from 'node:path'
import { checkItem, filesContaining, importFresh, nearlyEqual, runNodeTest } from './check-helpers.mjs'

export const title = '多文件改名加参数'

export const prompt = [
  '当前目录是一个小的计价模块。请完成：',
  '1. 把 calcTotal 改名为 computeTotal。项目里所有用到这个名字的地方（代码、注释、文档）都要改，不留旧名字。',
  '2. computeTotal 增加第二个参数 taxRate，默认 0，返回「不含税总额 ×（1 + taxRate）」。',
  '3. cartSummary(cart, taxRate) 和 invoiceLine(order, taxRate) 都增加可选的 taxRate 参数并传给 computeTotal；totalsByCustomer 保持不含税。',
  '4. 新建 test/pricing.test.js，用 node:test 覆盖以上行为，运行 node --test 确认通过。',
  '完成后用两三句话汇报改了哪些文件。',
].join('\n')

export async function setup(workDir) {
  await cp(join(import.meta.dirname, '..', 'fixtures', 'multi-file'), workDir, { recursive: true })
}

const items = [{ price: 10, qty: 2 }, { price: 2.5, qty: 4 }]

export async function check(workDir) {
  const load = (name) => importFresh(join(workDir, 'src', name))
  return [
    // 只查原有的代码和文档；新写的测试可以用旧名字断言它已不存在
    await checkItem('src/ 与 README 不留旧名字 calcTotal', async () => {
      const files = [
        ...(await filesContaining(join(workDir, 'src'), 'calcTotal')).map((file) => join('src', file)),
        ...(await filesContaining(workDir, 'calcTotal')).filter((file) => file === 'README.md'),
      ]
      return files.length === 0 || `还在：${files.join(', ')}`
    }),
    await checkItem('computeTotal 默认不含税', async () => nearlyEqual((await load('pricing.js')).computeTotal(items), 30)),
    await checkItem('computeTotal 含税', async () => nearlyEqual((await load('pricing.js')).computeTotal(items, 0.1), 33)),
    await checkItem('cartSummary 透传 taxRate', async () => {
      const summary = (await load('cart.js')).cartSummary({ items }, 0.1)
      return summary.count === 6 ? nearlyEqual(summary.total, 33) : `count 应为 6，实际 ${summary.count}`
    }),
    await checkItem('invoiceLine 透传 taxRate', async () => {
      const line = (await load('invoice.js')).invoiceLine({ id: 'A', items }, 0.1)
      return line === 'A: 33.00' || `实际 ${line}`
    }),
    await checkItem('invoiceLine 不传 taxRate', async () => {
      const line = (await load('invoice.js')).invoiceLine({ id: 'A', items })
      return line === 'A: 30.00' || `实际 ${line}`
    }),
    await checkItem('totalsByCustomer 不含税', async () => {
      const totals = (await load('report.js')).totalsByCustomer([
        { customer: 'x', items },
        { customer: 'x', items: [{ price: 1, qty: 1 }] },
      ])
      return nearlyEqual(totals.x, 31)
    }),
    await checkItem('index.js 导出 computeTotal', async () =>
      typeof (await load('index.js')).computeTotal === 'function' || '没有导出'),
    await checkItem('写了 test/pricing.test.js', async () => {
      await access(join(workDir, 'test', 'pricing.test.js'))
      return true
    }),
    await checkItem('node --test 通过', async () => {
      const result = runNodeTest(workDir)
      return result.passed || result.output.slice(-300)
    }),
  ]
}
