import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';

const policyPath = '.agent-toolbox/project.json';
if (!existsSync(policyPath)) throw new Error(`Missing ${policyPath}`);
const policy = JSON.parse(readFileSync(policyPath, 'utf8'));
const expectedRequirementIds = Array.from(
  { length: 12 },
  (_, index) => `LIB-${String(index + 1).padStart(2, '0')}`,
);
const requirementIds = policy.requirements?.map(({ id }) => id);
const hasSafeContextPaths = policy.contextPaths?.every(
  (path) =>
    typeof path === 'string' &&
    !isAbsolute(path) &&
    !path.split('/').includes('..') &&
    existsSync(path),
);
const hasStructuredChecks = policy.requiredChecks?.every(
  (check) =>
    typeof check.id === 'string' &&
    typeof check.executable === 'string' &&
    Array.isArray(check.arguments) &&
    Array.isArray(check.outputs) &&
    typeof check.producesBuildArtifacts === 'boolean',
);
if (
  policy.schemaVersion !== 1 ||
  JSON.stringify(requirementIds) !== JSON.stringify(expectedRequirementIds) ||
  !hasSafeContextPaths ||
  !hasStructuredChecks ||
  policy.capabilities?.write !== false ||
  policy.capabilities?.publication !== false ||
  policy.capabilities?.externalIntegrations !== false
)
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
