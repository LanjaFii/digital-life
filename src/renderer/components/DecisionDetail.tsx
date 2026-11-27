/**
 * Présentation structurée d'un enregistrement de décision (Phase 3D-D).
 *
 * Aucun JSON brut n'est affiché : chaque champ est présenté dans une section
 * typée. Les badges distingueront les faits mesurés, les motivations et les
 * explications produites par le moteur.
 */
import type { ReactNode } from 'react';
import type { DecisionRecordV1, Motivation } from '../../shared/decision';
import type { TickDelta } from '../../shared/simulation-rules';
import { EMOTION_LABELS, NEED_LABELS } from './character-labels';
import {
  actionLabel, fieldLabel, formatScore, formatSigned, motivationSourceLabel,
  ruleLabel, shortHash, simulatedTime,
} from './decision-labels';

interface SectionProps {
  number: number;
  title: string;
  kind: 'fact' | 'motivation' | 'engine';
  children: ReactNode;
  collapsed?: boolean;
}

const KIND_LABELS: Record<SectionProps['kind'], string> = {
  fact: 'Fait observé',
  motivation: 'Motivation',
  engine: 'Explication du moteur',
};

function Section({ number, title, kind, children, collapsed = false }: SectionProps) {
  return (
    <details className="decision-section" open={!collapsed}>
      <summary>
        <span className="decision-section-number">{String(number).padStart(2, '0')}</span>
        <span className="decision-section-title">{title}</span>
        <span className={`decision-kind decision-kind-${kind}`}>{KIND_LABELS[kind]}</span>
      </summary>
      <div className="decision-section-body">{children}</div>
    </details>
  );
}

function MotivationLine({ motivation }: { motivation: Motivation }) {
  return (
    <li className="decision-item decision-motivation">
      <span className="decision-item-title">{fieldLabel(motivation.id)}</span>
      <span className="decision-item-meta">
        {motivationSourceLabel(motivation.source)} · urgence {motivation.urgency.toFixed(2)} ·{' '}
        {motivation.direction === 'increase' ? 'augmenter' : 'réduire'}
      </span>
      <span className="decision-item-reason">{motivation.reason}</span>
    </li>
  );
}

function DeltaLine({ delta }: { delta: TickDelta }) {
  return (
    <li className="decision-item">
      <span className="decision-item-title">{fieldLabel(delta.field)}</span>
      <span className="decision-item-meta">
        {formatSigned(delta.before)} → {formatSigned(delta.after)} ({formatSigned(delta.delta)}) ·{' '}
        {delta.ruleId}
      </span>
      <span className="decision-item-reason">
        {delta.causes.map((cause) => `${fieldLabel(cause.source)} : ${formatSigned(cause.contribution ?? 0)}`).join(', ') || 'Aucune cause détaillée'}
      </span>
    </li>
  );
}

function Values({ values, labels }: { values: Readonly<Record<string, number>>; labels: Record<string, string> }) {
  return (
    <div className="decision-values">
      {Object.entries(values).map(([key, value]) => (
        <span key={key} className="decision-value">
          <span className="decision-value-label">{labels[key] ?? key}</span>
          <strong>{formatSigned(value)}</strong>
        </span>
      ))}
    </div>
  );
}

/** Vue complète en douze sections, sans donnée brute ni contrôle de simulation. */
export function DecisionDetail({ record }: { record: DecisionRecordV1 }) {
  const { explanation: e } = record;
  return (
    <div className="decision-detail">
      <Section number={1} title="Identité et contexte" kind="fact">
        <dl className="decision-facts">
          <dt>Personnage</dt><dd>{record.characterName} ({e.characterId})</dd>
          <dt>Monde</dt><dd>{e.worldId}</dd>
          <dt>Temps simulé</dt><dd>{simulatedTime(e.day, e.hour)} · tick {e.tick}</dd>
          <dt>Enregistrement</dt><dd>{record.id}</dd>
          <dt>Création (diagnostic)</dt><dd>{record.createdAt}</dd>
        </dl>
      </Section>

      <Section number={2} title="Action précédente et action retenue" kind="fact">
        <dl className="decision-facts">
          <dt>Action précédente</dt>
          <dd>{record.previousAction.actionId ? actionLabel(record.previousAction.actionId) : 'Aucune'}{record.previousAction.active ? ' (active)' : ''}</dd>
          <dt>Décision retenue</dt><dd>{actionLabel(e.selectedActionId)}</dd>
          <dt>Règle d'action</dt><dd>{ruleLabel(record.newAction.rule)}</dd>
          <dt>Score retenu</dt><dd>{formatScore(record.score)}</dd>
        </dl>
      </Section>

      <Section number={3} title="Motivations et urgences" kind="motivation">
        <h4>Motivations retenues</h4>
        {e.motivations.length === 0 ? <p className="muted">Aucune motivation au-dessus du seuil.</p> : (
          <ul className="decision-list">{e.motivations.map((m) => <MotivationLine key={m.id} motivation={m} />)}</ul>
        )}
        <h4>Motivations écartées</h4>
        <Values values={record.needUrgencies} labels={NEED_LABELS} />
        <Values values={record.emotionUrgencies} labels={EMOTION_LABELS} />
      </Section>

      <Section number={4} title="Objectifs immédiats" kind="motivation" collapsed>
        {e.immediateGoals.length === 0 ? <p className="muted">Aucun objectif immédiat.</p> : (
          <ol className="decision-list">
            {e.immediateGoals.map((goal) => (
              <li key={goal.id} className="decision-item">
                <span className="decision-item-title">#{goal.rank} — {goal.label}</span>
                <span className="decision-item-meta">Urgence {goal.urgency.toFixed(2)} · {goal.ruleId}</span>
                <ul className="decision-list nested">
                  {goal.motivations.map((m) => <MotivationLine key={m.id} motivation={m} />)}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section number={5} title="Candidats et scores" kind="engine" collapsed>
        <ul className="decision-list">
          {e.candidateScores.map((candidate) => (
            <li key={candidate.actionId} className={`decision-item ${candidate.actionId === e.selectedActionId ? 'decision-selected' : ''}`}>
              <span className="decision-item-title">{actionLabel(candidate.actionId)}</span>
              <span className="decision-item-meta">
                {candidate.feasible ? 'Faisable' : 'Infaisable'} · score {formatScore(candidate.score)}
              </span>
              <span className="decision-item-reason">
                {Object.entries(candidate.components).map(([key, value]) => `${key} ${formatSigned(value)}`).join(' · ')}
              </span>
              {candidate.rejections.map((rejection) => (
                <span key={rejection.precondition} className="decision-item-reason">{rejection.precondition} : {rejection.reason}</span>
              ))}
            </li>
          ))}
        </ul>
      </Section>

      <Section number={6} title="Règles appliquées" kind="engine">
        <ul className="decision-list">
          <li className="decision-item"><span className="decision-item-title">{e.ruleId}</span><span className="decision-item-meta">Règle de décision</span></li>
          {record.ruleIds.map((ruleId) => (
            <li key={ruleId} className="decision-item"><span className="decision-item-title">{ruleId}</span></li>
          ))}
        </ul>
      </Section>

      <Section number={7} title="Rejets et motifs" kind="engine" collapsed>
        {e.rejected.length === 0 ? <p className="muted">Aucun candidat rejeté.</p> : (
          <ul className="decision-list">
            {e.rejected.map((rejected) => (
              <li key={rejected.actionId} className="decision-item">
                <span className="decision-item-title">{actionLabel(rejected.actionId)}</span>
                {rejected.reasons.map((reason) => <span key={reason} className="decision-item-reason">{reason}</span>)}
              </li>
            ))}
          </ul>
        )}
        <p className="decision-reason"><strong>Motif de sélection :</strong> {e.reason}</p>
      </Section>

      <Section number={8} title="Effets attendus" kind="engine">
        <h4>Besoins</h4><Values values={e.expectedEffects.needs as Record<string, number>} labels={NEED_LABELS} />
        <h4>Émotions</h4><Values values={e.expectedEffects.emotions as Record<string, number>} labels={EMOTION_LABELS} />
      </Section>

      <Section number={9} title="États avant et après" kind="fact" collapsed>
        <h4>Avant le tick</h4>
        <Values values={{ ...record.stateBefore.needs }} labels={NEED_LABELS} />
        <Values values={{ ...record.stateBefore.emotions }} labels={EMOTION_LABELS} />
        <h4>Après le tick</h4>
        <Values values={{ ...record.stateAfter.needs }} labels={NEED_LABELS} />
        <Values values={{ ...record.stateAfter.emotions }} labels={EMOTION_LABELS} />
        <p className="muted">
          Action active après : {record.stateAfter.runtime.active ? `${actionLabel(record.stateAfter.runtime.active.actionId)} (fin tick ${record.stateAfter.runtime.active.endsAtTick})` : 'aucune'}.
        </p>
      </Section>

      <Section number={10} title="Deltas appliqués" kind="fact" collapsed>
        <h4>Deltas passifs</h4>
        <ul className="decision-list">{record.passiveDeltas.map((delta, index) => <DeltaLine key={`${delta.field}-${index}`} delta={delta} />)}</ul>
        <h4>Deltas d'action</h4>
        <ul className="decision-list">
          {record.actionDeltas.map((delta) => (
            <li key={`${delta.field}-${delta.tick}`} className="decision-item">
              <span className="decision-item-title">{fieldLabel(delta.field)}</span>
              <span className="decision-item-meta">Attendu {formatSigned(delta.expected)} · appliqué {formatSigned(delta.applied)}</span>
            </li>
          ))}
        </ul>
        <h4>Deltas effectifs</h4>
        <ul className="decision-list">{record.appliedDeltas.map((delta, index) => <DeltaLine key={`${delta.field}-${index}`} delta={delta} />)}</ul>
      </Section>

      <Section number={11} title="Hasard et versions" kind="engine" collapsed>
        <dl className="decision-facts">
          <dt>État PRNG avant / après</dt><dd>{record.explanation.rngStateBefore} / {record.explanation.rngStateAfter}</dd>
          <dt>Tirages PRNG</dt><dd>{record.explanation.rngDraws}</dd>
          <dt>Moteur / registre / paramètres</dt><dd>{record.engineVersion} / {record.registryVersion} / {record.parametersVersion}</dd>
          <dt>Format d'enregistrement</dt><dd>v{record.recordVersion}</dd>
        </dl>
      </Section>

      <Section number={12} title="Traçabilité et avertissements" kind="fact">
        <dl className="decision-facts">
          <dt>Empreinte de la charge utile</dt><dd><code>{shortHash(record.payloadSha256)}</code></dd>
          <dt>Taille canonique</dt><dd>{record.uncompressedBytes} octets</dd>
        </dl>
        {record.warnings.length === 0 ? <p className="muted">Aucun avertissement.</p> : (
          <ul className="decision-list">
            {record.warnings.map((warning) => <li key={warning} className="decision-item decision-warning">{warning}</li>)}
          </ul>
        )}
      </Section>
    </div>
  );
}
