/** Explicit synthetic targets only. Never consult diagnostic/runtime credentials. */
export function validateLocalTarget(
  raw: string | undefined,
  environment: Record<string, string | undefined> = {},
) {
  if (environment.DATABASE_URL) throw new Error('INHERITED_DATABASE_URL');
  if (!raw) throw new Error('MISSING_DATABASE_TARGET');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('UNSAFE_DATABASE_TARGET');
  }
  const database = url.pathname.slice(1);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    !/^smart_library_test_(admin|[a-f0-9]+)$/.test(database) ||
    url.search ||
    url.hash
  )
    throw new Error('UNSAFE_DATABASE_TARGET');
  return { url: raw, database };
}

export interface ContainerInspection {
  Config: { Image: string; Labels: Record<string, string> };
  HostConfig: {
    Tmpfs: Record<string, string>;
    PortBindings: Record<string, { HostIp: string; HostPort: string }[]>;
  };
  Mounts: { Type: string; Destination: string }[];
}
export function validateInstanceId(value: string | undefined): string {
  if (!value || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value))
    throw new Error('MISSING_LIBRARY_INSTANCE');
  return value;
}
export function validateDisposableContainer(input: ContainerInspection) {
  const bindings = input.HostConfig.PortBindings['5432/tcp'];
  if (
    input.Config.Image !== 'postgres:16.15' ||
    input.Config.Labels['com.docker.compose.project'] !== 'smart-library-db-test' ||
    input.Config.Labels['com.docker.compose.service'] !== 'postgres' ||
    Object.keys(input.HostConfig.Tmpfs ?? {}).join() !== '/var/lib/postgresql/data' ||
    input.Mounts.some((m) => m.Type !== 'tmpfs' || m.Destination !== '/var/lib/postgresql/data') ||
    Object.keys(input.HostConfig.PortBindings).length !== 1 ||
    bindings?.length !== 1 ||
    bindings[0].HostIp !== '127.0.0.1' ||
    bindings[0].HostPort !== '55433'
  )
    throw new Error('UNSAFE_TEST_CONTAINER');
}
