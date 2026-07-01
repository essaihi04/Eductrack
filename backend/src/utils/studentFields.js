/**
 * Mappe les champs « fiche d'inscription » d'un body (camelCase) vers les
 * colonnes profiles (snake_case). Partagé par la création/édition d'élève
 * (admin) ET par l'inscription côté finance.
 * Ne retourne que les clés réellement fournies (≠ undefined/null/'').
 */
export const mapStudentOptionalFields = (body = {}) => {
  const b = body;
  const bool = (v) => (typeof v === 'boolean' ? v : undefined);
  const optional = {
    first_name_ar: b.firstNameAr, last_name_ar: b.lastNameAr,
    gender: b.gender, phone: b.phone, cin: b.cin,
    date_of_birth: b.dateOfBirth, birth_place: b.birthPlace,
    level: b.level, registration_number: b.registrationNumber, entry_date: b.entryDate,
    dossier_status: b.dossierStatus, massar_code: b.massarCode,
    previous_school: b.previousSchool, previous_class: b.previousClass,
    has_health_issue: bool(b.hasHealthIssue), health_notes: b.healthNotes,
    photo_authorized: bool(b.photoAuthorized),
    home_address: b.homeAddress, quartier: b.quartier, home_phone: b.homePhone,
    // v2 — informations supplémentaires
    nationality: b.nationality, country: b.country,
    is_staff_child: bool(b.isStaffChild), is_partner_group: bool(b.isPartnerGroup),
    is_expat: bool(b.isExpat), had_accompaniment: bool(b.hadAccompaniment),
    has_transport: bool(b.hasTransport),
    reinscription_date: b.reinscriptionDate, origin_school: b.originSchool,
    // v2 — documents du dossier + signature
    inscription_documents: b.inscriptionDocuments,
    inscription_signature: b.inscriptionSignature,
  };
  const out = {};
  for (const [k, v] of Object.entries(optional)) {
    if (v !== undefined && v !== null && v !== '') out[k] = v;
  }
  // Localisation domicile (utilisée par le transport ; aussi captée via le
  // chatbot WhatsApp). On accepte une saisie manuelle.
  const lat = Number(b.homeLat), lng = Number(b.homeLng);
  if (b.homeLat !== undefined && b.homeLat !== null && b.homeLat !== '' && Number.isFinite(lat)) out.home_lat = lat;
  if (b.homeLng !== undefined && b.homeLng !== null && b.homeLng !== '' && Number.isFinite(lng)) out.home_lng = lng;
  return out;
};
