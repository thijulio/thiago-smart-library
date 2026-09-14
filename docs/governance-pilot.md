# Governance pilot boundary

The consumer policy is tracked at `.agent-toolbox/project.json`, but L1 does not declare,
install, or pin `@thijulio/governance-core`. T1 must first publish the immutable `0.1.0`
package and its validated marketplace payload. Only then may this branch add the exact
development dependency, generate an install lock, run the package validators, and attach
fresh review evidence for the exact committed head.

Until that release exists, `pnpm governance:check` validates only that the consumer policy is
present and explicitly records the deferred integration. It does not pretend a Guardian review
ran or grant a model access to this checkout.
