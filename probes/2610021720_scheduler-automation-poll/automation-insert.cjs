// 没有运行过：用户在运行前否掉了这条路（「不需要定时任务，就派发普通任务就行了，别搞复杂」），留作当时的方案原样
// 往 zcode 桌面端的自动化表插一条只跑一次的任务，等调度进程派发，再从会话库读回答
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
const home = process.env.USERPROFILE;
const workspace = 'D:\\unitfolders\\00000-console\\console';
const prompt = '【自动化派发测试 1002】只读任务：数一下 vscode-workspace/ 目录下有几个 .code-workspace 文件，用一句中文回答，不要修改任何文件。';

const index = new DatabaseSync(home + '/.zcode/v2/tasks-index.sqlite');
index.exec('PRAGMA busy_timeout = 5000');
const now = Date.now();
const d = new Date(now);
const automationId = 'automation-' + randomUUID();
index.prepare(`INSERT INTO automations (automation_id, title, cron_expr, prompt, model, provider, mode, thought_level,
  workspace_key, workspace_path, location_kind, recurring, max_runs, enabled, lifecycle_status, next_run_at,
  created_at, updated_at, model_selection)
  VALUES (?, ?, ?, ?, ?, 'glm', 'build', 'max', ?, ?, 'local', 0, 1, 1, 'active', ?, ?, ?, ?)`).run(
  automationId, '自动化派发测试 1002',
  `${d.getMinutes()} ${d.getHours()} ${d.getDate()} ${d.getMonth() + 1} *`, prompt,
  'builtin:bigmodel-coding-plan/GLM-5.3', workspace, workspace, now, now, now,
  JSON.stringify({ providerId: 'account:bigmodel-individual-coding-plan', modelId: 'GLM-5.3', options: { reasoningLevel: 'max' } }));
console.log('inserted', automationId);

const sessions = new DatabaseSync(home + '/.zcode/cli/db/db.sqlite', { readOnly: true });
const deadline = now + 240_000;
(async () => {
  let run;
  for (;;) {
    run = index.prepare('SELECT * FROM automation_runs WHERE automation_id = ?').get(automationId);
    const a = index.prepare('SELECT dispatch_status, lifecycle_status, last_error FROM automations WHERE automation_id = ?').get(automationId);
    if (run?.outcome || Date.now() > deadline) { console.log('automation', JSON.stringify(a)); break; }
    await new Promise(r => setTimeout(r, 2000));
  }
  console.log('run', JSON.stringify(run), 'after', Math.round((Date.now() - now) / 1000), 's');
  if (!run?.session_id) return;
  const task = index.prepare('SELECT title, task_status FROM tasks WHERE task_id = ?').get(run.session_id);
  console.log('sidebar task', JSON.stringify(task));
  const parts = sessions.prepare(`SELECT m.data AS m, p.data AS p FROM message m JOIN part p ON p.message_id = m.id
    WHERE m.session_id = ? ORDER BY p.rowid`).all(run.session_id);
  for (const r of parts) {
    const role = JSON.parse(r.m).role; const p = JSON.parse(r.p);
    if (p.type === 'text') console.log(role + ':', p.text.slice(0, 500));
  }
})();
