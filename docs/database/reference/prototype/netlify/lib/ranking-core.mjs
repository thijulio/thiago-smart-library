import { effectiveDecisions, eligibleRankingBooks } from '../../src/ranking-engine.mjs'
import { pairKey } from '../../src/ranking-scheduler.mjs'

const text = (value) => value == null ? '' : String(value).trim()
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const COMPARISON_HEADERS = Object.freeze([
  'Event ID','Event Type','Client Request ID','Pair Key','Book A ID','Book B ID',
  'Outcome','Compared At','Session ID','Target Event ID','Actor','Algorithm Version',
])

export const RANKING_HEADERS = Object.freeze([
  'Book ID','Rank','Preference Strength','Standard Error','Effective Decisions',
  'Distinct Opponents','Provisional','Calculated At','Algorithm Version','Data Revision',
])

export class RankingError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.name = 'RankingError'
    this.status = status
  }
}

function requireExactHeaders(actual = [], expected, label) {
  const normalized = Array.from(actual, text)
  if (normalized.length !== expected.length || expected.some((header, index) => normalized[index] !== header)) {
    throw new RankingError(`${label} schema does not match the required headers`, 409)
  }
}

export function comparisonRow(event = {}) {
  return [
    event.eventId, event.eventType, event.clientRequestId, event.pairKey,
    event.bookAId, event.bookBId, event.outcome, event.comparedAt,
    event.sessionId, event.targetEventId, event.actor, event.algorithmVersion,
  ].map((value) => value == null ? '' : value)
}

function eventFromRow(row = []) {
  return {
    eventId:text(row[0]), eventType:text(row[1]), clientRequestId:text(row[2]), pairKey:text(row[3]),
    bookAId:text(row[4]), bookBId:text(row[5]), outcome:text(row[6]), comparedAt:text(row[7]),
    sessionId:text(row[8]), targetEventId:text(row[9]), actor:text(row[10]), algorithmVersion:text(row[11]),
  }
}

export function parseComparisonRows(values = []) {
  const [headers = [], ...rows] = Array.isArray(values) ? values : []
  requireExactHeaders(headers, COMPARISON_HEADERS, 'Book Comparisons')
  return rows.filter((row = []) => row.some((value) => text(value))).map(eventFromRow)
}

export function rankingRows(rankings = [], {
  calculatedAt = '', algorithmVersion = '', dataRevision = '',
} = {}) {
  return (Array.isArray(rankings) ? rankings : []).map((ranking = {}) => [
    text(ranking.bookId), Number(ranking.rank), Number(ranking.strength), Number(ranking.standardError),
    Number(ranking.decisions), Number(ranking.opponents), ranking.provisional ? 'TRUE' : 'FALSE',
    text(calculatedAt), text(algorithmVersion), text(dataRevision),
  ])
}

function requireUuid(value, label) {
  const normalized = text(value)
  if (!UUID.test(normalized)) throw new RankingError(`${label} must be a UUID`)
  return normalized
}

function requireOutcome(value) {
  const normalized = text(value).toLowerCase()
  const outcomes = { a:'A', b:'B', tie:'Tie' }
  if (!outcomes[normalized]) throw new RankingError('Outcome must be A, B, or Tie')
  return outcomes[normalized]
}

function duplicateFor(clientRequestId, events) {
  return (Array.isArray(events) ? events : []).find((event = {}) => text(event.clientRequestId) === clientRequestId) || null
}

export function validateDecision(input = {}, books = [], events = []) {
  const clientRequestId = requireUuid(input.clientRequestId, 'Client request ID')
  const sessionId = requireUuid(input.sessionId, 'Session ID')
  const bookAId = text(input.bookAId)
  const bookBId = text(input.bookBId)
  const outcome = requireOutcome(input.outcome)
  if (!bookAId || !bookBId || bookAId === bookBId) throw new RankingError('Two different books are required')
  const eligibleIds = new Set(eligibleRankingBooks(books).map(({ bookId }) => text(bookId)))
  if (!eligibleIds.has(bookAId) || !eligibleIds.has(bookBId)) throw new RankingError('Both books must be eligible completed books', 409)
  const key = pairKey(bookAId, bookBId)
  const duplicateEvent = duplicateFor(clientRequestId, events)
  if (duplicateEvent) {
    const samePayload = text(duplicateEvent.pairKey) === key && text(duplicateEvent.outcome) === outcome
    if (!samePayload) throw new RankingError('Client request ID was already used for another decision', 409)
  }
  const activeForPair = effectiveDecisions(events).filter((event) => text(event.pairKey || pairKey(event.bookAId, event.bookBId)) === key)
  return {
    clientRequestId, sessionId, bookAId, bookBId, pairKey:key, outcome,
    duplicateEvent,
    supersededEvent:duplicateEvent ? null : activeForPair.at(-1) || null,
  }
}

export function validateUndo(input = {}, events = []) {
  const clientRequestId = requireUuid(input.clientRequestId, 'Client request ID')
  const duplicateEvent = duplicateFor(clientRequestId, events)
  if (duplicateEvent) return { clientRequestId, target:null, duplicateEvent }
  const eventId = text(input.eventId)
  if (!UUID.test(eventId)) throw new RankingError('Event ID must be a UUID')
  const target = effectiveDecisions(events).find((event) => text(event.eventId) === eventId)
  if (!target) throw new RankingError('Comparison is already inactive or was not found', 409)
  return { clientRequestId, target, duplicateEvent:null }
}
