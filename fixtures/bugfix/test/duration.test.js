import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseDuration } from '../src/duration.js'

test('parseDuration 组合', () => {
  assert.equal(parseDuration('1h30m'), 5400)
  assert.equal(parseDuration('2m5s'), 125)
})

test('parseDuration 只有秒', () => {
  assert.equal(parseDuration('45s'), 45)
})

test('parseDuration 拒绝坏格式', () => {
  assert.throws(() => parseDuration('abc'))
  assert.throws(() => parseDuration(''))
})
