// "1h30m" → 5400，"45s" → 45，"2m5s" → 125，返回秒数；空串和不认识的格式抛 Error
export function parseDuration(text) {
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(text)
  if (!match) throw new Error(`bad duration: ${text}`)
  const [, h = 0, m = 0, s = 0] = match
  return h * 3600 + m * 60 + s
}
