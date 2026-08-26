// Exécution de requêtes .in() par LOTS d'ids.
//
// Au-delà de ~200 UUID dans un seul .in(), l'URL PostgREST dépasse la limite
// HTTP et la requête échoue (fetch failed / UND_ERR_HEADERS_OVERFLOW). Quand
// l'erreur n'est pas vérifiée (const { data } = ...), le résultat est une
// liste vide silencieuse — les écoles de 400+ élèves voyaient des pages vides.
//
// buildQuery(chunk) doit renvoyer la requête Supabase pour le sous-ensemble.

export const CHUNK_SIZE = 150;

export const chunkArray = (arr, size = CHUNK_SIZE) => {
  const out = [];
  for (let i = 0; i < (arr || []).length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

// Concatène les résultats de tous les lots. Lève l'erreur du premier lot en échec.
export const selectInChunks = async (ids, buildQuery, size = CHUNK_SIZE) => {
  const out = [];
  for (const part of chunkArray(ids, size)) {
    const { data, error } = await buildQuery(part);
    if (error) throw error;
    if (data) out.push(...data);
  }
  return out;
};

// Variante tolérante : une erreur → tableau vide (comportement des appels
// historiques qui ignoraient { error }).
export const selectInChunksSafe = async (ids, buildQuery, size = CHUNK_SIZE) => {
  try { return await selectInChunks(ids, buildQuery, size); }
  catch { return []; }
};

// ---- Pagination ----
//
// PostgREST plafonne CHAQUE réponse (max-rows = 1000 chez Supabase). Une
// requête qui dépasse ce seuil renvoie 1000 lignes sans erreur : les
// statistiques sur 90 jours sous-comptaient donc en silence. Ces helpers
// rejouent la requête par tranches jusqu'à épuisement.
//
// buildQuery() doit renvoyer une requête NEUVE à chaque appel (un builder
// Supabase ne se rejoue pas) et porter un .order() stable, sinon les pages
// peuvent se recouvrir.
export const PAGE_SIZE = 1000;

export const selectAllPages = async (buildQuery, { pageSize = PAGE_SIZE, maxRows = 100000 } = {}) => {
  const out = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    out.push(...data);
    if (data.length < pageSize) break;
  }
  return out;
};

// Chunking des ids ET pagination de chaque lot.
export const selectInChunksPaged = async (ids, buildQuery, size = CHUNK_SIZE) => {
  const out = [];
  for (const part of chunkArray(ids, size)) {
    out.push(...await selectAllPages(() => buildQuery(part)));
  }
  return out;
};
