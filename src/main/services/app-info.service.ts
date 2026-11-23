import { app } from 'electron';
import type { AppInfo, DiagnosticCheck, DiagnosticResult } from '../../shared/ipc';
import { hasWasm } from './resource.service';
import { WINDOW_SECURITY } from '../security/window';

export function getAppInfo(): AppInfo {
  return {
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.versions.node,
    electronVersion: process.versions.electron,
  };
}

export function getDiagnostic(): DiagnosticResult {
  const checks: DiagnosticCheck[] = [
    { name: 'Context isolation', ok: WINDOW_SECURITY.contextIsolation },
    { name: 'Node integration désactivée', ok: !WINDOW_SECURITY.nodeIntegration },
    { name: 'Sandbox activée', ok: WINDOW_SECURITY.sandbox },
    { name: 'Binaire SQLite/WASM local', ok: hasWasm() },
  ];
  return { ok: checks.every((check) => check.ok), checks };
}
