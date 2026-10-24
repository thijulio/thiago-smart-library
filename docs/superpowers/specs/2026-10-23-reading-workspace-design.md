# Reading workspace — issue #45

Status: approved by the owner in chat; implemented locally, with hosted release
and browser/build acceptance pending the published Biome dependency.

## Intent and scope

Give a returning reader a private view of current reading and existing explicit
Up Next selections. This is the first delivery in the approved roadmap sequence.
Reuse Nuxt, the existing session flow, scoped database functions and published
Biome CSS. No AI, editing, reimport or change of data authority belongs here.

## Evidence

- Main inspected at `068d3ea`; the initial working tree was clean.
- `BookCard` supplies status and platform, but not queue rank or slot.
- Migration 0006 scopes cards through library membership and excludes archives.
- The core schema already stores `next_rank`, `next_slot` and `why_next`.
- The prototype's `src/library.mjs` includes reading/reread as in-progress.
  Its `getRecommendations` requires a rank and unread/wishlist status, separates
  Kindle Primary/Secondary from Audible, and sorts within those contexts.
  It uses sheet order for ties and defaults missing Kindle slots to Primary.
- The new database contract permits missing slots and duplicate ranks. These
  must remain visible as incomplete/ambiguous data, not invented preferences.

## Approaches

Recommended: a dedicated `/library/reading` page with a scoped reading endpoint.
This keeps the catalog focused and gives queue fields an explicit private DTO.

Alternative: add sections and queue fields to the catalog page/endpoint. This
has fewer routes but mixes catalog search and reading workflows and enlarges
every catalog response. Recommendation is the implementer's, pending review.

## Screen

Add Library and Reading links to authenticated navigation, with active state.
Keep the existing post-login destination for this slice.

The Reading page presents:

1. Reading now: all `reading` and `reread` books grouped by recorded platform.
   Kindle and Audible remain distinct; Physical and Unknown are retained when
   present. A missing cover does not prevent opening private book details.
2. Up Next: only explicitly ranked unread/wishlist books, grouped by platform;
   Kindle additionally separates Primary, Secondary and unspecified slot.
   Show recorded rank and optional reason. A reason without rank is not a queue
   selection. Do not fill empty places from the wishlist.

Use responsive sections that stack on mobile, semantic lists and headings,
visible focus and normal book links. Reuse existing product styles and controls.
Show all recorded selections rather than silently discarding tied/extra entries.
Ascending recorded rank is authoritative within each group. Equal ranks remain
equal, with title/stable ID only as a deterministic display tie-breaker and a
short explanation that their relative order is not recorded. Do not imply exact
sheet-order parity: it is not part of the current scoped card contract.

## Data and privacy

Add a domain DTO extending card data with nullable `nextRank`, `nextSlot` and
`whyNext`. Add `GET /api/private/reading` using the same persisted-session and
verified-account checks as books. Only the server session supplies the actor.

Use an additive migration (next free number, currently 0007) to introduce
`library.reading_for_user(text)`. Reuse membership-scoped, unarchived cards and
join queue fields by book ID; return only current or explicitly queued books.
Grant only function execution to the existing runtime role; explicitly revoke
PUBLIC execution. Preserve all imported values and existing migrations.

Return an explicit available queue contract in a successful response. Empty
available data means no recorded selections; missing/invalid queue fields in
the response mean unavailable data, not an empty queue. A missing routine or
database failure yields the existing sanitized 503 behavior.

Keep private responses no-store and client-side rendering under `/library/**`.
401/403 returns to sign-in; logout clears cached private data. Never render old
private results beneath a request error or after session loss.

## States and verification

Distinguish loading, request failure with retry, no current reading, no recorded
Up Next, and unavailable queue information. Missing slots and tied ranks remain
honest rather than silently normalized.

Synthetic tests cover reading/reread, exclusions, platform/slot separation,
rank ties, missing rank/slot, reason-only records and empty libraries. Real
PostgreSQL tests cover two users, archives, empty ownership and runtime grants.
HTTP tests cover anonymous/rejected sessions and sanitized failures. Browser
tests cover navigation, details, retry, logout, keyboard and mobile overflow.
Run `pnpm check`, `pnpm test:db` and relevant `pnpm test:e2e` checks.

## Delivery boundary

Review this short design before implementation. Prepare and verify code locally
after acceptance. Hosted migration and release require a separate concrete
approval under AGENTS.md; builds never apply migrations. Existing production
and the canonical Sheet are unchanged by this design. Issue #44 remains the
hosted multiuser acceptance gate, not a blocker to local feature work.
