/**
 * docfirst 配置：命令行 docfirst（check / confirm / render / trajectory）读它，项目根是站点目录。被钉的代码在仓根的
 * `plugins/<插件>/`，引用写 `../plugins/<插件>/…`。
 *
 * content：内容根。下面的 future/ 是未来区、不进核对，其余目录都是现状区、都进 check；本站的现状区是 `content/docs/`。
 * outputs：生成物的正本都在 `content/docs/outputs/`：仓根 README.md / AGENTS.md / CLAUDE.md，外加随插件包发布的说明书
 * `plugins/<插件>/skills/<名字>/SKILL.md`（要保留 frontmatter 的 name 与 description，gwb-skills 登记时读它们）。
 * 改了正本运行 `pnpm doc:render`，两份放进同一个提交。生成正本按原文渲染，里面不能用 JSX 组件。
 * fumadocsRoster 与 components：组件名册。fumadocsRoster 放进 fumadocs 自带的 Note、Files、Folder、File 的机读规则，
 * components 再加站里的组件：gwb-zcode 页的接缝图 ZcodeSeams 在机读版里换成数据文件给出的一段文字。
 * trajectory：轨迹卡放在站点根下的 trajectory/，站点的卡集合（app/features/trajectory/mdx.ts）读同一个目录。
 * 术语表不在这里：它是站点根的 glossary.json，由站点的 source.config.ts 交给术语标注插件。
 */
import { seamsAsText } from './content/docs/zcode/zcode-seams.data.mjs'

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
  fumadocsRoster: true,
  components: {
    // 手写的术语标注：机读版里只留术语原词
    Term: 'children',
    ZcodeSeams: (node, h) => h.paragraph(seamsAsText()),
  },
  trajectory: 'trajectory',
}
