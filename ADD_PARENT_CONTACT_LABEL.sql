-- =============================================================================
-- Ajoute un libellé sur les contacts parent (Père / Mère / Tuteur / nom)
-- =============================================================================
-- Pourquoi : un même élève a souvent un père ET une mère avec deux numéros
-- distincts. On les regroupe désormais sous UN SEUL compte parent (la famille),
-- avec les deux numéros stockés dans parent_contacts. Cette colonne `label`
-- permet de savoir quel numéro correspond au père et lequel à la mère.
--
-- Migration additive et idempotente : sûre à rejouer.
-- =============================================================================

ALTER TABLE public.parent_contacts
  ADD COLUMN IF NOT EXISTS label text;
