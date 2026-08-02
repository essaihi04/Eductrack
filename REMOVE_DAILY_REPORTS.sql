-- ============================================================
-- Suppression de l'envoi automatique des rapports quotidiens
-- ============================================================
-- La fonctionnalité d'envoi automatique (planificateur école +
-- préférences par parent) a été retirée du code. Ce script supprime
-- les tables devenues inutiles :
--   - daily_report_settings   : réglages d'envoi auto par école
--   - parent_report_preferences : préférences personnelles des parents
--   - daily_reports           : historique des rapports envoyés
--
-- Les aperçus/rapports à la demande (admin + chatbot) ne dépendent
-- d'aucune de ces tables.
--
-- À exécuter dans Supabase → SQL Editor (une seule fois).
-- ⚠️ Irréversible : l'historique des rapports envoyés est perdu.

drop table if exists parent_report_preferences cascade;
drop table if exists daily_report_settings cascade;
drop table if exists daily_reports cascade;
