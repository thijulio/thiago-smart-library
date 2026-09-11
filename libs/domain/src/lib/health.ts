export type HealthResponse = { status: 'ok' };

export const isHealthResponse = (value: unknown): value is HealthResponse =>
  typeof value === 'object' && value !== null && (value as { status?: unknown }).status === 'ok';
