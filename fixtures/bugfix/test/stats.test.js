import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mean, median, percentile } from '../src/stats.js'

test('mean', () => {
  assert.equal(mean([1, 2, 3, 4]), 2.5)
  assert.throws(() => mean([]), RangeError)
})

test('median 奇数个', () => {
  assert.equal(median([5, 1, 3]), 3)
})

test('median 偶数个取中间两个的平均', () => {
  assert.equal(median([1, 2, 3, 4]), 2.5)
})

test('median 按数值排序', () => {
  assert.equal(median([10, 2, 33]), 10)
})

test('median 不改动传入的数组', () => {
  const values = [3, 1, 2]
  median(values)
  assert.deepEqual(values, [3, 1, 2])
})

test('percentile nearest-rank', () => {
  const values = [15, 20, 35, 40, 50]
  assert.equal(percentile(values, 30), 20)
  assert.equal(percentile(values, 40), 20)
  assert.equal(percentile(values, 100), 50)
  assert.equal(percentile(values, 0), 15)
})
