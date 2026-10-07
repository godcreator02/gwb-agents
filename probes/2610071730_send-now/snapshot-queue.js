// 读测试会话的任务快照，找跟队列有关的字段（只读）
(async () => {
  const root = document.getElementById('root')
  const containerKey = Object.keys(root).find(k => k.startsWith('__reactContainer'))
  const start = root[containerKey], seen = new Set(), queue = [start, start?.stateNode?.current]
  let service
  while (queue.length) {
    const fiber = queue.shift()
    if (!fiber || seen.has(fiber)) continue
    seen.add(fiber)
    service = fiber.memoizedProps?.services?.zcodeTaskService
    if (service) break
    queue.push(fiber.child, fiber.sibling, fiber.alternate)
  }
  const snapshot = await service.getTaskSnapshot({
    workspacePath: 'D:\\unitfolders\\evew5-gwbapps\\gwb-agents\\probes\\2610071730_send-now',
    taskId: 'sess_65476174-2799-4f22-85a8-befd1a47a18e',
    messageLimit: 5,
    clientMode: 'desktop-continuous',
  })
  const paths = []
  const walk = (value, path, depth) => {
    if (depth > 6 || value === null || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value)) {
      const here = `${path}.${key}`
      if (/queue|pending|steer|guide|delivery/i.test(key)) paths.push([here, JSON.stringify(child)?.slice(0, 400)])
      walk(child, here, depth + 1)
    }
  }
  walk(snapshot, 'snapshot', 0)
  return { topKeys: Object.keys(snapshot), paths }
})()
