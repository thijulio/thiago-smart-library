import { pathToFileURL } from 'node:url';
export interface PublicationInput {
  event: string;
  ref: string;
  enabled: string;
  source: string;
  current: string;
}
export function publicationAllowed(input: PublicationInput): boolean {
  return (
    ['push', 'workflow_dispatch'].includes(input.event) &&
    input.ref === 'refs/heads/main' &&
    input.enabled === 'true' &&
    /^[a-f0-9]{40}$/.test(input.source) &&
    input.source === input.current
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(
    'allowed=' +
      publicationAllowed({
        event: process.env.SCHEMA_EVENT ?? '',
        ref: process.env.SCHEMA_REF ?? '',
        enabled: process.env.SCHEMA_ENABLED ?? '',
        source: process.env.SCHEMA_SOURCE ?? '',
        current: process.env.SCHEMA_CURRENT ?? '',
      }),
  );
}
