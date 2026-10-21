const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY

export function parseMentions(body, now) {
  if (body == null || typeof body !== 'object' || !Array.isArray(body.mentions)) {
    throw new Error('Mentions payload needs a mentions array.')
  }
  return body.mentions.map((item) => parseMention(item, now))
}

export function listStatus(result) {
  if (result.phase === 'loading') return 'loading'
  if (result.phase === 'failed') return 'failed'
  if (result.mentions.length === 0) return 'empty'
  return 'populated'
}

export function unseenCount(mentions) {
  let count = 0
  for (const mention of mentions) {
    if (!mention.seen) count += 1
  }
  return count
}

export function badgeStatus(result) {
  if (result.phase === 'loading') return 'loading'
  if (result.phase === 'failed') return 'failed'
  if (unseenCount(result.mentions) === 0) return 'empty'
  return 'populated'
}

export function formatRelativeTime(createdAt, now) {
  const delta = now - createdAt
  if (delta < MINUTE) return 'now'
  if (delta < HOUR) return `${Math.floor(delta / MINUTE)}m`
  if (delta < DAY) return `${Math.floor(delta / HOUR)}h`
  if (delta < WEEK) return `${Math.floor(delta / DAY)}d`
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(createdAt)
}

function parseMention(item, now) {
  if (item == null || typeof item !== 'object') throw new Error('Bad mention.')
  const id = item.id
  const authorName = item.authorName
  const excerpt = item.excerpt
  const seen = item.seen
  if (typeof id !== 'string' || id === '') throw new Error('Bad mention.')
  if (typeof authorName !== 'string' || authorName === '') throw new Error('Bad mention.')
  if (typeof excerpt !== 'string') throw new Error('Bad mention.')
  if (typeof seen !== 'boolean') throw new Error('Bad mention.')
  if (typeof item.ageMs !== 'number' || !Number.isFinite(item.ageMs) || item.ageMs < 0) {
    throw new Error('Bad mention.')
  }
  let avatarSrc = null
  if (item.avatarSrc != null) {
    if (typeof item.avatarSrc !== 'string' || item.avatarSrc === '') throw new Error('Bad mention.')
    avatarSrc = item.avatarSrc
  }
  return {
    id,
    authorName,
    avatarSrc,
    excerpt,
    createdAt: now - item.ageMs,
    seen,
  }
}
