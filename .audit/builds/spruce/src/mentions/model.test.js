import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { badgeStatus, formatRelativeTime, listStatus, parseMentions, unseenCount } from './model.js'

const NOW = Date.parse('2026-10-21T18:00:00.000Z')
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

test('the remote payload has more than one mention and three unseen', () => {
  const body = JSON.parse(readFileSync(new URL('./mentions.json', import.meta.url), 'utf8'))
  const mentions = parseMentions(body, NOW)
  assert.ok(mentions.length > 1)
  assert.equal(unseenCount(mentions), 3)
  assert.equal(listStatus({ phase: 'ready', mentions }), 'populated')
  assert.equal(badgeStatus({ phase: 'ready', mentions }), 'populated')
  assert.deepEqual(
    mentions.map((mention) => formatRelativeTime(mention.createdAt, NOW)),
    ['45m', '3h', '2d', 'Sep 30, 2026'],
  )
  assert.deepEqual(
    mentions.map((mention) => mention.authorName),
    ['Sam Okonkwo', 'Riley Chen', 'Jules Park', 'Mora Ellison'],
  )
})

test('an empty payload is an empty list and a zero count', () => {
  const mentions = parseMentions({ mentions: [] }, NOW)
  assert.deepEqual(mentions, [])
  assert.equal(listStatus({ phase: 'ready', mentions }), 'empty')
  assert.equal(badgeStatus({ phase: 'ready', mentions }), 'empty')
  assert.equal(unseenCount(mentions), 0)
})

test('a populated list with nothing unseen hides the count', () => {
  const mentions = parseMentions(
    {
      mentions: [
        { id: 'a', authorName: 'Ada', avatarSrc: null, excerpt: 'Hi', ageMs: HOUR, seen: true },
        { id: 'b', authorName: 'Bea', avatarSrc: null, excerpt: 'Hi', ageMs: 2 * HOUR, seen: true },
      ],
    },
    NOW,
  )
  assert.equal(mentions.length, 2)
  assert.equal(listStatus({ phase: 'ready', mentions }), 'populated')
  assert.equal(badgeStatus({ phase: 'ready', mentions }), 'empty')
})

test('loading and failure have no count yet', () => {
  assert.equal(listStatus({ phase: 'loading' }), 'loading')
  assert.equal(listStatus({ phase: 'failed' }), 'failed')
  assert.equal(badgeStatus({ phase: 'loading' }), 'loading')
  assert.equal(badgeStatus({ phase: 'failed' }), 'failed')
})

test('relative time stays short under 7 days and becomes a date at 7 days', () => {
  assert.equal(formatRelativeTime(NOW - 30 * 1000, NOW), 'now')
  assert.equal(formatRelativeTime(NOW - 60 * 1000, NOW), '1m')
  assert.equal(formatRelativeTime(NOW - 3 * HOUR, NOW), '3h')
  assert.equal(formatRelativeTime(NOW - 6 * DAY, NOW), '6d')
  assert.equal(formatRelativeTime(NOW - 7 * DAY, NOW), 'Oct 14, 2026')
})

test('a payload that is not a mention list is rejected', () => {
  assert.throws(() => parseMentions(null, NOW))
  assert.throws(() => parseMentions({ notes: [] }, NOW))
  assert.throws(() => parseMentions({ mentions: [{ id: 'x' }] }, NOW))
  assert.throws(() =>
    parseMentions(
      {
        mentions: [
          { id: 'x', authorName: 'Ada', avatarSrc: null, excerpt: 'Hi', ageMs: -1, seen: false },
        ],
      },
      NOW,
    ),
  )
})
