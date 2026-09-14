import { isHealthResponse, type HealthResponse } from '@smart-library/domain';

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch('/api/health', { signal });
  if (!response.ok) throw new Error(`Health request failed with ${response.status}`);
  const body: unknown = await response.json();
  if (!isHealthResponse(body)) throw new Error('Health response is malformed');
  return body;
}
