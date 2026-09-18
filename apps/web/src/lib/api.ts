/**
 * The API client.
 *
 * Every request carries `credentials: 'include'`, because the session is an
 * opaque token in an `httpOnly` cookie. The browser holds it; this code
 * never sees it, and cannot — which is the property that makes a stolen
 * script unable to exfiltrate a session.
 *
 * That also decides the rendering strategy. A Next server component cannot
 * read or forward this cookie, so these screens are client components
 * fetching directly. Server-side rendering of authenticated data would
 * require a second session mechanism on the web origin — two places to
 * revoke, and one of them forgotten.
 */

/**
 * Every path is relative, resolved by the browser against this application's
 * own origin — never a cross-origin URL. `next.config.ts`'s `rewrites()`
 * forwards `/api/v1/*` to the real API server-side, invisibly to the
 * browser, so the session cookie is set and read back as first-party
 * regardless of what domain the API actually runs on. See that file's
 * comment: the previous cross-origin `fetch` (`NEXT_PUBLIC_API_BASE_URL`
 * pointed straight at the API) needed `SameSite=None` on the cookie, which a
 * browser blocking third-party cookies by default would silently drop,
 * bouncing a successfully-logged-in officer straight back to `/login` with
 * no error.
 */
const BASE_URL = "/api/v1";

/** A field-level validation failure, as returned for a rejected body. */
export interface FieldError {
  field: string;
  message: string;
}

/**
 * A failed request.
 *
 * Carries the request id so that a user reporting a problem can quote it and an
 * operator can find the corresponding log line. The API's messages are
 * deliberately uninformative; the id is what makes them supportable.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly requestId?: string,
    readonly details: FieldError[] = [],
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** The message for a given form field, if the API rejected that field. */
  fieldError(path: string): string | undefined {
    return this.details.find((detail) => detail.field === path)?.message;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: options.method ?? "GET",
      credentials: "include",
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (caught) {
    // A cancelled request is not a failure and must never be reported as one.
    //
    // React Strict Mode double-invokes effects in development, so the first
    // run's cleanup aborts requests the second run immediately reissues.
    // Swallowing that into "the service could not be reached" told an officer
    // the System was down while it was working perfectly — and it did so on the
    // registration screen, which is the one screen that must be trustworthy.
    // Rethrown as-is, so `caught instanceof ApiError` is false and callers
    // render nothing.
    if (caught instanceof DOMException && caught.name === "AbortError") {
      throw caught;
    }

    // A genuine network failure is not an API error and must not be reported as
    // one: "the request could not be processed" would send the user looking for
    // a problem with their data.
    throw new ApiError(0, "The service could not be reached.", undefined, []);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = (await response.json().catch(() => null)) as
    | { error?: { message?: string; requestId?: string; details?: FieldError[] } }
    | null;

  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload?.error?.message ?? "The request could not be processed.",
      payload?.error?.requestId,
      payload?.error?.details ?? [],
    );
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) =>
    request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body }),

  /**
   * Uploads a file as multipart.
   *
   * Not routed through `request`, because setting `Content-Type` by hand on a
   * `FormData` body omits the multipart boundary and the upload silently fails
   * to parse. The browser must be left to set that header itself.
   */
  async upload<T>(path: string, file: File, kind: string): Promise<T> {
    const form = new FormData();
    form.append("file", file);

    const response = await fetch(
      `${BASE_URL}${path}?kind=${encodeURIComponent(kind)}`,
      { method: "POST", credentials: "include", body: form },
    );

    const payload = (await response.json().catch(() => null)) as
      | { error?: { message?: string; requestId?: string; details?: FieldError[] } }
      | null;

    if (!response.ok) {
      throw new ApiError(
        response.status,
        payload?.error?.message ?? "The file could not be uploaded.",
        payload?.error?.requestId,
        payload?.error?.details ?? [],
      );
    }
    return payload as T;
  },

  /**
   * Fetches a document and hands it to the browser as a download.
   *
   * Deliberately not a plain `<a href>` to the API. The session cookie belongs
   * to the API's origin, and in production the dashboard and the API are
   * different sites — a `SameSite=Lax` cookie is not sent on a cross-site
   * navigation, so the link would answer 401 and the officer would see a login
   * page where they expected a card. Fetching with `credentials: 'include'` and
   * saving the blob works the same way in development and in production.
   *
   * The filename comes from the API's `Content-Disposition`, so the naming rule
   * — issued cards by card number, proofs by nothing identifying — lives in one
   * place rather than being restated here.
   */
  async download(path: string, fallbackName: string): Promise<void> {
    const response = await fetch(`${BASE_URL}${path}`, {
      credentials: "include",
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: { message?: string; requestId?: string } }
        | null;
      throw new ApiError(
        response.status,
        payload?.error?.message ?? "The document could not be produced.",
        payload?.error?.requestId,
      );
    }

    const disposition = response.headers.get("content-disposition") ?? "";
    const named = /filename="([^"]+)"/.exec(disposition);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = named?.[1] ?? fallbackName;
    document.body.append(link);
    link.click();
    link.remove();
    // Released on the next tick: revoking synchronously can cancel the download
    // in some browsers before it has started reading the blob.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  },

  /**
   * A signed media path, already relative (`/api/v1/media/...` — see
   * `MediaService.signUrl`), used as-is now that every request is relative
   * to this application's own origin. Kept as a named call rather than
   * inlined at each `<img src>` so callers don't need to know that.
   */
  mediaUrl: (signedPath: string) => signedPath,
};

/**
 * The SWR fetcher.
 *
 * One definition, so every screen fetches with the same credentials, the same
 * error translation, and the same request-id handling. A screen that wrote its
 * own would be the screen that forgot `credentials: 'include'` and mysteriously
 * saw 401s.
 */
export const fetcher = <T>(path: string): Promise<T> => api.get<T>(path);
