# Saved-result refresh lifecycle — issue #51

## Intent and baseline

The owner authorized merging ready work and continuing the roadmap on 2026-11-11.
Storage PRs #61, #62 and #63 are merged into main at `076b8cc`. Their immutable
result/plan revisions, input snapshots and expected-head publication remain the
authority for freshness and ownership. Page reads continue to read saved output.

## Approach and scope

Use a durable outbox and leased workers, with a framework-free lifecycle policy
that can be tested before adding persistence. Synchronous provider calls during
reading actions would make saving depend on availability. In-memory scheduling
alone would lose intent on process restart. The lifecycle policy is the first
implementation slice; it is not itself a durable queue or a completed #51.

Keep Node 24, pnpm 10.19.0, existing PostgreSQL and Nuxt. No dependencies, provider
credentials, hosted settings or imported-source writer authority change here.
This design's retry timings are implementation choices, not reader preferences.

## Lifecycle contract

- A job identifies one library and either a book/result kind or a platform plan.
  Canonical structured keys distinguish libraries and do not use ambiguous
  delimiter concatenation. Input fingerprints come from server-validated storage
  snapshots; this policy never hashes private input or establishes authorization.
- Equivalent input events reuse the queued, running or successful generation.
  Changed input creates a new generation and supersedes an older in-flight claim.
  Failed identical input requires an explicit retry; duplicate events never reset
  its retry budget. Input changes and explicit retries start at zero attempts.
- Generations are positive decimal PostgreSQL-bigint strings. Overflow fails
  explicitly. Claims bind job identity, generation, input fingerprint and attempt.
- A lease lasts 60 seconds. At most three attempts run per generation. Retryable
  failures wait 1 second after attempt one and 5 seconds after attempt two.
  Expired leases can be reclaimed; an expired third attempt becomes failed.
  These limits bound attempts, not money; provider spend budgets remain separate.
- Completion requires the exact current claim and an unexpired lease. Superseded,
  expired and duplicate completions are harmless no-ops. Permanent errors fail
  immediately. Only finite safe nonnegative integer millisecond times are accepted.
- Transitions are pure and do not mutate supplied records, call a provider, read
  a clock or store private provider error text. Failed work never deletes accepted
  result revisions; queue state and accepted output are different records.

## Persistence and worker follow-through

The later adapter must lock the job and persist each transition atomically. It
must validate stored rows, derive ownership from trusted sessions, protect claims
with database grants, and create refresh intent in the same transaction as its
original action. A process-local read/modify/write is not sufficient concurrency
control. Lease identifiers are fencing values, never authentication tokens.

Final publication must atomically validate the live job claim and call the
existing expected-head/input publication routine before marking success. Checking
the lease in JavaScript and publishing in a later transaction permits a stale
worker to write and is forbidden. Provider calls run outside transactions.

Dependency invalidation uses actual selected fields and revision references from
0009/0010. A platform deferral invalidates only that platform; accepted preferences
invalidate genuine dependents. Imports must participate in the same intent/lock
contract. Successful original actions do not wait for a worker or provider.

## Remaining acceptance

Queue schema, atomic event hooks, leases under real PostgreSQL races, worker
integration, pending/failed read DTOs, spend controls, provider privacy/retention
and Vercel credit eligibility remain implementation/review work for #51. Use
synthetic providers until concrete paid/private-data approval. Hosted migrations,
deploys and producer credentials remain separately controlled by AGENTS.md.
