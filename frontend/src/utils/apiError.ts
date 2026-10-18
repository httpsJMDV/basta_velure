/** What the server said about a failed request: its field errors and its summary message. */
export interface ApiProblem {
  status?: number;
  message: string;
  fields: Record<string, string>;
}

export function apiProblem(err: unknown, fallback = 'Something went wrong. Please try again.'): ApiProblem {
  const res = (err as { response?: { status?: number; data?: { message?: string; errors?: Record<string, string[]> } } })?.response;
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(res?.data?.errors ?? {})) if (v?.[0]) fields[k] = v[0];
  const first = Object.values(fields)[0];
  return { status: res?.status, message: first ?? res?.data?.message ?? fallback, fields };
}

/** The one line to show for a failed request: the first field error, else the server's message, else the fallback. */
export function apiErrorMessage(err: unknown, fallback?: string): string {
  return apiProblem(err, fallback).message;
}
