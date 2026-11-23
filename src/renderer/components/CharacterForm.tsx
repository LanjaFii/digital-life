import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Dices, Heart, Brain, Sparkles, Target, User } from 'lucide-react';
import type { CharacterDraft, CharacterGoal } from '../../shared/character';
import { EMOTION_KEYS, NEED_KEYS, TRAIT_KEYS } from '../../shared/character';
import { EMOTION_LABELS, NEED_LABELS, TRAIT_DESCRIPTIONS, TRAIT_LABELS, emptyDraft } from './character-labels';

type Mode = 'create' | 'edit';
type Context = 'world' | 'library';

interface Props {
  mode: Mode;
  context: Context;
  initialDraft?: CharacterDraft;
  title?: string;
  submitLabel?: string;
  onCancel: () => void;
  onSubmit: (draft: CharacterDraft, saveAsTemplate: boolean) => void | Promise<void>;
}

const STEPS = ['Identité', 'Personnalité', 'Émotions', 'Besoins', 'Objectifs', 'Récapitulatif'] as const;

function validateIdentity(draft: CharacterDraft): string | null {
  if (!draft.firstName.trim()) return 'Le prénom est obligatoire.';
  if (!draft.lastName.trim()) return 'Le nom est obligatoire.';
  if (!Number.isInteger(draft.age) || draft.age < 18 || draft.age > 65) return 'L’âge doit être entre 18 et 65 ans.';
  if (!['female', 'male', 'nonbinary'].includes(draft.gender)) return 'Genre invalide.';
  return null;
}

function validateGoals(draft: CharacterDraft): string | null {
  const primary = draft.goals.filter((g) => g.kind === 'primary');
  const secondary = draft.goals.filter((g) => g.kind === 'secondary');
  if (primary.length !== 1 || !primary[0].label.trim()) return 'Un objectif principal est requis.';
  if (secondary.length !== 2 || secondary.some((g) => !g.label.trim())) return 'Deux objectifs secondaires sont requis.';
  return null;
}

function SliderField({ label, description, value, onChange }: { label: string; description?: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="form-slider">
      <div className="form-slider-head">
        <span>{label}</span>
        <input
          type="number"
          min={0}
          max={100}
          value={value}
          onChange={(e) => onChange(Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))))}
          aria-label={`Valeur ${label}`}
        />
      </div>
      {description ? <p className="form-slider-desc">{description}</p> : null}
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
      />
    </div>
  );
}

export function CharacterForm({ mode, context, initialDraft, title, submitLabel, onCancel, onSubmit }: Props) {
  const [draft, setDraft] = useState<CharacterDraft>(() => initialDraft ? { ...initialDraft, traits: { ...initialDraft.traits }, emotions: { ...initialDraft.emotions }, needs: { ...initialDraft.needs }, goals: initialDraft.goals.map((g) => ({ ...g })) } : emptyDraft());
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveAsTemplate, setSaveAsTemplate] = useState(context === 'world' && mode === 'create');

  const setField = <K extends keyof CharacterDraft>(key: K, value: CharacterDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const setScore = (group: 'traits' | 'emotions' | 'needs', key: string, value: number) => {
    setDraft((d) => ({ ...d, [group]: { ...d[group], [key]: value } }));
  };

  const setGoal = (index: number, label: string) => {
    setDraft((d) => ({ ...d, goals: d.goals.map((g, i) => (i === index ? { ...g, label } : g)) }));
  };

  const randomizePersonality = async () => {
    try {
      const random = await window.digitalLife.generateRandomDraft();
      setDraft((d) => ({ ...d, traits: random.traits, emotions: random.emotions, needs: random.needs }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const stepError = useMemo(() => {
    if (step === 0) return validateIdentity(draft);
    if (step === 4) return validateGoals(draft);
    return null;
  }, [step, draft]);

  const canNext = !stepError;

  const goNext = () => {
    if (stepError) { setError(stepError); return; }
    setError(null);
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  const goBack = () => {
    setError(null);
    setStep((s) => Math.max(0, s - 1));
  };

  const submit = async () => {
    const identityErr = validateIdentity(draft);
    const goalsErr = validateGoals(draft);
    if (identityErr || goalsErr) { setError(identityErr || goalsErr); return; }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(draft, saveAsTemplate);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const primary = draft.goals.find((g) => g.kind === 'primary');
  const secondary = draft.goals.filter((g) => g.kind === 'secondary');

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label={title ?? 'Personnage'}>
      <div className="dialog dialog-wide character-form">
        <div className="dialog-header">
          <div>
            <p className="eyebrow">{context === 'library' ? 'Bibliothèque' : 'Monde'}</p>
            <h2>{title ?? (mode === 'create' ? 'Créer un personnage' : 'Modifier le personnage')}</h2>
          </div>
          <button type="button" className="button ghost" onClick={onCancel} disabled={busy}>Fermer</button>
        </div>

        <div className="form-steps">
          {STEPS.map((label, i) => (
            <button key={label} type="button" className={`form-step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`} onClick={() => { if (i <= step) { setError(null); setStep(i); } }} disabled={i > step}>
              <span className="form-step-index">{i + 1}</span>
              <span className="form-step-label">{label}</span>
            </button>
          ))}
        </div>

        {error ? <div className="error-banner" role="alert">{error}</div> : null}

        <div className="dialog-body form-body">
          {step === 0 ? (
            <div className="form-grid">
              <label className="field"><span>Prénom *</span><input value={draft.firstName} onChange={(e) => setField('firstName', e.target.value)} maxLength={40} /></label>
              <label className="field"><span>Nom *</span><input value={draft.lastName} onChange={(e) => setField('lastName', e.target.value)} maxLength={40} /></label>
              <label className="field"><span>Âge (18-65)</span><input type="number" min={18} max={65} value={draft.age} onChange={(e) => setField('age', Math.round(Number(e.target.value) || 0))} /></label>
              <label className="field"><span>Genre</span>
                <select value={draft.gender} onChange={(e) => setField('gender', e.target.value as CharacterDraft['gender'])}>
                  <option value="female">Femme</option>
                  <option value="male">Homme</option>
                  <option value="nonbinary">Non binaire</option>
                </select>
              </label>
              <label className="field field-wide"><span>Biographie</span><textarea value={draft.biography} onChange={(e) => setField('biography', e.target.value)} maxLength={500} rows={4} /></label>
            </div>
          ) : null}

          {step === 1 ? (
            <div>
              <div className="form-toolbar">
                <p className="eyebrow"><Brain size={12} /> 21 traits de personnalité (0-100)</p>
                <button type="button" className="button ghost" onClick={() => void randomizePersonality()}><Dices size={15} /> Générer une personnalité cohérente</button>
              </div>
              <div className="slider-grid">
                {TRAIT_KEYS.map((key) => (
                  <SliderField key={key} label={TRAIT_LABELS[key]} description={TRAIT_DESCRIPTIONS[key]} value={draft.traits[key]} onChange={(v) => setScore('traits', key, v)} />
                ))}
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div>
              <p className="eyebrow"><Sparkles size={12} /> 10 émotions initiales (0-100)</p>
              <div className="slider-grid">
                {EMOTION_KEYS.map((key) => (
                  <SliderField key={key} label={EMOTION_LABELS[key]} value={draft.emotions[key]} onChange={(v) => setScore('emotions', key, v)} />
                ))}
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div>
              <p className="eyebrow"><Heart size={12} /> 8 besoins initiaux (100 = satisfait)</p>
              <div className="slider-grid">
                {NEED_KEYS.map((key) => (
                  <SliderField key={key} label={NEED_LABELS[key]} value={draft.needs[key]} onChange={(v) => setScore('needs', key, v)} />
                ))}
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="form-grid">
              <label className="field field-wide"><span><Target size={12} /> Objectif principal *</span><input value={primary?.label ?? ''} onChange={(e) => setGoal(draft.goals.findIndex((g) => g.kind === 'primary'), e.target.value)} maxLength={120} /></label>
              {secondary.map((goal, i) => {
                const index = draft.goals.findIndex((g) => g.id === goal.id);
                return (
                  <label key={goal.id} className="field field-wide"><span>Objectif secondaire {i + 1} *</span><input value={goal.label} onChange={(e) => setGoal(index, e.target.value)} maxLength={120} /></label>
                );
              })}
            </div>
          ) : null}

          {step === 5 ? (
            <div className="recap">
              <section className="panel recap-hero">
                <p className="eyebrow"><User size={12} /> Récapitulatif</p>
                <h3>{draft.firstName} {draft.lastName}</h3>
                <p className="muted">{draft.age} ans · {draft.gender === 'female' ? 'Femme' : draft.gender === 'male' ? 'Homme' : 'Non binaire'}</p>
                <p>{draft.biography || 'Aucune biographie.'}</p>
              </section>
              <div className="recap-grid">
                <section className="panel"><h4>Objectifs</h4>
                  <p><strong>Principal :</strong> {primary?.label}</p>
                  <ul>{secondary.map((g) => <li key={g.id}>{g.label}</li>)}</ul>
                </section>
                <section className="panel"><h4>Aperçu personnalité</h4>
                  <ul>{TRAIT_KEYS.slice(0, 6).map((k) => <li key={k}>{TRAIT_LABELS[k]} : {draft.traits[k]}</li>)}</ul>
                </section>
              </div>
              {context === 'world' && mode === 'create' ? (
                <label className="check-field">
                  <input type="checkbox" checked={saveAsTemplate} onChange={(e) => setSaveAsTemplate(e.target.checked)} />
                  <span>Enregistrer aussi ce modèle dans ma bibliothèque</span>
                </label>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="dialog-actions form-actions">
          <button type="button" className="button ghost" onClick={step === 0 ? onCancel : goBack} disabled={busy}>
            <ArrowLeft size={15} /> {step === 0 ? 'Annuler' : 'Précédent'}
          </button>
          {step < STEPS.length - 1 ? (
            <button type="button" className="button primary" onClick={goNext} disabled={!canNext}>
              Suivant <ArrowRight size={15} />
            </button>
          ) : (
            <button type="button" className="button primary" onClick={() => void submit()} disabled={busy}>
              <Check size={15} /> {submitLabel ?? (mode === 'create' ? 'Confirmer' : 'Enregistrer')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
