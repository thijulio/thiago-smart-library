# Product decisions

Captured through 2026-10-02. Confirmed direction and unresolved implementation choices are recorded separately. A product choice does not authorize cloud changes or implementation outside an approved ticket.

## Confirmed choices

| ID   | Decision                                                                 | Consequence / source                                                                                                      |
| ---- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| P-01 | Smart Library owns durable records independently from AI                 | [Overview](overview.md); record capture works without a provider                                                          |
| P-02 | ChatGPT is the only planned AI connection for now                        | [Connection direction](chatgpt-connection.md); no API-key BYOK fallback                                                   |
| P-03 | AI output and inferred preferences remain reviewable and distinguishable | [User experience](user-experience.md); generated analysis does not own personal state                                     |
| P-04 | Preserve the current single-owner database scope                         | Multi-user ownership and edition/rereading extensions need separate approval                                              |
| P-05 | Keep the prototype Sheet authoritative until explicit cutover            | [OPS-02](https://github.com/thijulio/thiago-smart-library/issues/11); local code and hosted connectivity are insufficient |
| P-06 | Product specification belongs in repository documents; issues track work | `docs/product/` owns intent and requirements; `docs/roadmap/` owns sequence and traceability                              |

## Questions to resolve before the relevant implementation

| Question                                                                                             | Owner / gate                                     |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Can this hosted app use the official ChatGPT identity and plan-usage integration?                    | DISC-01; named app eligibility evidence required |
| How will application login, sessions, consent, credential storage and disconnect work?               | DISC-01; reviewed authentication design          |
| What is the first approved AI action, and what library context does it send?                         | DISC-02; scoped workflow and data disclosure     |
| What happens to accepted asynchronous jobs after leaving or disconnecting?                           | DISC-02; explicit lifecycle and failure contract |
| Is private browser parity required before retiring prototype writers?                                | DISC-01 / OPS-02; owner workflow acceptance      |
| Do retrieval, exports, preference suggestions or ownership extensions merit an implementation slice? | DISC-03–DISC-06; separate scope selection        |

Technical database contracts and their execution addendum retain their existing precedence. Product documentation summarizes user-facing intent; it does not redefine SQL permissions, import merge rules or cutover procedures.
