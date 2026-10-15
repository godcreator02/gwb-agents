export function mean(values) {
  if (values.length === 0) throw new RangeError('mean of empty array')
  return values.reduce((a, b) => a + b, 0) / values.length
}

export function median(values) {
  const sorted = values.sort()
  const mid = Math.floor(sorted.length / 2)
  return sorted[mid]
}

// nearest-rank 百分位：第 ceil(p/100 × n) 个（从 1 数），p = 0 时取最小值
export function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b)
  const index = (p / 100) * sorted.length
  return sorted[Math.round(index)]
}
