export interface SafeFetchResult<T> {
  ok: boolean;
  data?: T;
  error?: {
    message: string;
    name: string;
    status?: number;
    rawResponse?: string;
  };
}

export async function safeFetchJson<T>(
  url: string,
  options?: RequestInit
): Promise<SafeFetchResult<T>> {
  try {
    const response = await fetch(url, options);
    const resText = await response.text();

    if (!resText || resText.trim() === '') {
      return {
        ok: false,
        error: {
          message: `Empty response from server`,
          name: 'EmptyResponseError',
          status: response.status,
          rawResponse: ''
        }
      };
    }

    let data: T;
    try {
      data = JSON.parse(resText);
    } catch {
      return {
        ok: false,
        error: {
          message: `Invalid JSON response: ${resText.slice(0, 200)}`,
          name: 'JSONParseError',
          status: response.status,
          rawResponse: resText.slice(0, 500)
        }
      };
    }

    const anyData = data as Record<string, unknown>;
    if (!response.ok || anyData.ok === false) {
      const errorObj = anyData.error as { message?: string; name?: string } | undefined;
      return {
        ok: false,
        error: {
          message: errorObj?.message || `Server error: ${response.status}`,
          name: errorObj?.name || 'ServerError',
          status: response.status
        }
      };
    }

    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: {
        message: err instanceof Error ? err.message : 'Network error',
        name: err instanceof Error ? err.name : 'NetworkError'
      }
    };
  }
}

export async function safeFetchFormData<T>(
  url: string,
  formData: FormData
): Promise<SafeFetchResult<T>> {
  return safeFetchJson<T>(url, {
    method: 'POST',
    body: formData
  });
}
