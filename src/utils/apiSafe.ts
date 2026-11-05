/**
 * Safe JSON and Network Response Handler
 * Prevents "Unexpected token '<', '<!doctype ...'" parsing errors
 * and provides clear user-facing messages for rate limits and server states.
 */

export interface SafeApiResponse<T = any> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
  isRateLimited: boolean;
  cooldownRemaining: number;
}

export async function safeFetchJson<T = any>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<SafeApiResponse<T>> {
  try {
    const res = await fetch(input, init);
    const contentType = res.headers.get('content-type') || '';
    const rawText = await res.text();

    let parsedData: any = null;
    let parseSuccess = false;

    if (rawText.trim().startsWith('{') || rawText.trim().startsWith('[')) {
      try {
        parsedData = JSON.parse(rawText);
        parseSuccess = true;
      } catch (jsonErr) {
        parseSuccess = false;
      }
    }

    // Rate limit status code 429
    if (res.status === 429) {
      const cooldownRemaining = parsedData?.cooldownRemaining || 25;
      const errorMsg =
        parsedData?.error ||
        `Gemini API free-tier pacing active (3-10 req/min). Please wait ${cooldownRemaining}s before sending another request.`;
      return {
        ok: false,
        status: 429,
        data: parsedData,
        error: errorMsg,
        isRateLimited: true,
        cooldownRemaining,
      };
    }

    // Overloaded or gateway timeout
    if (res.status === 504 || res.status === 502 || res.status === 503) {
      return {
        ok: false,
        status: res.status,
        data: parsedData,
        error: parsedData?.error || 'The Gemini audio service is momentarily busy. Please try again in a few seconds, or switch to the Browser Speech tab.',
        isRateLimited: false,
        cooldownRemaining: parsedData?.cooldownRemaining || 5,
      };
    }

    if (!parseSuccess) {
      // Received non-JSON response (e.g. HTML 404 or Vite SPA fallback)
      if (rawText.includes('<!DOCTYPE') || rawText.includes('<!doctype') || contentType.includes('text/html')) {
        return {
          ok: false,
          status: res.status,
          data: null,
          error:
            res.status === 404
              ? 'Requested voice sample is not available yet.'
              : 'Server returned a temporary response. Please try again.',
          isRateLimited: false,
          cooldownRemaining: 0,
        };
      }
      return {
        ok: false,
        status: res.status,
        data: null,
        error: rawText.slice(0, 120) || 'Unrecognized server response format.',
        isRateLimited: false,
        cooldownRemaining: 0,
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        data: parsedData,
        error: parsedData?.error || `Request failed with status ${res.status}.`,
        isRateLimited: Boolean(parsedData?.isRateLimited),
        cooldownRemaining: parsedData?.cooldownRemaining || 0,
      };
    }

    return {
      ok: true,
      status: res.status,
      data: parsedData as T,
      error: null,
      isRateLimited: false,
      cooldownRemaining: 0,
    };
  } catch (networkErr: any) {
    console.error('safeFetchJson network error:', networkErr);
    return {
      ok: false,
      status: 0,
      data: null,
      error: networkErr?.message || 'Network connection error. Please check your connection.',
      isRateLimited: false,
      cooldownRemaining: 0,
    };
  }
}
