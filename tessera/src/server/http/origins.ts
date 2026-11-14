/**
 * Which origins may make state-changing requests (CSRF protection), shared by
 * the API's origin guard and Better Auth.
 *
 * Always the configured APP_URL. A preview may also be opened through a
 * proxy, tunnel or preview pane at an address that is not APP_URL, so there a
 * request whose Origin names the very host it was sent to is accepted too: a
 * page on another site cannot make the browser send a matching Host or
 * X-Forwarded-Host, so this stays same-site. Production keeps the strict rule.
 */
export function isAllowedOrigin(
  origin: string,
  hosts: ReadonlyArray<string | null | undefined>,
  settings: { appUrl: string; appEnv: string },
): boolean {
  if (origin === settings.appUrl) return true;
  if (settings.appEnv !== 'preview') return false;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  return hosts.some((h) => h && h.split(',')[0]!.trim() === host);
}
