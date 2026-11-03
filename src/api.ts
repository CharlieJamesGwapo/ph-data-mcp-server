/** Client for the free Philippines Public Data API (https://github.com/CharlieJamesGwapo/ph-public-api). */
export const API_BASE_URL = process.env.PH_API_BASE_URL ?? 'https://ph-public-api.vercel.app';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

function httpErrorMessage(status: number, path: string): string {
  if (status === 404) return `Not found: ${path}. Check the code or name, e.g. list regions first to get valid region codes.`;
  if (status === 429) return 'Rate limit exceeded. Wait a minute before making more requests.';
  if (status >= 500) return `The Philippines Public Data API is having problems (HTTP ${status}). Try again shortly.`;
  return `Request to ${path} failed with HTTP ${status}.`;
}

export async function apiGet<T>(path: string, params: Record<string, string | number | undefined>, signal?: AbortSignal): Promise<T> {
  const url = new URL(path, API_BASE_URL);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'ph-data-mcp-server' },
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000),
    });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    throw new ApiError(timedOut ? `Request to ${path} timed out. Try again.` : `Could not reach ${API_BASE_URL}: ${(err as Error).message}`);
  }
  if (!res.ok) throw new ApiError(httpErrorMessage(res.status, path), res.status);
  return (await res.json()) as T;
}
