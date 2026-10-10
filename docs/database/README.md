# Database work

Read the [canonical specification](spec.md) and its authoritative
[execution addendum](plans/execution-contracts.md) first. The [execution pack](plans/README.md)
holds the ticket plans that later milestones reuse; live delivery status is in GitHub milestones
(see `docs/roadmap/README.md`).

- Runbooks: [local development](runbooks/local-development.md) and
  [core import](runbooks/core-import.md).
- Review records: [review](review/).
- [Current schema and product roadmap mapping](roadmap-schema-map.md).
- [Automatic GitHub Pages schema reference proposal](schema-reference-proposal.md).
- [Prototype references](reference/prototype-contracts.md) are pinned compatibility input.

The implemented ownership layer supports private libraries keyed to application
users; Google is the first provider. The founder's imported records remain
Sheet-owned until explicit cutover. Historical single-owner/public-catalog text
is superseded where later private-library decisions and migration 0006 apply.
