import { existsSync, readFileSync } from 'node:fs';
const policyPath = '.agent-toolbox/project.json';
if (!existsSync(policyPath)) throw new Error(`Missing ${policyPath}`);
const policy = JSON.parse(readFileSync(policyPath, 'utf8'));
if (policy.schemaVersion !== 1 || !Array.isArray(policy.requirements))
  throw new Error('Consumer policy is malformed');
if (existsSync('.agent-toolbox/install-lock.json'))
  throw new Error('Install lock is not allowed before governance-core is released');
console.log(
  JSON.stringify({
    status: 'deferred',
    reason: '@thijulio/governance-core@0.1.0 has not been published and validated',
    policy: policy.projectId,
  }),
);
