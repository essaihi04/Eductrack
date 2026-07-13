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
