const text = (value) => value == null ? '' : String(value).trim()
const DEFAULT_OPTIONS = Object.freeze({ lambda:1, tolerance:1e-6, maxIterations:12 })

export const ALGORITHM_VERSION = 'bradley-terry-l2-lambda1-v1'

export function eligibleRankingBooks(books = []) {
  return (Array.isArray(books) ? books : []).filter((book = {}) =>
    text(book.status).toLowerCase() === 'read' && Boolean(text(book.bookId)))
}

export function effectiveDecisions(events = []) {
  const input = Array.isArray(events) ? events : []
  const voided = new Set(input
    .filter((event = {}) => text(event.eventType).toLowerCase() === 'void')
    .map((event) => text(event.targetEventId))
    .filter(Boolean))
  return input.filter((event = {}) =>
    text(event.eventType).toLowerCase() === 'decision' &&
    Boolean(text(event.eventId)) &&
    !voided.has(text(event.eventId)))
}

function rotateRight(value, amount) {
  return value >>> amount | value << (32 - amount)
}

// Synchronous SHA-256 keeps the revision helper usable in both browser and Node ES modules.
function sha256(input) {
  const bytes = new TextEncoder().encode(String(input))
  const bitLength = bytes.length * 8
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64
  const padded = new Uint8Array(paddedLength)
  padded.set(bytes)
  padded[bytes.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false)
  view.setUint32(paddedLength - 4, bitLength >>> 0, false)

  const constants = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
  ]
  const hash = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]
  const words = new Uint32Array(64)
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4, false)
    for (let index = 16; index < 64; index += 1) {
      const left = words[index - 15]
      const right = words[index - 2]
      const sigma0 = rotateRight(left, 7) ^ rotateRight(left, 18) ^ left >>> 3
      const sigma1 = rotateRight(right, 17) ^ rotateRight(right, 19) ^ right >>> 10
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0
    }
    let [a,b,c,d,e,f,g,h] = hash
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)
      const choose = e & f ^ ~e & g
      const temp1 = (h + sum1 + choose + constants[index] + words[index]) >>> 0
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)
      const majority = a & b ^ a & c ^ b & c
      const temp2 = (sum0 + majority) >>> 0
      h = g; g = f; f = e; e = (d + temp1) >>> 0
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0
    }
    const next = [a,b,c,d,e,f,g,h]
    for (let index = 0; index < 8; index += 1) hash[index] = (hash[index] + next[index]) >>> 0
  }
  return hash.map((value) => value.toString(16).padStart(8, '0')).join('')
}

function eventSignature(event = {}) {
  return [
    text(event.eventId), text(event.eventType), text(event.clientRequestId),
    text(event.bookAId), text(event.bookBId), text(event.outcome), text(event.targetEventId),
  ].join('\u001f')
}

export function rankingRevision(events = []) {
  return sha256(effectiveDecisions(events).map(eventSignature).sort().join('\u001e'))
}

function solve(matrix, vector) {
  const size = vector.length
  const augmented = matrix.map((row, index) => [...row, vector[index]])
  for (let column = 0; column < size; column += 1) {
    let pivot = column
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row
    }
    if (Math.abs(augmented[pivot][column]) < 1e-12) throw new Error('Ranking matrix is singular')
    ;[augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]]
    const divisor = augmented[column][column]
    for (let index = column; index <= size; index += 1) augmented[column][index] /= divisor
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue
      const factor = augmented[row][column]
      for (let index = column; index <= size; index += 1) augmented[row][index] -= factor * augmented[column][index]
    }
  }
  return augmented.map((row) => row[size])
}

function invert(matrix) {
  const size = matrix.length
  const augmented = matrix.map((row, rowIndex) => [
    ...row,
    ...Array.from({ length:size }, (_value, columnIndex) => rowIndex === columnIndex ? 1 : 0),
  ])
  for (let column = 0; column < size; column += 1) {
    let pivot = column
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row
    }
    if (Math.abs(augmented[pivot][column]) < 1e-12) throw new Error('Ranking matrix is singular')
    ;[augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]]
    const divisor = augmented[column][column]
    for (let index = 0; index < size * 2; index += 1) augmented[column][index] /= divisor
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue
      const factor = augmented[row][column]
      for (let index = 0; index < size * 2; index += 1) augmented[row][index] -= factor * augmented[column][index]
    }
  }
  return augmented.map((row) => row.slice(size))
}

function informationAt(strengths, comparisons, lambda) {
  const size = strengths.length
  const information = Array.from({ length:size }, (_value, row) =>
    Array.from({ length:size }, (_inner, column) => row === column ? lambda : 0))
  for (const { left, right } of comparisons) {
    const difference = Math.max(-30, Math.min(30, strengths[left] - strengths[right]))
    const probability = 1 / (1 + Math.exp(-difference))
    const weight = probability * (1 - probability)
    information[left][left] += weight
    information[right][right] += weight
    information[left][right] -= weight
    information[right][left] -= weight
  }
  return information
}

function connectedComponents(bookIds, comparisons) {
  const neighbours = new Map(bookIds.map((bookId) => [bookId, new Set()]))
  comparisons.forEach(({ leftId, rightId }) => {
    neighbours.get(leftId)?.add(rightId)
    neighbours.get(rightId)?.add(leftId)
  })
  const componentByBookId = new Map()
  let component = 0
  for (const bookId of bookIds) {
    if (componentByBookId.has(bookId)) continue
    const stack = [bookId]
    while (stack.length) {
      const current = stack.pop()
      if (componentByBookId.has(current)) continue
      componentByBookId.set(current, component)
      neighbours.get(current)?.forEach((next) => stack.push(next))
    }
    component += 1
  }
  const sizes = new Map()
  componentByBookId.forEach((value) => sizes.set(value, (sizes.get(value) || 0) + 1))
  const largest = [...sizes.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0]
  return { componentByBookId, largest }
}

export function fitBradleyTerry(bookIds = [], events = [], options = {}) {
  const ids = [...new Set((Array.isArray(bookIds) ? bookIds : []).map(text).filter(Boolean))].sort()
  const config = { ...DEFAULT_OPTIONS, ...options }
  const indexById = new Map(ids.map((bookId, index) => [bookId, index]))
  const comparisons = effectiveDecisions(events).flatMap((event = {}) => {
    const leftId = text(event.bookAId)
    const rightId = text(event.bookBId)
    const left = indexById.get(leftId)
    const right = indexById.get(rightId)
    const outcome = text(event.outcome).toLowerCase()
    if (left == null || right == null || left === right || !['a','b','tie'].includes(outcome)) return []
    return [{ left, right, leftId, rightId, score:outcome === 'a' ? 1 : outcome === 'b' ? 0 : 0.5 }]
  })
  if (!ids.length) return new Map()

  const strengths = Array(ids.length).fill(0)
  for (let iteration = 0; iteration < config.maxIterations; iteration += 1) {
    const gradient = strengths.map((value) => -config.lambda * value)
    const information = informationAt(strengths, comparisons, config.lambda)
    for (const { left, right, score } of comparisons) {
      const difference = Math.max(-30, Math.min(30, strengths[left] - strengths[right]))
      const probability = 1 / (1 + Math.exp(-difference))
      const residual = score - probability
      gradient[left] += residual
      gradient[right] -= residual
    }
    const step = solve(information, gradient)
    let maximumStep = 0
    for (let index = 0; index < strengths.length; index += 1) {
      strengths[index] += step[index]
      maximumStep = Math.max(maximumStep, Math.abs(step[index]))
    }
    if (maximumStep < config.tolerance) break
  }
  const mean = strengths.reduce((sum, value) => sum + value, 0) / strengths.length
  strengths.forEach((_value, index) => { strengths[index] -= mean })
  const covariance = invert(informationAt(strengths, comparisons, config.lambda))
  const decisions = new Map(ids.map((bookId) => [bookId, 0]))
  const opponents = new Map(ids.map((bookId) => [bookId, new Set()]))
  comparisons.forEach(({ leftId, rightId }) => {
    decisions.set(leftId, decisions.get(leftId) + 1)
    decisions.set(rightId, decisions.get(rightId) + 1)
    opponents.get(leftId).add(rightId)
    opponents.get(rightId).add(leftId)
  })
  const components = connectedComponents(ids, comparisons)
  return new Map(ids.map((bookId, index) => {
    const decisionCount = decisions.get(bookId)
    const opponentCount = opponents.get(bookId).size
    const disconnected = components.componentByBookId.get(bookId) !== components.largest
    return [bookId, {
      strength:strengths[index],
      standardError:Math.sqrt(Math.max(covariance[index][index], 0)),
      decisions:decisionCount,
      opponents:opponentCount,
      provisional:decisionCount < 5 || opponentCount < 3 || disconnected,
    }]
  }))
}

export function rankBooks(books = [], events = [], options = {}) {
  const eligible = eligibleRankingBooks(books)
  const fitted = fitBradleyTerry(eligible.map(({ bookId }) => bookId), events, options)
  return eligible.map((book) => ({ ...book, ...fitted.get(text(book.bookId)) }))
    .sort((left, right) => right.strength - left.strength || text(left.title).localeCompare(text(right.title)) || text(left.bookId).localeCompare(text(right.bookId)))
    .map((book, index) => ({ ...book, rank:index + 1 }))
}
