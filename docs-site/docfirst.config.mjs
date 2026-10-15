/**
 * docfirst 配置：命令行和站读的是同一份。项目根是这个站目录，被钉的代码在仓根的 `plugins/<插件>/`，引用写 `../plugins/<插件>/…`。
 *
 * content 下 `trajectory/` 与 `future/` 两个名字固定，其余目录都是现状区、全部进 check；本站的现状区是 `content/docs/`。
 *
 * 生成物的正本都在 `content/docs/outputs/`：仓根 README.md / AGENTS.md / CLAUDE.md，外加随插件包发布的说明书
 * `plugins/<插件>/skills/<名字>/SKILL.md`（要保留 frontmatter 的 name 与 description，gwb-skills 登记时读它们）。
 * 改正本后运行 `pnpm doc:render`，正本与生成物放进同一个提交。生成正本按原文渲染，里面不能用 JSX 组件。
 *
 * components 是组件名册：fumadocsRoster 给 fumadocs 自带文件树与 Note 的机读规则，站里自己加的组件在它后面追加。
 */
import { fumadocsRoster } from '@godcreator/docfirst-workflow/fumadocs/roster'
import { seamsAsText } from './src/components/zcode-seams.data.mjs'

export default {
  content: 'content',
  outputs: {
    'content/docs/outputs/readme.mdx': ['../README.md'],
    'content/docs/outputs/agents.mdx': ['../AGENTS.md'],
    'content/docs/outputs/claude.mdx': ['../CLAUDE.md'],
    'content/docs/outputs/skills/zcode.mdx': [
      { to: '../plugins/zcode/skills/zcode/SKILL.md', frontmatter: ['name', 'description'] },
    ],
    'content/docs/outputs/skills/claude-agent.mdx': [
      { to: '../plugins/claude-agent/skills/claude-agent/SKILL.md', frontmatter: ['name', 'description'] },
    ],
    'content/docs/outputs/skills/claude-agent-setup.mdx': [
      { to: '../plugins/claude-agent/skills/claude-agent-setup/SKILL.md', frontmatter: ['name', 'description'] },
    ],
  },
  components: {
    ...fumadocsRoster,
    ZcodeSeams: (node, h) => h.paragraph(seamsAsText()),
  },
}
