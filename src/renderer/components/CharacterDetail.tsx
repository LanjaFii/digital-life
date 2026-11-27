import { ArrowLeft, Brain, Heart, Sparkles, Target, Trash2, User } from 'lucide-react';
import type { Character } from '../../shared/character';
import { StatBar } from './StatBar';
import { DecisionPanel } from './DecisionPanel';

interface Props {
  character: Character;
  onBack: () => void;
  /** Fourni uniquement pour une instance de monde (jamais pour un modèle de bibliothèque). */
  onDelete?: () => void;
  /** Accès facultatif à l'historique : absent pour un modèle de bibliothèque. */
  decisions?: { worldId: string; revision: number };
}

const TRAIT_LABELS: Record<string, string> = {
  sociability: 'Sociabilité',
  empathy: 'Empathie',
  aggression: 'Agressivité',
  patience: 'Patience',
  impulsivity: 'Impulsivité',
  curiosity: 'Curiosité',
  intelligence: 'Intelligence',
  creativity: 'Créativité',
  honesty: 'Honnêteté',
  altruism: 'Altruisme',
  ambition: 'Ambition',
  courage: 'Courage',
  timidity: 'Timidité',
  distrust: 'Méfiance',
  optimism: 'Optimisme',
  humor: 'Humour',
  jealousy: 'Jalousie',
  discipline: 'Discipline',
  independence: 'Indépendance',
  loyalty: 'Loyauté',
  resilience: 'Résilience',
};

const EMOTION_LABELS: Record<string, string> = {
  happiness: 'Bonheur',
  sadness: 'Tristesse',
  stress: 'Stress',
  anxiety: 'Anxiété',
  anger: 'Colère',
  fear: 'Peur',
  confidence: 'Confiance',
  loneliness: 'Solitude',
  motivation: 'Motivation',
  satisfaction: 'Satisfaction',
};

const NEED_LABELS: Record<string, string> = {
  hunger: 'Faim',
  thirst: 'Soif',
  energy: 'Énergie',
  sleep: 'Sommeil',
  health: 'Santé',
  hygiene: 'Hygiène',
  socialization: 'Socialisation',
  safety: 'Sécurité',
};

function genderLabel(gender: Character['gender']): string {
  if (gender === 'female') return 'Femme';
  if (gender === 'male') return 'Homme';
  return 'Non binaire';
}

export function CharacterDetail({ character, onBack, onDelete, decisions }: Props) {
  const state = character.currentState;
  const primary = state.goals.find((g) => g.kind === 'primary');
  const secondary = state.goals.filter((g) => g.kind === 'secondary');

  return (
    <div className="character-detail">
      <div className="detail-topbar">
        <button type="button" className="button ghost" onClick={onBack}>
          <ArrowLeft size={16} /> Retour aux personnages
        </button>
        {onDelete ? (
          <button type="button" className="button danger" onClick={onDelete}>
            <Trash2 size={15} /> Supprimer ce personnage
          </button>
        ) : null}
      </div>

      <section className="panel detail-hero">
        <div className="detail-identity">
          <p className="eyebrow">Fiche personnage</p>
          <h2>{character.firstName} {character.lastName}</h2>
          <p className="detail-bio">{character.biography}</p>
        </div>
        <div className="detail-identity-meta">
          <div className="meta-pill"><User size={14} /> {genderLabel(character.gender)}</div>
          <div className="meta-pill">{character.age} ans</div>
          <div className="meta-pill subtle">ID {character.id.slice(0, 8)}</div>
        </div>
      </section>

      <div className="detail-grid">
        <section className="panel">
          <div className="panel-header compact">
            <div><p className="eyebrow"><Brain size={12} /> Personnalité</p><h3>Traits (0-100)</h3></div>
          </div>
          <div className="stat-list">
            {Object.entries(state.traits).map(([key, value]) => (
              <StatBar key={key} label={TRAIT_LABELS[key] ?? key} value={value} tone="gold" />
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header compact">
            <div><p className="eyebrow"><Sparkles size={12} /> Émotions</p><h3>État émotionnel (0-100)</h3></div>
          </div>
          <div className="stat-list">
            {Object.entries(state.emotions).map(([key, value]) => (
              <StatBar key={key} label={EMOTION_LABELS[key] ?? key} value={value} tone="cyan" />
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header compact">
            <div><p className="eyebrow"><Heart size={12} /> Besoins</p><h3>Besoins (100 = satisfait)</h3></div>
          </div>
          <div className="stat-list">
            {Object.entries(state.needs).map(([key, value]) => (
              <StatBar key={key} label={NEED_LABELS[key] ?? key} value={value} tone="violet" />
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header compact">
            <div><p className="eyebrow"><Target size={12} /> Objectifs</p><h3>Motivations actuelles</h3></div>
          </div>
          <div className="goal-block">
            <p className="goal-label">Objectif principal</p>
            <p className="goal-primary">{primary?.label ?? 'Aucun objectif principal défini.'}</p>
          </div>
          <div className="goal-block">
            <p className="goal-label">Objectifs secondaires</p>
            <ul className="goal-list">
              {secondary.length > 0 ? secondary.map((g) => <li key={g.id}>{g.label}</li>) : <li>Aucun objectif secondaire.</li>}
            </ul>
          </div>
        </section>
      </div>

      {decisions ? (
        <DecisionPanel
          worldId={decisions.worldId}
          revision={decisions.revision}
          characterId={character.id}
          title="Décisions de ce personnage"
        />
      ) : null}
    </div>
  );
}
