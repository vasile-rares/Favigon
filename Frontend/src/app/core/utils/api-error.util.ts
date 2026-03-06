export interface ApiErrorEnvelope {
  error?: {
    message?: string;
    title?: string;
    detail?: string;
  };
}

export function extractApiErrorMessage(error: unknown, fallback: string): string {
  const payload = error as ApiErrorEnvelope | null | undefined;
  return payload?.error?.message ?? payload?.error?.title ?? payload?.error?.detail ?? fallback;
}
