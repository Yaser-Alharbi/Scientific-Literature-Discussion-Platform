export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  /** Returns a fresh ID token, or null when nobody is signed in. Called once per authenticated request. */
  getToken: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  /** Set to false for public endpoints: no token is requested or sent. */
  auth?: boolean;
}

// The backend answers errors as {"error": "..."}; DRF's {"detail": "..."} is kept as a fallback.
function errorMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const { error, detail } = body as { error?: unknown; detail?: unknown };
    if (typeof error === 'string' && error) return error;
    if (typeof detail === 'string' && detail) return detail;
  }
  return `Request failed (HTTP ${status})`;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    // Django's HTML error pages are not JSON
    return undefined;
  }
}

export function createApiClient({ baseUrl, getToken, fetchImpl = fetch }: ApiClientOptions) {
  const root = baseUrl.replace(/\/+$/, '');

  async function request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', body, auth = true } = options;
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth) {
      const token = await getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    let response: Response;
    try {
      response = await fetchImpl(`${root}/${path.replace(/^\/+/, '')}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, 'Cannot reach the server');
    }

    const data = await readJson(response);
    if (!response.ok) throw new ApiError(response.status, errorMessage(data, response.status));
    return data as T;
  }

  return { request };
}
