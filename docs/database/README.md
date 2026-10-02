# Database work

Start with [delivery status](status.md), then read the [canonical specification](spec.md),
[execution pack](plans/README.md), and its authoritative [execution addendum](plans/execution-contracts.md).
Execute only the user-authorized ticket. DB-01 was independently reviewed and the owner accepted
exact local head `f1fab44964de84747b0fab981d99b9345cd4151c`. DB-02 is implemented locally,
pending [independent merge-policy/permissions review](review/db-02.md). See its
[acceptance handoff](handoffs/db-02.md) and [core import runbook](runbooks/core-import.md).
DB-03 remains not-started.

[Context ownership](context-map.md) separates private study evidence from implementation.
[Prototype references](reference/prototype-contracts.md) are pinned compatibility input.
[Golden Path alignment](golden-path-alignment.md) records approved differences and unresolved gates.

Technical product intent: a private single-owner relational library, lossless incremental imports,
and reviewable enrichment. AI/retrieval and private browser editing require separate scopes.
