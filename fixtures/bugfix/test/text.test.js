import { test } from 'node:test'
import assert from 'node:assert/strict'
import { slugify, truncate } from '../src/text.js'

test('slugify', () => {
  assert.equal(slugify('Hello World'), 'hello-world')
  assert.equal(slugify('  Hello, World!  '), 'hello-world')
  assert.equal(slugify('a -- b'), 'a-b')
})

test('truncate 不超长时原样返回', () => {
  assert.equal(truncate('abc', 5), 'abc')
})

test('truncate 总长度含省略号', () => {
  assert.equal(truncate('abcdef', 4), 'abc…')
  assert.equal(truncate('abcdef', 4).length, 4)
})
