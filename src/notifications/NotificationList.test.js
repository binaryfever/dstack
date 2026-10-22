import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	UnreadBadge,
	badgeCountForStatus,
	relativeTime,
	renderNotificationList,
	sampleNotifications,
	unreadCount,
} from './NotificationList.js'

const now = new Date('2026-10-11T21:00:00Z')
const items = sampleNotifications(now)

test('empty names the notifications that will appear', () => {
	const html = renderNotificationList('empty', { now, items })
	assert.match(html, /Notifications will show up here\./)
	assert.doesNotMatch(html, /No data/)
})

test('loading is a quiet skeleton', () => {
	const html = renderNotificationList('loading', { now, items })
	assert.match(html, /aria-busy="true"/)
	assert.match(html, /Loading notifications/)
	assert.equal(html.match(/skeleton-row/g)?.length, 3)
})

test('error offers retry in place of the list', () => {
	const html = renderNotificationList('error', { now, items })
	assert.match(html, /Notifications couldn't be loaded\./)
	assert.match(html, /data-action="retry"/)
	assert.doesNotMatch(html, /<ul/)
})

test('success renders one row per notification with avatar and relative time', () => {
	const html = renderNotificationList('success', { now, items })
	assert.match(html, /Maya Chen mentioned you/)
	assert.match(html, /Deploy finished/)
	assert.match(html, /Alex invited you to Billing/)
	assert.match(html, />M</)
	assert.match(html, />D</)
	assert.match(html, />A</)
	assert.match(html, />3h</)
	assert.match(html, />1d</)
	assert.match(html, />Sep 29</)
	assert.equal(html.match(/<li class="row/g)?.length, 3)
	assert.equal(html.match(/aria-label="Unread"/g)?.length, 2)
})

test('relative time switches to a date after a week', () => {
	assert.equal(relativeTime(new Date('2026-10-11T20:30:00Z'), now), '30m')
	assert.equal(relativeTime(new Date('2026-10-04T21:00:00Z'), now), 'Oct 4')
})

test('unread badge hides at zero and caps above 99', () => {
	assert.equal(UnreadBadge(0), '')
	assert.match(UnreadBadge(2), />2</)
	assert.match(UnreadBadge(2), /aria-label="2 unread"/)
	assert.match(UnreadBadge(100), />99\+</)
	assert.match(UnreadBadge(100), /aria-label="99\+ unread"/)
})

test('badge count follows the status switcher', () => {
	assert.equal(badgeCountForStatus('empty', items), 0)
	assert.equal(badgeCountForStatus('loading', items), 0)
	assert.equal(badgeCountForStatus('error', items), 0)
	assert.equal(badgeCountForStatus('success', items), unreadCount(items))
	assert.equal(unreadCount(items), 2)
})
