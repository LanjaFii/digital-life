/**
 * Worker de calcul du tick (Phase 3D-C2, branché en 3D-C3).
 *
 * Responsabilités : valider l'enveloppe, exécuter les règles pures
 * `computeCharacterTick()`, calculer le checksum du noyau Golden Hash et
 * répondre. Aucun accès SQLite, IPC, fichier, renderer, horloge murale ou état
 * résiduel : chaque réponse dépend exclusivement de son message d'entrée.
 */
import { createHash } from 'node:crypto';
import { parentPort } from 'node:worker_threads';
import { ACTION_REGISTRY_VERSION } from '../../shared/action';
import { canonicalizeGoldenTickResult } from '../../shared/canonicalization';
import { DECISION_ENGINE_VERSION } from '../../shared/decision';
import type { CharacterTickResult } from '../../shared/simulation-rules';
import {
  createComputeTickError,
  errorResponseFrom,
  WORKER_PROTOCOL_VERSION,
  WorkerProtocolError,
  validateComputeTickRequest,
  validateComputeTickResponse,
  type ComputeTickRequest,
  type ComputeTickResponse,
} from '../../shared/worker-protocol';
import { computeCharacterTick } from '../services/character-tick.service';

/** SHA-256 du noyau historique : `decisionRecords` est volontairement exclu. */
export function computeTickChecksum(result: CharacterTickResult): string {
  return createHash('sha256').update(canonicalizeGoldenTickResult(result), 'utf8').digest('hex');
}

/**
 * Point d'entrée pur du worker. Exporté pour les tests de déterminisme et de
 * parité ; aucune variable mutable n'est conservée entre deux appels.
 */
export function handleComputeTickMessage(message: unknown): ComputeTickResponse {
  let request: ComputeTickRequest | null = null;
  try {
    request = validateComputeTickRequest(message);
    const result = computeCharacterTick(request.input);
    const response: ComputeTickResponse = {
      type: 'compute-tick:result',
      protocolVersion: WORKER_PROTOCOL_VERSION,
      requestId: request.requestId,
      worldId: result.worldId,
      tick: result.tick,
      result,
      checksum: computeTickChecksum(result),
      versions: {
        engineVersion: DECISION_ENGINE_VERSION,
        registryVersion: ACTION_REGISTRY_VERSION,
        parametersVersion: request.input.params.version,
      },
    };
    validateComputeTickResponse(response);
    return response;
  } catch (error) {
    const failure = error instanceof WorkerProtocolError
      ? error
      : new WorkerProtocolError({
          code: 'compute_error',
          message: error instanceof Error ? error.message : String(error),
          requestId: request?.requestId ?? '',
          worldId: request?.input.worldId,
        });
    const response = errorResponseFrom(failure);
    validateComputeTickResponse(response);
    return response;
  }
}

/** Signal de disponibilité, distinct des réponses corrélées par `requestId`. */
export function createComputeWorkerReady(): { type: 'ready'; protocolVersion: 1 } {
  return { type: 'ready', protocolVersion: WORKER_PROTOCOL_VERSION };
}

/** Aucune requête n'est conservée : une réponse tardive ne peut pas être réémise. */
function startComputeWorker(port: NonNullable<typeof parentPort>): void {
  port.postMessage(createComputeWorkerReady());
  port.on('message', (message: unknown) => {
    port.postMessage(handleComputeTickMessage(message));
  });
}

if (parentPort) startComputeWorker(parentPort);

/** Réponse d'erreur non corrélée, utilisée uniquement si le port est indisponible. */
export function uncorrelatedError(message: string): ReturnType<typeof createComputeTickError> {
  return createComputeTickError({ code: 'compute_error', message });
}
