// Liste UNIQUE des documents du dossier d'inscription, partagée par :
//   - le formulaire admin (StudentsPage)
//   - le formulaire finance (StudentInscriptionModal)
//   - la fiche d'inscription imprimée (inscriptionFiche)
// Auparavant chacun avait sa propre copie → ce que l'admin cochait
// (« Certificat MASSAR ») ne s'imprimait jamais. NE PAS redéfinir localement :
// toujours importer d'ici pour que les cases cochées = les cases imprimées.
// La clé est stockée dans profiles.inscription_documents (JSON) : ne pas la
// renommer sans migration, au risque de « décocher » des dossiers existants.
export const DOSSIER_DOC_KEYS = [
  ['livret_famille', 'Livret de famille'],
  ['carnet_vaccination', 'Carnet de vaccination'],
  ['cin_pere', 'CIN du père'],
  ['cin_mere', 'CIN de la mère'],
  ['photos_4', '4 Photos'],
  ['cert_scolarite', 'Certificat de scolarité'],
  ['dossier_medical', 'Dossier médical'],
  ['bulletin', 'Bulletin de notes'],
  ['resultats_en_cours', 'Résultats en cours'],
  ['cert_massar', 'Certificat MASSAR'],
];
