// The Book Recaps tab is the canonical, editable representation of recaps.
// Keep this module dependency-free so the same contract is used by validation,
// migration scripts, the Netlify function, and tests.
export const RECAP_HEADERS = [
  'Book ID',
  'Title',
  'Author',
  'Status',
  'Verified At',
  'Edition',
  'Quick Refresher',
  'Characters and Key Figures',
  'Cheat Sheet',
  'Full Story',
  'Series Handoff',
  'Sources',
  'Paragraph Sources',
  'Reason',
  'Updated At',
]

const lineSeparator = ' — '
const text = value => String(value ?? '').trim()
const lines = value => text(value).split(/\r?\n/).map(item => item.trim()).filter(Boolean)
const paragraphs = value => text(value).split(/\r?\n\s*\r?\n/).map(item => item.trim()).filter(Boolean)
const columnValue = (row, columns, name) => row[columns.get(name)] ?? ''

function fail(message) {
  throw new Error(`Invalid Book Recaps sheet: ${message}`)
}

function parseNamedLines(value, label) {
  return lines(value).map(line => {
    const divider = line.indexOf(lineSeparator)
    if(divider < 1 || !line.slice(divider + lineSeparator.length).trim()) fail(`invalid ${label} line`)
    return {
      name:line.slice(0, divider).trim(),
      description:line.slice(divider + lineSeparator.length).trim(),
    }
  })
}

function parseSources(value) {
  return lines(value).map(line => {
    const divider = line.lastIndexOf(lineSeparator)
    if(divider < 1 || !line.slice(divider + lineSeparator.length).trim()) fail('invalid source line')
    return {
      title:line.slice(0, divider).trim(),
      url:line.slice(divider + lineSeparator.length).trim(),
    }
  })
}

function parseParagraphSources(value, paragraphCount) {
  const result = lines(value).map(line => line.split(',').map(part => {
    const index = Number(part.trim())
    if(!Number.isInteger(index) || index < 1) fail('invalid paragraph provenance')
    return index - 1
  }))
  if(result.length !== paragraphCount) fail('missing paragraph provenance')
  return result
}

function formatNamedLines(entries) {
  return entries.map(entry => `${entry.name}${lineSeparator}${entry.description}`).join('\n')
}

function formatSources(sources) {
  return sources.map(source => `${source.title}${lineSeparator}${source.url}`).join('\n')
}

export function validateRecapCatalog(catalog) {
  if(catalog?.version !== 1 || !catalog.books || Array.isArray(catalog.books)) throw new Error('Invalid recap catalog')
  const counts = { verified:0, summary:0, pending:0, deferred:0 }

  for(const [id, recap] of Object.entries(catalog.books)) {
    const invalid = message => { throw new Error(`Recap ${id}: ${message}`) }
    if(!id || !recap.title || !recap.author) invalid('missing identity')
    if(['pending', 'deferred'].includes(recap.status)) {
      if(!recap.reason || recap.paragraphs?.length) invalid(`${recap.status} entry must explain the gap without publishing prose`)
      counts[recap.status]++
      continue
    }
    const isSummary = recap.status === 'summary'
    if(!isSummary && recap.status !== 'verified') invalid('unknown publication status')
    if(!/^\d{4}-\d{2}-\d{2}$/.test(recap.verifiedAt || '') || !Number.isFinite(Date.parse(recap.verifiedAt))) invalid('missing verification date')
    if(typeof recap.quickRefresher !== 'string' || !recap.quickRefresher.trim()) invalid('missing quick refresher')
    if(!Array.isArray(recap.paragraphs) || !recap.paragraphs.length || recap.paragraphs.some(paragraph => typeof paragraph !== 'string' || !paragraph.trim())) invalid('missing prose')
    const words = recap.paragraphs.join(' ').trim().split(/\s+/).length
    if(isSummary) {
      if(words < 80 || words > 399) invalid('expected 80–399 words for a source-checked short summary')
      if(recap.cast?.length || recap.cheatSheet?.length || recap.seriesHandoff || recap.reason) invalid('short summary must not masquerade as a full recap')
    } else {
      if(!Array.isArray(recap.cast) || !recap.cast.length || recap.cast.some(person => !person || typeof person.name !== 'string' || !person.name.trim() || typeof person.description !== 'string' || !person.description.trim())) invalid('missing character or key-figure guide')
      if(!Array.isArray(recap.cheatSheet) || !recap.cheatSheet.length || recap.cheatSheet.some(item => typeof item !== 'string' || !item.trim())) invalid('missing cheat sheet')
      if(words < 400 || words > 1760) invalid('expected 400–1760 words for a roughly 2–8 minute recap')
    }
    if(!Array.isArray(recap.sources) || !recap.sources.length) invalid('missing sources')
    for(const source of recap.sources) {
      let url
      try { url = new URL(source.url) } catch { invalid('invalid source URL') }
      if(!source.title || !['https:', 'http:'].includes(url.protocol)) invalid('unsafe or unnamed source')
    }
    if(!Array.isArray(recap.paragraphSources) || recap.paragraphSources.length !== recap.paragraphs.length) invalid('missing paragraph provenance')
    for(const references of recap.paragraphSources) {
      if(!Array.isArray(references) || !references.length || references.some(index => !Number.isInteger(index) || !recap.sources[index])) invalid('invalid paragraph provenance')
    }
    counts[recap.status]++
  }

  return counts
}

export function recapToSheetRow(bookId, recap, updatedAt = '') {
  const values = {
    'Book ID':bookId,
    Title:recap.title,
    Author:recap.author,
    Status:recap.status,
    'Verified At':recap.verifiedAt ?? '',
    Edition:recap.edition ?? '',
    'Quick Refresher':recap.quickRefresher ?? '',
    'Characters and Key Figures':recap.cast ? formatNamedLines(recap.cast) : '',
    'Cheat Sheet':recap.cheatSheet?.join('\n') ?? '',
    'Full Story':recap.paragraphs?.join('\n\n') ?? '',
    'Series Handoff':recap.seriesHandoff ?? '',
    Sources:recap.sources ? formatSources(recap.sources) : '',
    'Paragraph Sources':recap.paragraphSources?.map(sourceIndexes => sourceIndexes.map(index => index + 1).join(', ')).join('\n') ?? '',
    Reason:recap.reason ?? '',
    'Updated At':updatedAt,
  }
  return RECAP_HEADERS.map(header => values[header])
}

export function sheetRowToRecap(row, headers = RECAP_HEADERS) {
  const columns = new Map(headers.map((header, index) => [header, index]))
  const bookId = text(columnValue(row, columns, 'Book ID'))
  if(!bookId) fail('a populated row is missing Book ID')
  const status = text(columnValue(row, columns, 'Status'))
  const recap = {
    bookId,
    title:text(columnValue(row, columns, 'Title')),
    author:text(columnValue(row, columns, 'Author')),
    status,
  }

  if(['pending', 'deferred'].includes(status)) {
    recap.reason = text(columnValue(row, columns, 'Reason'))
  } else if(['verified', 'summary'].includes(status)) {
    const storyParagraphs = paragraphs(columnValue(row, columns, 'Full Story'))
    recap.verifiedAt = text(columnValue(row, columns, 'Verified At'))
    const edition = text(columnValue(row, columns, 'Edition'))
    if(edition) recap.edition = edition
    recap.quickRefresher = text(columnValue(row, columns, 'Quick Refresher'))
    recap.paragraphs = storyParagraphs
    if(status === 'verified') {
      recap.cast = parseNamedLines(columnValue(row, columns, 'Characters and Key Figures'), 'character')
      recap.cheatSheet = lines(columnValue(row, columns, 'Cheat Sheet'))
      recap.seriesHandoff = text(columnValue(row, columns, 'Series Handoff'))
    }
    recap.sources = parseSources(columnValue(row, columns, 'Sources'))
    recap.paragraphSources = parseParagraphSources(columnValue(row, columns, 'Paragraph Sources'), storyParagraphs.length)
  }
  return recap
}

export function parseRecapSheet(values, { knownBookIds } = {}) {
  if(!Array.isArray(values) || !values.length) return { version:1, books:{} }
  const headers = values[0].map(text)
  if(headers.length !== RECAP_HEADERS.length || headers.some((header, index) => header !== RECAP_HEADERS[index])) fail('headers do not match the Book Recaps contract')
  const books = {}

  for(const row of values.slice(1)) {
    const bookId = text(row?.[0])
    if(!bookId && row.every(value => !text(value))) continue
    const parsed = sheetRowToRecap(row, headers)
    if(knownBookIds && !knownBookIds.has(parsed.bookId)) fail(`${parsed.bookId} is not in the library`)
    if(books[parsed.bookId]) fail(`duplicate Book ID ${parsed.bookId}`)
    const { bookId:stableBookId, ...recap } = parsed
    books[stableBookId] = recap
  }

  const catalog = { version:1, books }
  validateRecapCatalog(catalog)
  return catalog
}

// Runtime reads must not allow one malformed authoring row to hide every other
// valid recap. Strict parsing remains available above for migrations and checks.
export function parseRecapSheetWithDiagnostics(values, { knownBookIds } = {}) {
  if(!Array.isArray(values) || !values.length) return { catalog:{ version:1, books:{} }, warnings:[] }
  const headers = values[0].map(text)
  if(headers.length !== RECAP_HEADERS.length || headers.some((header, index) => header !== RECAP_HEADERS[index])) fail('headers do not match the Book Recaps contract')
  const books = {}
  const warnings = []

  values.slice(1).forEach((row, index) => {
    const bookId = text(row?.[0])
    if(!bookId && row.every(value => !text(value))) return
    try {
      const parsed = sheetRowToRecap(row, headers)
      if(knownBookIds && !knownBookIds.has(parsed.bookId)) fail(`${parsed.bookId} is not in the library`)
      if(books[parsed.bookId]) fail(`duplicate Book ID ${parsed.bookId}`)
      const { bookId:stableBookId, ...recap } = parsed
      validateRecapCatalog({ version:1, books:{ [stableBookId]:recap } })
      books[stableBookId] = recap
    } catch(error) {
      warnings.push({ row:index + 2, bookId, message:error.message })
    }
  })

  return { catalog:{ version:1, books }, warnings }
}
