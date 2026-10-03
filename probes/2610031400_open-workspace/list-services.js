(() => {
  const root = document.getElementById('root')
  const containerKey = Object.keys(root).find(k => k.startsWith('__reactContainer'))
  const start = root[containerKey], seen = new Set(), queue = [start, start?.stateNode?.current]
  let services
  while (queue.length) {
    const fiber = queue.shift()
    if (!fiber || seen.has(fiber)) continue
    seen.add(fiber)
    if (fiber.memoizedProps?.services) { services = fiber.memoizedProps.services; break }
    queue.push(fiber.child, fiber.sibling, fiber.alternate)
  }
  const methodsOf = object => {
    const names = new Set()
    for (let o = object; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
      for (const name of Object.getOwnPropertyNames(o)) if (name !== 'constructor' && typeof object[name] === 'function') names.add(name)
    }
    return [...names].sort()
  }
  const result = { url: location.href, title: document.title, services: {} }
  for (const [name, service] of Object.entries(services)) result.services[name] = service && typeof service === 'object' ? methodsOf(service) : typeof service
  return result
})()
