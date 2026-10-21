import { badgeStatus, formatRelativeTime, listStatus, parseMentions, unseenCount } from './model.js'

const spruce = globalThis.ShopSpruce
if (spruce == null) throw new Error('ShopSpruce components did not load.')

const { AsyncList, Avatar, Badge, EmptyState, RowSkeleton } = spruce

const listHost = document.querySelector('[data-mentions-list]')
const badgeHost = document.querySelector('[data-unseen-count]')
const unseenLabel = document.querySelector('[data-unseen-label]')
const demo = new URLSearchParams(location.search).get('demo')

let result = { phase: 'loading' }
let requestId = 0

load()

function load() {
  const id = ++requestId
  result = { phase: 'loading' }
  render()
  if (demo === 'loading') return
  fetch(mentionsUrl(demo))
    .then((response) => {
      if (!response.ok) throw new Error('Mentions request failed.')
      return response.json()
    })
    .then((body) => {
      if (id !== requestId) return
      result = { phase: 'ready', mentions: parseMentions(body, Date.now()) }
      render()
    })
    .catch(() => {
      if (id !== requestId) return
      result = { phase: 'failed' }
      render()
    })
}

function mentionsUrl(mode) {
  if (mode === 'empty') return new URL('mentions-empty.json', import.meta.url)
  if (mode === 'failed') return new URL('mentions-missing.json', import.meta.url)
  return new URL('mentions.json', import.meta.url)
}

function render() {
  renderBadge()
  renderList()
}

function renderBadge() {
  const status = badgeStatus(result)
  badgeHost.replaceChildren()
  if (status === 'loading' || status === 'failed') {
    unseenLabel.textContent = ''
    return
  }
  const count = unseenCount(result.mentions)
  const badge = Badge({ count })
  if (badge) {
    badge.setAttribute('aria-hidden', 'true')
    badgeHost.append(badge)
  }
  unseenLabel.textContent = count === 0 ? 'No unseen mentions' : `${count} unseen`
}

function renderList() {
  const status = listStatus(result)
  listHost.setAttribute('aria-busy', status === 'loading' ? 'true' : 'false')
  const mentions = result.phase === 'ready' ? result.mentions : []
  AsyncList({
    mount: listHost,
    status,
    empty: emptyState(),
    loading: loadingState(),
    failed: failedState(),
    populated: populatedState(mentions, Date.now()),
  })
}

function emptyState() {
  return EmptyState({
    illustration: atIllustration(),
    sentence: 'Mentions of you will show up here.',
  })
}

function loadingState() {
  const wrap = document.createElement('div')
  wrap.className = 'skeletons'
  wrap.append(RowSkeleton(), RowSkeleton(), RowSkeleton())
  return wrap
}

function failedState() {
  const wrap = document.createElement('div')
  wrap.className = 'retry-inline'
  const sentence = document.createElement('p')
  sentence.textContent = 'Mentions could not be loaded.'
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = 'Retry'
  button.addEventListener('click', load)
  wrap.append(sentence, button)
  return wrap
}

function populatedState(mentions, now) {
  const list = document.createElement('ul')
  list.className = 'mention-list'
  for (const mention of mentions) list.append(MentionRow(mention, now))
  return list
}

function MentionRow(mention, now) {
  const row = document.createElement('li')
  row.className = mention.seen ? 'mention' : 'mention is-unseen'
  row.append(Avatar({ name: mention.authorName, src: mention.avatarSrc }))
  const body = document.createElement('div')
  body.className = 'mention-body'
  const top = document.createElement('div')
  top.className = 'mention-top'
  const name = document.createElement('strong')
  name.textContent = mention.authorName
  const time = document.createElement('time')
  time.dateTime = new Date(mention.createdAt).toISOString()
  time.textContent = formatRelativeTime(mention.createdAt, now)
  const excerpt = document.createElement('p')
  excerpt.textContent = mention.excerpt
  top.append(name, time)
  body.append(top, excerpt)
  row.append(body)
  return row
}

function atIllustration() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('class', 'empty-illustration')
  svg.setAttribute('viewBox', '0 0 48 48')
  svg.setAttribute('width', '48')
  svg.setAttribute('height', '48')
  svg.setAttribute('aria-hidden', 'true')
  const circle = document.createElementNS(svg.namespaceURI, 'circle')
  circle.setAttribute('cx', '24')
  circle.setAttribute('cy', '24')
  circle.setAttribute('r', '18')
  circle.setAttribute('fill', 'none')
  circle.setAttribute('stroke', 'currentColor')
  circle.setAttribute('stroke-width', '2')
  const mark = document.createElementNS(svg.namespaceURI, 'text')
  mark.setAttribute('x', '24')
  mark.setAttribute('y', '31')
  mark.setAttribute('text-anchor', 'middle')
  mark.setAttribute('font-size', '22')
  mark.setAttribute('fill', 'currentColor')
  mark.textContent = '@'
  svg.append(circle, mark)
  return svg
}
