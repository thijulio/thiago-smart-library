import { effectiveDecisions, eligibleRankingBooks } from './ranking-engine.mjs'

const text = (value) => value == null ? '' : String(value).trim()
const PAIR_COOLDOWN_DECISIONS = 12

export function pairKey(leftId, rightId) {
  return [text(leftId), text(rightId)].sort().join('::')
}

function hash(value) {
  let output = 2166136261
  for (const character of String(value)) {
    output ^= character.charCodeAt(0)
    output = Math.imul(output, 16777619)
  }
  return output >>> 0
}

function comparisonState(books, events) {
  const ids = books.map(({ bookId }) => text(bookId)).filter(Boolean)
  const neighbours = new Map(ids.map((bookId) => [bookId, new Set()]))
  const exposure = new Map(ids.map((bookId) => [bookId, 0]))
  const pairExposure = new Map()
  for (const event of effectiveDecisions(events)) {
    const left = text(event.bookAId)
    const right = text(event.bookBId)
    if (!neighbours.has(left) || !neighbours.has(right) || left === right) continue
    neighbours.get(left).add(right)
    neighbours.get(right).add(left)
  }
  for (const event of recordedDecisions(events)) {
    const left = text(event.bookAId)
    const right = text(event.bookBId)
    if (!exposure.has(left) || !exposure.has(right) || left === right) continue
    exposure.set(left, exposure.get(left) + 1)
    exposure.set(right, exposure.get(right) + 1)
    const key = pairKey(left, right)
    pairExposure.set(key, (pairExposure.get(key) || 0) + 1)
  }
  const component = new Map()
  let componentId = 0
  for (const bookId of ids) {
    if (component.has(bookId)) continue
    const stack = [bookId]
    while (stack.length) {
      const current = stack.pop()
      if (component.has(current)) continue
      component.set(current, componentId)
      neighbours.get(current)?.forEach((next) => stack.push(next))
    }
    componentId += 1
  }
  return { neighbours, exposure, pairExposure, component }
}

function recordedDecisions(events = []) {
  return (Array.isArray(events) ? events : []).filter((event = {}) =>
    text(event.eventType).toLowerCase() === 'decision' &&
    Boolean(text(event.bookAId)) &&
    Boolean(text(event.bookBId)))
}

function recentlyShownPairKeys(events = []) {
  return new Set(recordedDecisions(events)
    .slice(-PAIR_COOLDOWN_DECISIONS)
    .map(({ bookAId, bookBId }) => pairKey(bookAId, bookBId)))
}

function allPairs(books) {
  const pairs = []
  for (let left = 0; left < books.length; left += 1) {
    for (let right = left + 1; right < books.length; right += 1) {
      pairs.push({
        bookAId:text(books[left].bookId), bookBId:text(books[right].bookId),
        bookA:books[left], bookB:books[right], pairKey:pairKey(books[left].bookId, books[right].bookId),
      })
    }
  }
  return pairs
}

function acquisitionScore(pair, input, state, rankingById) {
  const left = rankingById.get(pair.bookAId) || {}
  const right = rankingById.get(pair.bookBId) || {}
  const leftCoverage = Math.max(0, 5 - Number(left.decisions || 0)) + Math.max(0, 3 - Number(left.opponents || 0)) * 1.5
  const rightCoverage = Math.max(0, 5 - Number(right.decisions || 0)) + Math.max(0, 3 - Number(right.opponents || 0)) * 1.5
  const bridge = state.component.get(pair.bookAId) !== state.component.get(pair.bookBId) ? 60 : 0
  const difference = Math.abs(Number(left.strength || 0) - Number(right.strength || 0))
  const uncertainty = Number(left.standardError || 1) + Number(right.standardError || 1)
  const closeness = 8 / (1 + difference)
  const boundaries = [10,25,50]
  const boundary = boundaries.some((value) => [Number(left.rank), Number(right.rank)].some((rank) => Math.abs(rank - value) <= 1)) ? 4 : 0
  const diversity = ['author','genre','platform','series'].reduce((score, field) => score + (text(pair.bookA[field]) && text(pair.bookA[field]) !== text(pair.bookB[field]) ? 0.75 : 0), 0)
  const fatigue = (state.exposure.get(pair.bookAId) + state.exposure.get(pair.bookBId)) * 0.35 + (state.pairExposure.get(pair.pairKey) || 0) * 15
  return bridge + (leftCoverage + rightCoverage) * 10 + uncertainty * 3 + closeness + boundary + diversity - fatigue
}

export function selectNextPair({
  books = [], rankings = [], events = [], recentBookIds = [], sessionBookIds = [], previousPairKey = '', seed = '',
} = {}) {
  const eligible = eligibleRankingBooks(books)
  if (eligible.length < 2) return null
  const state = comparisonState(eligible, events)
  const rankingById = new Map((Array.isArray(rankings) ? rankings : []).map((ranking) => [text(ranking.bookId), ranking]))
  const recent = new Set([...recentBookIds, ...sessionBookIds.slice(-2)].map(text).filter(Boolean))
  const recentlyShownPairs = recentlyShownPairKeys(events)
  let candidates = allPairs(eligible).filter((pair) => pair.pairKey !== text(previousPairKey))
  const cooled = candidates.filter((pair) => !recentlyShownPairs.has(pair.pairKey))
  if (cooled.length) candidates = cooled
  const fresh = candidates.filter((pair) => !recent.has(pair.bookAId) && !recent.has(pair.bookBId))
  if (fresh.length && eligible.length - recent.size >= 2) candidates = fresh
  const candidate = candidates.map((pair) => ({
    ...pair,
    // Coverage is the primary objective throughout the lifetime of the library.
    // Acquisition quality chooses between equally under-compared pairs.
    exposure:state.exposure.get(pair.bookAId) + state.exposure.get(pair.bookBId),
    score:acquisitionScore(pair, { books:eligible, rankings, events }, state, rankingById),
    tieBreak:hash(`${seed}\u001f${pair.pairKey}`),
  })).sort((left, right) => left.exposure - right.exposure || right.score - left.score || left.tieBreak - right.tieBreak)[0]
  if (!candidate) return null
  const { score, tieBreak, exposure, ...pair } = candidate
  return hash(`${seed}\u001fside\u001f${pair.pairKey}`) % 2
    ? { ...pair, bookAId:pair.bookBId, bookBId:pair.bookAId, bookA:pair.bookB, bookB:pair.bookA }
    : pair
}
