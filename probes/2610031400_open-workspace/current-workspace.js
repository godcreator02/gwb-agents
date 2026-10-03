(() => {
  const root = document.getElementById('root')
  const containerKey = Object.keys(root).find(k => k.startsWith('__reactContainer'))
  const start = root[containerKey], seen = new Set(), queue = [start, start?.stateNode?.current]
  const counts = {}
  while (queue.length) {
    const fiber = queue.shift()
    if (!fiber || seen.has(fiber)) continue
    seen.add(fiber)
    const props = fiber.memoizedProps
    if (props && typeof props === 'object') {
      for (const key of ['workspacePath', 'currentProjectPath', 'projectPath', 'activeWorkspacePath']) {
        const value = props[key]
        if (typeof value === 'string') counts[`${key}=${value}`] = (counts[`${key}=${value}`] ?? 0) + 1
      }
    }
    queue.push(fiber.child, fiber.sibling)
  }
  return { title: document.title, workspaceProps: counts }
})()
