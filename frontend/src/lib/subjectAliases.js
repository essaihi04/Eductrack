const normalize = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '');

const aliases = new Map([
  ['pc', { key: 'physique_chimie', label: 'Physique-Chimie' }],
  ['physiquechimie', { key: 'physique_chimie', label: 'Physique-Chimie' }],
  ['sciencesphysiques', { key: 'physique_chimie', label: 'Physique-Chimie' }],
  ['svt', { key: 'svt', label: 'Sciences de la vie et de la terre' }],
  ['sciences', { key: 'svt', label: 'Sciences de la vie et de la terre' }],
  ['sciencesdelavieetdelaterre', { key: 'svt', label: 'Sciences de la vie et de la terre' }],
  ['arabe', { key: 'arabe', label: 'Arabe' }],
  ['languearabe', { key: 'arabe', label: 'Arabe' }],
  ['francais', { key: 'francais', label: 'Français' }],
  ['languefrancaise', { key: 'francais', label: 'Français' }],
  ['anglais', { key: 'anglais', label: 'Anglais' }],
  ['langueanglaise', { key: 'anglais', label: 'Anglais' }],
  ['eps', { key: 'eps', label: 'Éducation physique et sportive' }],
  ['educationphysiqueetsportive', { key: 'eps', label: 'Éducation physique et sportive' }],
]);

export const canonicalSubject = (subject = {}) => {
  const name = typeof subject === 'string' ? subject : subject.name;
  const code = typeof subject === 'string' ? '' : subject.code;
  const fallback = String(name || code || '').trim();
  return aliases.get(normalize(name)) || aliases.get(normalize(code)) || {
    key: normalize(name) || normalize(code),
    label: fallback,
  };
};

// Garde un seul choix par matière fonctionnelle. L'ordre de l'API reste stable,
// avec préférence pour le libellé canonique lisible quand il existe.
export const dedupeSubjects = (subjects = []) => {
  const byKey = new Map();
  for (const subject of subjects) {
    const canonical = canonicalSubject(subject);
    if (!canonical.key) continue;
    const candidate = { ...subject, canonical_key: canonical.key, display_name: canonical.label };
    const previous = byKey.get(canonical.key);
    if (!previous || normalize(subject.name) === normalize(canonical.label)) {
      byKey.set(canonical.key, candidate);
    }
  }
  return [...byKey.values()];
};
