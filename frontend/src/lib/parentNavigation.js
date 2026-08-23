const STORAGE_KEY = 'edutrack.parent.selectedChild';

const childIdOf = (child) => child?.student?.id || child?.id || '';

export const rememberParentChild = (childId) => {
  if (!childId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, childId);
  } catch {
    // La navigation reste fonctionnelle si le stockage du navigateur est bloqué.
  }
};

export const preferredParentChild = (children, requestedId = '') => {
  const ids = (Array.isArray(children) ? children : []).map(childIdOf).filter(Boolean);
  if (requestedId && ids.includes(requestedId)) return requestedId;

  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored && ids.includes(stored)) return stored;
    } catch {
      // Repli sur le premier enfant disponible.
    }
  }

  return ids[0] || '';
};

export const parentPathForChild = (path, childId) => {
  if (!childId) return path;
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}childId=${encodeURIComponent(childId)}`;
};
