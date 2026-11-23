/** Paramètres de sécurité obligatoires pour toutes les fenêtres Chromium. */
export const WINDOW_SECURITY = {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true,
} as const;

/** Empêche la navigation vers une origine externe (surface d'attaque réduite). */
export function isAllowedUrl(url: string, devUrl?: string): boolean {
  if (devUrl && url.startsWith(devUrl)) return true;
  return url.startsWith('file://');
}
