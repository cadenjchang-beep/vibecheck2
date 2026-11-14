/** Sends uncaught client errors to the server log. Never throws, never loops. */
let sent = 0;

export function reportClientError(error: unknown, where: string): void {
  if (sent >= 10) return;
  sent++;
  const err = error instanceof Error ? error : new Error(String(error));
  const body = JSON.stringify({
    message: err.message.slice(0, 500),
    stack: err.stack?.slice(0, 4000),
    where,
    url: location.pathname,
  });
  try {
    fetch('/api/client-errors', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(
      () => undefined,
    );
  } catch {
    /* nothing more to do */
  }
}

export function installGlobalErrorReporting(): void {
  window.addEventListener('error', (e) => reportClientError(e.error ?? e.message, 'window.onerror'));
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason as { name?: string; code?: string } | undefined;
    // Aborted requests and plain "offline" failures are expected, not bugs.
    if (reason?.name === 'AbortError' || reason?.code === 'network_error') return;
    reportClientError(e.reason, 'unhandledrejection');
  });
}
