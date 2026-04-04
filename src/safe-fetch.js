// ==========================================
// Safe Fetch — fetch wrapper with timeout and error handling
// ==========================================
// All AI provider calls and outbound HTTP requests should use
// this instead of bare fetch() to ensure timeouts and error handling.

const DEFAULT_TIMEOUT_MS = 60000; // 60 seconds

export async function safeFetch(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
