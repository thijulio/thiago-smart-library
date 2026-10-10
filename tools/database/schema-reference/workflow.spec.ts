import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('supplies the service container in step env for every database reference consumer', () => {
  for (const name of ['database', 'schema-reference']) {
    const workflow = readFileSync(`.github/workflows/${name}.yml`, 'utf8');
    // The job context is available to step env, not job-level env.
    const beforeSteps = workflow.split('    steps:')[0];
    expect(beforeSteps).not.toContain('${{ job.services.postgres.id }}');
    const steps = workflow.split(/\n {6}- /).slice(1);
    const consumers = steps.filter((step) =>
      /pnpm test:db|schema-reference\.integration|pnpm schema:generate/.test(step),
    );
    expect(consumers.length).toBeGreaterThan(0);
    for (const step of consumers)
      expect(step).toContain(
        'SCHEMA_REFERENCE_POSTGRES_CONTAINER: ${{ job.services.postgres.id }}',
      );
  }
});
