export const NAVIGATION_AUDIT_ENABLED = false;

let appShellInstanceCounter = 0;

export function nextAppShellInstanceId(): number {
  appShellInstanceCounter += 1;
  return appShellInstanceCounter;
}

export function logNavigationAudit(
  event: string,
  details: Record<string, string | number | boolean | null | undefined>
) {
  if (!NAVIGATION_AUDIT_ENABLED) return;

  const payload = Object.entries(details)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");

  console.log(`[nav-audit] ${event}${payload ? ` ${payload}` : ""}`);
}
