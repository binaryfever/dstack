const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const STATUSES = [
	['empty', 'Empty'],
	['loading', 'Loading'],
	['error', 'Error'],
	['success', 'Success'],
]

export function relativeTime(at, now) {
	const delta = now.getTime() - at.getTime()
	if (delta < HOUR) return `${Math.max(1, Math.round(delta / MINUTE))}m`
	if (delta < DAY) return `${Math.max(1, Math.round(delta / HOUR))}h`
	if (delta < 7 * DAY) return `${Math.max(1, Math.round(delta / DAY))}d`
	return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(at)
}

export function sampleNotifications(now) {
	return [
		{
			id: 'mention',
			name: 'Maya Chen',
			title: 'Maya Chen mentioned you',
			body: 'Can we tighten the empty state copy?',
			at: new Date(now.getTime() - 3 * HOUR),
			unread: true,
		},
		{
			id: 'deploy',
			name: 'Deploy',
			title: 'Deploy finished',
			body: 'shop-web is live on production.',
			at: new Date(now.getTime() - 26 * HOUR),
			unread: true,
		},
		{
			id: 'invite',
			name: 'Alex Rivera',
			title: 'Alex invited you to Billing',
			body: 'You can review invoices and plans.',
			at: new Date(now.getTime() - 12 * DAY),
			unread: false,
		},
	]
}

function escapeHtml(value) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
}

export function Avatar(name) {
	const initial = name.trim().charAt(0).toUpperCase() || '?'
	return `<span class="avatar" aria-hidden="true">${escapeHtml(initial)}</span>`
}

export function RelativeTime(at, now) {
	return `<time class="time" datetime="${at.toISOString()}">${escapeHtml(relativeTime(at, now))}</time>`
}

export function NotificationRow(item, now) {
	const unread = item.unread ? '<span class="dot" role="img" aria-label="Unread"></span>' : ''
	return `<li class="row${item.unread ? ' is-unread' : ''}">
		<span class="avatar-wrap">${Avatar(item.name)}${unread}</span>
		<div class="row-copy">
			<p class="row-title">${escapeHtml(item.title)}</p>
			<p class="row-body">${escapeHtml(item.body)}</p>
		</div>
		${RelativeTime(item.at, now)}
	</li>`
}

export function EmptyNotifications() {
	return `<div class="state empty">
		<svg class="mark" viewBox="0 0 48 48" aria-hidden="true">
			<path d="M8 16h32l-4 18H12L8 16Z" fill="none" stroke="currentColor" stroke-width="1.5" />
			<path d="M8 16l8-6h16l8 6" fill="none" stroke="currentColor" stroke-width="1.5" />
			<path d="M20 28h8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
		</svg>
		<p>Notifications will show up here.</p>
	</div>`
}

export function NotificationSkeleton() {
	const row = `<div class="skeleton-row" aria-hidden="true">
		<span class="bone avatar-bone"></span>
		<span class="bone-copy">
			<span class="bone title-bone"></span>
			<span class="bone body-bone"></span>
		</span>
		<span class="bone time-bone"></span>
	</div>`
	return `<div class="state skeleton" aria-busy="true">
		<p class="sr-only">Loading notifications</p>
		${row}${row}${row}
	</div>`
}

export function NotificationError() {
	return `<div class="state error" role="alert">
		<p>Notifications couldn't be loaded.</p>
		<button type="button" data-action="retry">Retry</button>
	</div>`
}

export function unreadCount(items) {
	return items.reduce((count, item) => count + (item.unread ? 1 : 0), 0)
}

export function badgeCountForStatus(status, items) {
	if (status === 'success') return unreadCount(items)
	return 0
}

export function UnreadBadge(count) {
	if (count <= 0) return ''
	const text = count > 99 ? '99+' : String(count)
	return `<span class="badge" aria-label="${escapeHtml(text)} unread">${escapeHtml(text)}</span>`
}

export function renderNotificationList(status, { now, items }) {
	if (status === 'empty') return EmptyNotifications()
	if (status === 'loading') return NotificationSkeleton()
	if (status === 'error') return NotificationError()
	const rows = items.map((item) => NotificationRow(item, now)).join('')
	return `<ul class="rows">${rows}</ul>`
}

export function mount(root, options = {}) {
	const now = options.now ?? new Date()
	const items = options.items ?? sampleNotifications(now)
	let status = options.status ?? 'empty'
	let timer = 0
	const buttons = STATUSES.map(
		([value, label]) => `<button type="button" data-status="${value}" aria-pressed="false">${label}</button>`,
	).join('')
	root.innerHTML = `<section class="shell">
		<header class="titlebar">
			<h1>Notifications</h1>
			<div class="badge-slot"></div>
		</header>
		<div class="switcher" role="group" aria-label="Notification state">${buttons}</div>
		<div class="panel"></div>
	</section>`
	const badgeSlot = root.querySelector('.badge-slot')
	if (badgeSlot == null) throw new Error('Notification list is missing its badge slot.')
	const panel = root.querySelector('.panel')
	if (panel == null) throw new Error('Notification list is missing its panel.')

	function draw() {
		panel.dataset.state = status
		panel.innerHTML = renderNotificationList(status, { now, items })
		badgeSlot.innerHTML = UnreadBadge(badgeCountForStatus(status, items))
		for (const button of root.querySelectorAll('[data-status]')) {
			button.setAttribute('aria-pressed', button.getAttribute('data-status') === status ? 'true' : 'false')
		}
	}

	root.addEventListener('click', (event) => {
		const target = event.target instanceof Element ? event.target.closest('[data-status], [data-action]') : null
		if (target == null || !root.contains(target)) return
		const next = target.getAttribute('data-status')
		if (next != null) {
			window.clearTimeout(timer)
			status = next
			draw()
			return
		}
		if (target.getAttribute('data-action') === 'retry') {
			window.clearTimeout(timer)
			status = 'loading'
			draw()
			timer = window.setTimeout(() => {
				status = 'success'
				draw()
			}, 700)
		}
	})

	draw()
	return {
		get status() {
			return status
		},
	}
}

if (typeof document !== 'undefined') {
	const root = document.querySelector('#app')
	if (root != null) mount(root)
}
