/**
 * Client du worker de calcul du tick (Phase 3D-C3).
 *
 * Responsable du cycle de vie du second worker, du registre `pendingComputes`,
 * de la corrélation par `requestId`, du timeout fixe et du nettoyage sur
 * erreur/annulation. Il ne touche jamais à SQLite, à l'IPC ni au renderer.
 * Aucune requête n'est rejouée automatiquement et aucun calcul synchrone de
 * repli n'est prévu.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { canonicalizeGoldenTickResult } from '../../shared/canonicalization';
import type { CharacterTickInput } from '../../shared/simulation-rules';
import {
  COMPUTE_TICK_REQUEST_TYPE,
  validateComputeTickRequest,
  validateComputeTickResponse,
  validateComputeWorkerReady,
  WORKER_PROTOCOL_VERSION,
  type ComputeTickResultResponse,
} from '../../shared/worker-protocol';

/** Délai d'attente fixe, sans surface de configuration. */
export const COMPUTE_TICK_TIMEOUT_MS = 30_000;

/** Surface minimale d'un worker ; `Worker` de Node la satisfait sans adaptation. */
export interface ComputeWorkerLike {
  postMessage(value: unknown): void;
  on(event: 'message', handler: (value: unknown) => void): void;
  on(event: 'error', handler: (error: Error) => void): void;
  on(event: 'exit', handler: (code: number) => void): void;
  terminate(): Promise<number>;
}

interface PendingCompute {
  worldId: string;
  timer: NodeJS.Timeout;
  resolve: (response: ComputeTickResultResponse) => void;
  reject: (error: Error) => void;
}

export class ComputeTimeoutError extends Error {
  constructor(requestId: string) {
    super(`Timeout après ${COMPUTE_TICK_TIMEOUT_MS} ms sur le calcul ${requestId}.`);
    this.name = 'ComputeTimeoutError';
  }
}

export class ComputeCancelledError extends Error {
  constructor(worldId: string) {
    super(`Calcul annulé pour le monde supprimé ${worldId}.`);
    this.name = 'ComputeCancelledError';
  }
}

export class ComputeWorkerFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ComputeWorkerFailure';
  }
}

function logComputeError(context: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[DIGITAL LIFE][compute] ${context}: ${message}`);
}

function computeWorkerScriptPath(): string {
  const fromDist = join(process.cwd(), 'dist', 'main', 'simulation', 'tick-compute.worker.js');
  if (existsSync(fromDist)) return fromDist;
  const fromDir = join(__dirname, '..', 'simulation', 'tick-compute.worker.js');
  if (existsSync(fromDir)) return fromDir;
  return fromDist;
}

let worker: ComputeWorkerLike | null = null;
let readyPromise: Promise<void> | null = null;
let resolveReady: (() => void) | null = null;
let rejectReady: ((error: Error) => void) | null = null;
let requestSequence = 0;
const pendingComputes = new Map<string, PendingCompute>();
let workerFactory: () => ComputeWorkerLike = () => new Worker(computeWorkerScriptPath()) as ComputeWorkerLike;

/** Retire l'entrée avant toute résolution/rejet : une réponse tardive est ignorée. */
function clearPending(requestId: string): PendingCompute | undefined {
  const pending = pendingComputes.get(requestId);
  if (!pending) return undefined;
  clearTimeout(pending.timer);
  pendingComputes.delete(requestId);
  return pending;
}

function rejectAll(errorFor: (requestId: string, worldId: string) => Error): void {
  for (const [requestId, pending] of [...pendingComputes.entries()]) {
    clearPending(requestId)?.reject(errorFor(requestId, pending.worldId));
  }
}

function detachWorker(target: ComputeWorkerLike): void {
  if (worker !== target) return;
  worker = null;
  readyPromise = null;
  resolveReady = null;
  rejectReady = null;
}

function readRequestId(value: unknown): string {
  if (typeof value !== 'object' || value === null) return '';
  const raw = (value as { requestId?: unknown }).requestId;
  return typeof raw === 'string' ? raw : '';
}

function onWorkerMessage(target: ComputeWorkerLike, raw: unknown): void {
  if (worker !== target) return;
  if (typeof raw === 'object' && raw !== null && (raw as { type?: unknown }).type === 'ready') {
    try {
      validateComputeWorkerReady(raw);
      resolveReady?.();
      resolveReady = null;
      rejectReady = null;
    } catch (error) {
      rejectReady?.(error instanceof Error ? error : new Error(String(error)));
      rejectReady = null;
    }
    return;
  }

  let response;
  try {
    response = validateComputeTickResponse(raw);
  } catch (error) {
    const requestId = readRequestId(raw);
    logComputeError('réponse invalide', error);
    const invalid = new ComputeWorkerFailure('Réponse du worker de calcul invalide.');
    const pending = requestId ? clearPending(requestId) : undefined;
    if (pending) pending.reject(invalid);
    else rejectAll(() => invalid);
    return;
  }

  const pending = pendingComputes.get(response.requestId);
  if (!pending) {
    logComputeError('réponse tardive ou inconnue', `requestId=${response.requestId}`);
    return;
  }
  if (pending.worldId !== response.worldId) {
    clearPending(response.requestId)?.reject(new ComputeWorkerFailure('Monde de réponse incohérent avec la requête.'));
    return;
  }

  if (response.type === 'compute-tick:error') {
    clearPending(response.requestId)?.reject(new ComputeWorkerFailure(response.message));
    return;
  }

  const expectedChecksum = createHash('sha256')
    .update(canonicalizeGoldenTickResult(response.result), 'utf8')
    .digest('hex');
  if (expectedChecksum !== response.checksum) {
    clearPending(response.requestId)?.reject(new ComputeWorkerFailure('Checksum du résultat incohérent.'));
    return;
  }
  clearPending(response.requestId)?.resolve(response);
}

function onWorkerError(target: ComputeWorkerLike, error: Error): void {
  if (worker !== target) return;
  logComputeError('erreur', error);
  rejectAll(() => new ComputeWorkerFailure('Worker de calcul en erreur.'));
  rejectReady?.(new ComputeWorkerFailure('Worker de calcul en erreur avant ready.'));
  detachWorker(target);
}

function onWorkerExit(target: ComputeWorkerLike, code: number): void {
  if (worker !== target) return;
  if (pendingComputes.size > 0) {
    logComputeError('arrêt inattendu avec requêtes en attente', `code ${code}`);
    rejectAll(() => new ComputeWorkerFailure('Worker de calcul terminé de façon inattendue.'));
  }
  rejectReady?.(new ComputeWorkerFailure('Worker de calcul terminé avant ready.'));
  detachWorker(target);
}

async function ensureComputeWorker(): Promise<ComputeWorkerLike> {
  if (worker) {
    await readyPromise;
    if (!worker) throw new ComputeWorkerFailure('Worker de calcul indisponible.');
    return worker;
  }

  const target = workerFactory();
  worker = target;
  readyPromise = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  target.on('message', (message: unknown) => onWorkerMessage(target, message));
  target.on('error', (error: Error) => onWorkerError(target, error));
  target.on('exit', (code: number) => onWorkerExit(target, code));

  try {
    await readyPromise;
  } catch (error) {
    detachWorker(target);
    throw error instanceof Error ? error : new Error(String(error));
  }
  if (worker !== target) throw new ComputeWorkerFailure('Worker de calcul indisponible.');
  return target;
}

/** Envoie un tick au worker et retourne une réponse déjà validée et hachée. */
export async function computeCharacterTickInWorker(
  input: CharacterTickInput,
): Promise<ComputeTickResultResponse> {
  const target = await ensureComputeWorker();
  requestSequence += 1;
  const requestId = `compute-${requestSequence}`;
  const request = validateComputeTickRequest({
    type: COMPUTE_TICK_REQUEST_TYPE,
    protocolVersion: WORKER_PROTOCOL_VERSION,
    requestId,
    // Entrée immuable : aucune référence n'est partagée avec le main.
    input: structuredClone(input),
  });

  return new Promise<ComputeTickResultResponse>((resolve, reject) => {
    const timer = setTimeout(() => {
      clearPending(requestId)?.reject(new ComputeTimeoutError(requestId));
    }, COMPUTE_TICK_TIMEOUT_MS);
    pendingComputes.set(requestId, { worldId: input.worldId, timer, resolve, reject });
    try {
      target.postMessage(request);
    } catch (error) {
      clearPending(requestId)?.reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

/** Annule immédiatement les calculs d'un monde, avant toute attente de verrou. */
export function cancelComputeForWorld(worldId: string): void {
  for (const [requestId, pending] of [...pendingComputes.entries()]) {
    if (pending.worldId !== worldId) continue;
    clearPending(requestId)?.reject(new ComputeCancelledError(worldId));
  }
}

/** Arrêt propre : rejette les requêtes en attente et ne relance rien. */
export async function shutdownComputeWorker(): Promise<void> {
  rejectAll((requestId) => new ComputeWorkerFailure(`Worker arrêté pendant ${requestId}.`));
  const target = worker;
  if (target) detachWorker(target);
  if (target) await target.terminate().catch(() => undefined);
}

/** Test uniquement : injecte un worker factice et réinitialise le registre. */
export function _setComputeWorkerFactoryForTests(factory: (() => ComputeWorkerLike) | null): void {
  workerFactory = factory ?? (() => new Worker(computeWorkerScriptPath()) as ComputeWorkerLike);
}

/** Test uniquement : état observable du registre et du compteur. */
export function _computeClientStateForTests(): {
  pendingIds: string[];
  pendingWorldIds: string[];
  hasWorker: boolean;
  requestSequence: number;
} {
  return {
    pendingIds: [...pendingComputes.keys()],
    pendingWorldIds: [...pendingComputes.values()].map((pending) => pending.worldId),
    hasWorker: worker !== null,
    requestSequence,
  };
}

/** Test uniquement : remet à zéro le client sans toucher à la production. */
export async function _resetComputeClientForTests(): Promise<void> {
  await shutdownComputeWorker();
  pendingComputes.clear();
  requestSequence = 0;
  workerFactory = () => new Worker(computeWorkerScriptPath()) as ComputeWorkerLike;
}
