import { useEffect, useRef, useState } from 'react';
import { X, UserPlus, Pencil, Camera, FileText, MapPin, Check, Copy } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { inscriptionsApi } from '../../lib/inscriptionsApi';
import { generateStudentEmail, generatePassword } from '../../utils/studentUtils';
import { printInscriptionFiche } from '../../utils/inscriptionFiche';

// Fiche d'inscription « Nouvel élève » — reprise à l'identique du formulaire
// admin (photo, parents P1/P2, scolarité, documents, médical, identifiants),
// branchée sur les routes /api/inscriptions accessibles au responsable financier.
// Après validation, propose de télécharger la même fiche d'inscription PDF.

import { DOSSIER_DOC_KEYS as DOC_KEYS } from '../../utils/dossierDocuments';

const emptyForm = {
  email: '', password: '',
  firstName: '', lastName: '', firstNameAr: '', lastNameAr: '',
  gender: 'M', phone: '', cin: '',
  dateOfBirth: '', birthPlace: '', level: '', classId: '',
  registrationNumber: '', entryDate: '', massarCode: '',
  dossierStatus: 'complet',
  previousSchool: '', previousClass: '',
  hasHealthIssue: false, healthNotes: '',
  photoAuthorized: true,
  homeAddress: '', quartier: '', homePhone: '', homeLat: '', homeLng: '',
  nationality: '', country: '', reinscriptionDate: '', originSchool: '',
  isStaffChild: false, isPartnerGroup: false, isExpat: false,
  hadAccompaniment: false, hasTransport: false,
  inscriptionDocuments: {}, inscriptionSignature: '',
  parent1: { lastName: '', firstName: '', email: '', phone: '', cin: '', profession: '', relationship: 'pere', maritalStatus: '' },
  parent2: { lastName: '', firstName: '', email: '', phone: '', cin: '', profession: '', relationship: 'mere', maritalStatus: '' },
};

// Pré-remplit un bloc parent du formulaire depuis un parent renvoyé par
// GET /inscriptions/students/:id (snake_case).
const parentToForm = (p, fallbackRelationship) => ({
  lastName: p?.last_name || '', firstName: p?.first_name || '',
  email: p?.email || '', phone: p?.phone || '', cin: p?.cin || '',
  profession: p?.profession || '',
  relationship: p?.relationship || fallbackRelationship,
  maritalStatus: p?.marital_status || '',
});

// Pré-remplit tout le formulaire depuis une fiche élève complète (mode édition).
const formFromStudent = (s) => ({
  ...emptyForm,
  email: s.email || '', password: '',
  firstName: s.first_name || '', lastName: s.last_name || '',
  firstNameAr: s.first_name_ar || '', lastNameAr: s.last_name_ar || '',
  gender: s.gender || 'M', phone: s.phone || '', cin: s.cin || '',
  dateOfBirth: (s.date_of_birth || '').slice(0, 10), birthPlace: s.birth_place || '',
  level: s.level || '', classId: s.class_id || '',
  registrationNumber: s.registration_number || '',
  entryDate: (s.entry_date || '').slice(0, 10), massarCode: s.massar_code || '',
  dossierStatus: s.dossier_status || 'complet',
  previousSchool: s.previous_school || '', previousClass: s.previous_class || '',
  hasHealthIssue: !!s.has_health_issue, healthNotes: s.health_notes || '',
  photoAuthorized: s.photo_authorized !== false,
  homeAddress: s.home_address || '', quartier: s.quartier || '', homePhone: s.home_phone || '',
  homeLat: s.home_lat ?? '', homeLng: s.home_lng ?? '',
  nationality: s.nationality || '', country: s.country || '',
  reinscriptionDate: (s.reinscription_date || '').slice(0, 10), originSchool: s.origin_school || '',
  isStaffChild: !!s.is_staff_child, isPartnerGroup: !!s.is_partner_group, isExpat: !!s.is_expat,
  hadAccompaniment: !!s.had_accompaniment, hasTransport: !!s.has_transport,
  inscriptionDocuments: s.inscription_documents || {},
  inscriptionSignature: s.inscription_signature || '',
  parent1: parentToForm(s.parents?.[0], 'pere'),
  parent2: parentToForm(s.parents?.[1], 'mere'),
});

const buildParentContacts = (p) => {
  const fullName = `${(p.lastName || '').trim()} ${(p.firstName || '').trim()}`.trim();
  if (!fullName || !(p.phone || '').trim()) return null;
  return {
    name: fullName, phone: p.phone.trim(),
    relationship: p.relationship || null, cin: p.cin || null,
    profession: p.profession || null, maritalStatus: p.maritalStatus || null,
    email: p.email || null,
  };
};

// `student` (fiche complète issue de GET /inscriptions/students/:id) → mode
// ÉDITION : formulaire pré-rempli, enregistrement via PUT, identifiants masqués.
export default function StudentInscriptionModal({ open, onClose, classes = [], levels = [], academicYear, onCreated, student = null }) {
  const { profile } = useAuth();
  const school = profile?.school || {};
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const isEdit = !!student;

  const [formData, setFormData] = useState(emptyForm);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null); // élève créé/modifié (écran de confirmation)
  const photoInputRef = useRef(null);

  // À l'ouverture : formulaire vierge (création) ou pré-rempli (édition).
  useEffect(() => {
    if (!open) return;
    setFormData(student ? formFromStudent(student) : emptyForm);
    setPhotoFile(null);
    setPhotoPreview(student?.avatar_url || null);
    setError('');
    setCreated(null);
    if (photoInputRef.current) photoInputRef.current.value = '';
  }, [open, student]);

  if (!open) return null;

  const inputCls = 'w-full px-3 py-2 border rounded text-sm';
  const setF = (field) => (e) => setFormData((f) => ({ ...f, [field]: e.target.value }));
  const setP = (pk, field) => (e) => setFormData((f) => ({ ...f, [pk]: { ...f[pk], [field]: e.target.value } }));
  const Label = ({ children }) => <label className="block text-xs font-medium text-gray-600 mb-1">{children}</label>;

  const handlePhotoSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const resetAll = () => {
    setFormData(student ? formFromStudent(student) : emptyForm);
    setPhotoFile(null);
    setPhotoPreview(student?.avatar_url || null);
    setError('');
    setCreated(null);
    if (photoInputRef.current) photoInputRef.current.value = '';
  };

  const close = () => { if (!submitting) { resetAll(); onClose?.(); } };

  const handleSubmit = async (e, { thenPrint = false } = {}) => {
    e.preventDefault();
    if (submitting) return;
    if (!formData.firstName || !formData.lastName) { setError('Nom et prénom requis'); return; }
    setSubmitting(true);
    setError('');
    try {
      const { parent1, parent2, ...studentFields } = formData;
      let saved;
      let email = '';
      let password = '';
      if (isEdit) {
        // Mise à jour de la fiche (les identifiants auth ne sont pas modifiés).
        saved = await inscriptionsApi.updateStudent(student.id, { ...studentFields, academicYear });
        email = saved.email || student.email || '';
      } else {
        // Même convention que les élèves importés : codemassar@nomecole.ma,
        // ou nom.prenom@nomecole.ma tant que l'élève n'a pas de code Massar.
        email = (formData.email || '').trim() || generateStudentEmail({
          massarCode: formData.massarCode,
          firstName: formData.firstName,
          lastName: formData.lastName,
          schoolName: school?.name,
        });
        password = (formData.password || '').trim() || generatePassword(formData.firstName);
        saved = await inscriptionsApi.createStudent({ ...studentFields, email, password, academicYear });
      }

      if (photoFile) {
        try { const { avatar_url } = await inscriptionsApi.uploadPhoto(saved.id, photoFile); saved = { ...saved, avatar_url }; }
        catch (err) { console.error('Upload photo échoué:', err); }
      }

      // En édition comme en création : add-parents réutilise un parent existant
      // par téléphone (pas de doublon si les blocs sont resoumis inchangés).
      const contacts = [buildParentContacts(parent1), buildParentContacts(parent2)].filter(Boolean);
      const savedParents = [];
      for (const c of contacts) {
        try {
          await inscriptionsApi.addParents(saved.id, [c], academicYear);
          savedParents.push({
            first_name: c.name.split(' ').slice(1).join(' '), last_name: c.name.split(' ')[0],
            relationship: c.relationship, email: c.email, phone: c.phone,
            cin: c.cin, profession: c.profession, marital_status: c.maritalStatus,
          });
        } catch (err) { console.error('Ajout parent échoué:', err); }
      }
      saved = { ...saved, parents: savedParents, email, password };

      onCreated?.(saved);
      if (thenPrint) printInscriptionFiche({ student: saved, school, classes, apiBase, academicYear });
      setCreated(saved);
    } catch (err) {
      setError(err.message || "Erreur lors de l'inscription");
    } finally {
      setSubmitting(false);
    }
  };

  const parentForm = (pk, title) => {
    const p = formData[pk];
    return (
      <div className="border rounded-lg p-3 bg-gray-50/60 space-y-2">
        <p className="text-sm font-semibold text-gray-700">{title}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div><Label>Nom</Label><input className={inputCls} value={p.lastName} onChange={setP(pk, 'lastName')} /></div>
          <div><Label>Prénom</Label><input className={inputCls} value={p.firstName} onChange={setP(pk, 'firstName')} /></div>
          <div><Label>Téléphone (06/07…)</Label><input className={inputCls} value={p.phone} onChange={setP(pk, 'phone')} placeholder="0650-123456" /></div>
          <div><Label>Email</Label><input className={inputCls} value={p.email} onChange={setP(pk, 'email')} /></div>
          <div><Label>CIN</Label><input className={inputCls} value={p.cin} onChange={setP(pk, 'cin')} /></div>
          <div><Label>Profession</Label><input className={inputCls} value={p.profession} onChange={setP(pk, 'profession')} /></div>
          <div>
            <Label>Relation</Label>
            <select className={inputCls} value={p.relationship} onChange={setP(pk, 'relationship')}>
              <option value="pere">Père</option><option value="mere">Mère</option><option value="tuteur">Tuteur</option>
            </select>
          </div>
          <div><Label>Situation familiale</Label><input className={inputCls} value={p.maritalStatus} onChange={setP(pk, 'maritalStatus')} placeholder="Marié(e), …" /></div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto" onClick={close}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl my-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white rounded-t-xl z-10">
          <div className="flex items-center gap-2">
            {isEdit ? <Pencil className="w-5 h-5 text-blue-600" /> : <UserPlus className="w-5 h-5 text-blue-600" />}
            <h3 className="font-semibold">
              {isEdit
                ? `Fiche d'inscription — ${`${student.last_name || ''} ${student.first_name || ''}`.trim() || 'Modifier'}`
                : "Fiche d'inscription — Nouvel élève"}
              {academicYear ? ` · ${academicYear}` : ''}
            </h3>
          </div>
          <button onClick={close} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
        </div>

        {created ? (
          /* ── Écran de confirmation : identifiants + fiche d'inscription ── */
          <div className="p-5 space-y-4">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm">
              <Check className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                <b>{created.first_name} {created.last_name}</b>
                {isEdit ? ' : fiche mise à jour.' : ' a été inscrit(e). Communiquez ces identifiants :'}
              </span>
            </div>
            {!isEdit && (
              <div className="p-3 rounded-lg border bg-gray-50 text-sm space-y-1.5">
                {[['Email', created.email], ['Mot de passe', created.password]].map(([lbl, v]) => (
                  <div key={lbl} className="flex items-center justify-between gap-2">
                    <span><span className="text-gray-500">{lbl} :</span> <span className="font-mono">{v}</span></span>
                    <button type="button" onClick={() => navigator.clipboard.writeText(v || '')} className="p-1 hover:bg-gray-200 rounded"><Copy className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => printInscriptionFiche({ student: created, school, classes, apiBase, academicYear })}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <FileText className="w-4 h-4" /> Télécharger la fiche d'inscription
            </button>
            <div className="flex gap-2">
              {!isEdit && (
                <button onClick={resetAll} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50">
                  <UserPlus className="w-4 h-4" /> Inscrire un autre élève
                </button>
              )}
              <button onClick={close} className="flex-1 px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">Fermer</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-4 space-y-5 max-h-[78vh] overflow-y-auto">
            <div className="sticky top-0 z-20 -mx-4 px-4 py-2 -mt-4 mb-1 flex flex-wrap gap-2 border-b border-gray-200 bg-white/95 backdrop-blur-sm">
              <button type="submit" disabled={submitting} className="flex-1 min-w-[140px] px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {submitting ? 'Enregistrement…' : isEdit ? 'Enregistrer les modifications' : 'Valider'}
              </button>
              <button type="button" disabled={submitting} onClick={(e) => handleSubmit(e, { thenPrint: true })}
                className="flex-1 min-w-[180px] px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center justify-center gap-2">
                <FileText className="w-4 h-4" /> Valider + télécharger la fiche
              </button>
              <button type="button" disabled={submitting} onClick={close} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">
                Annuler
              </button>
            </div>
            {/* ── Informations élève ── */}
            <section className="space-y-3">
              <h4 className="text-sm font-bold text-blue-700">👦 Informations élève</h4>
              <div className="flex gap-4 items-start">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-28 h-28 rounded-full border-2 border-blue-100 overflow-hidden bg-gray-100 flex items-center justify-center">
                    {photoPreview ? <img src={photoPreview} alt="aperçu" className="w-full h-full object-cover" /> : <Camera className="w-8 h-8 text-gray-400" />}
                  </div>
                  <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoSelect} className="hidden" />
                  <button type="button" onClick={() => photoInputRef.current?.click()} className="text-xs px-3 py-1.5 bg-teal-500 text-white rounded-lg hover:bg-teal-600">Sélectionner</button>
                </div>
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div><Label>Nom de famille *</Label><input required className={inputCls} value={formData.lastName} onChange={setF('lastName')} /></div>
                  <div><Label>Prénom *</Label><input required className={inputCls} value={formData.firstName} onChange={setF('firstName')} /></div>
                  <div><Label>الاسم العائلي (Nom ar)</Label><input dir="rtl" className={inputCls} value={formData.lastNameAr} onChange={setF('lastNameAr')} /></div>
                  <div><Label>الاسم الشخصي (Prénom ar)</Label><input dir="rtl" className={inputCls} value={formData.firstNameAr} onChange={setF('firstNameAr')} /></div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <Label>Sexe</Label>
                  <select className={inputCls} value={formData.gender} onChange={setF('gender')}>
                    <option value="M">Garçon</option>
                    <option value="F">Fille</option>
                  </select>
                </div>
                <div><Label>Date de naissance</Label><input type="date" className={inputCls} value={formData.dateOfBirth} onChange={setF('dateOfBirth')} /></div>
                <div><Label>Lieu de naissance</Label><input className={inputCls} value={formData.birthPlace} onChange={setF('birthPlace')} /></div>
                <div><Label>Téléphone</Label><input className={inputCls} value={formData.phone} onChange={setF('phone')} /></div>
                <div><Label>CIN</Label><input className={inputCls} value={formData.cin} onChange={setF('cin')} /></div>
                <div><Label>Code Massar</Label><input className={inputCls} value={formData.massarCode} onChange={setF('massarCode')} /></div>
                <div><Label>N° matricule</Label><input className={inputCls} value={formData.registrationNumber} onChange={setF('registrationNumber')} placeholder="2025_000091" /></div>
                <div><Label>Date d'entrée</Label><input type="date" className={inputCls} value={formData.entryDate} onChange={setF('entryDate')} /></div>
                <div>
                  <Label>Niveau</Label>
                  {levels.length ? (
                    <select className={inputCls} value={formData.level} onChange={setF('level')}>
                      <option value="">Sélectionner un niveau</option>
                      {/* niveau actuel hors référentiel (fiche existante) → gardé sélectionnable */}
                      {formData.level && !levels.includes(formData.level) && (
                        <option value={formData.level}>{formData.level}</option>
                      )}
                      {levels.map((lv) => <option key={lv} value={lv}>{lv}</option>)}
                    </select>
                  ) : (
                    <input className={inputCls} value={formData.level} onChange={setF('level')} placeholder="1APIC" />
                  )}
                </div>
                <div>
                  <Label>Classe</Label>
                  <select className={inputCls} value={formData.classId} onChange={setF('classId')}>
                    <option value="">Sélectionner une classe (optionnel)</option>
                    {classes.map((cls) => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Dossier</Label>
                  <select className={inputCls} value={formData.dossierStatus} onChange={setF('dossierStatus')}>
                    <option value="complet">Complet</option>
                    <option value="incomplet">Incomplet</option>
                  </select>
                </div>
              </div>
            </section>

            {/* ── Informations parents (saisie inline P1/P2) ── */}
            <section className="space-y-3">
              <h4 className="text-sm font-bold text-blue-700">👪 Informations parents</h4>
              {parentForm('parent1', 'Parent 1')}
              {parentForm('parent2', 'Parent 2')}
              <p className="text-xs text-gray-500">
                Un parent n'est enregistré que s'il a un <b>nom + un téléphone</b>.
                {isEdit && <> Les parents sont rattachés par téléphone : changer le numéro relie l'élève à un autre parent (le lien existant est conservé).</>}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div><Label>Téléphone domicile</Label><input className={inputCls} value={formData.homePhone} onChange={setF('homePhone')} /></div>
                <div><Label>Adresse</Label><input className={inputCls} value={formData.homeAddress} onChange={setF('homeAddress')} /></div>
                <div><Label>Quartier (الحي)</Label><input className={inputCls} value={formData.quartier} onChange={setF('quartier')} /></div>
              </div>

              <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-blue-700">
                  <MapPin className="w-4 h-4" /> Localisation du domicile (transport)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div><Label>Latitude</Label><input className={inputCls} value={formData.homeLat} onChange={setF('homeLat')} placeholder="33.5731" /></div>
                  <div><Label>Longitude</Label><input className={inputCls} value={formData.homeLng} onChange={setF('homeLng')} placeholder="-7.5898" /></div>
                  <div className="flex items-end">
                    {formData.homeLat && formData.homeLng ? (
                      <a href={`https://www.google.com/maps?q=${formData.homeLat},${formData.homeLng}`} target="_blank" rel="noreferrer"
                        className="text-xs px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5" /> Voir sur la carte
                      </a>
                    ) : (
                      <span className="text-xs text-gray-400">Aucune position — le parent peut l'envoyer via WhatsApp.</span>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* ── Scolarité antérieure ── */}
            <section className="space-y-2">
              <h4 className="text-sm font-bold text-blue-700">🏫 Scolarité antérieure</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div><Label>Établissement fréquenté l'an dernier</Label><input className={inputCls} value={formData.previousSchool} onChange={setF('previousSchool')} /></div>
                <div><Label>Classe</Label><input className={inputCls} value={formData.previousClass} onChange={setF('previousClass')} /></div>
              </div>
            </section>

            {/* ── Informations supplémentaires ── */}
            <section className="space-y-2">
              <h4 className="text-sm font-bold text-blue-700">ℹ️ Informations supplémentaires</h4>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                {[
                  ['isStaffChild', 'Enfant du personnel'],
                  ['isPartnerGroup', 'Groupe partenaire'],
                  ['isExpat', 'Expatrié'],
                  ['hadAccompaniment', 'Déjà accompagné'],
                  ['hasTransport', 'Transport scolaire'],
                ].map(([key, lbl]) => (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={!!formData[key]} onChange={(e) => setFormData((f) => ({ ...f, [key]: e.target.checked }))} />
                    {lbl}
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                <div><Label>Nationalité</Label><input className={inputCls} value={formData.nationality} onChange={setF('nationality')} /></div>
                <div><Label>Pays</Label><input className={inputCls} value={formData.country} onChange={setF('country')} placeholder="Morocco" /></div>
                <div><Label>Date de réinscription</Label><input type="date" className={inputCls} value={formData.reinscriptionDate} onChange={setF('reinscriptionDate')} /></div>
                <div><Label>Établissement d'origine</Label><input className={inputCls} value={formData.originSchool} onChange={setF('originSchool')} /></div>
              </div>
            </section>

            {/* ── Documents du dossier ── */}
            <section className="space-y-2">
              <h4 className="text-sm font-bold text-blue-700">📄 Documents du dossier</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
                {DOC_KEYS.map(([key, lbl]) => (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={!!formData.inscriptionDocuments?.[key]}
                      onChange={(e) => setFormData((f) => ({ ...f, inscriptionDocuments: { ...f.inscriptionDocuments, [key]: e.target.checked } }))} />
                    {lbl}
                  </label>
                ))}
              </div>
              <div><Label>Signature électronique</Label><input className={inputCls} value={formData.inscriptionSignature} onChange={setF('inscriptionSignature')} placeholder="Nom du signataire" /></div>
            </section>

            {/* ── Médical & autorisations ── */}
            <section className="space-y-2">
              <h4 className="text-sm font-bold text-blue-700">🩺 Médical & autorisations</h4>
              <div className="flex flex-wrap items-center gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={formData.hasHealthIssue} onChange={(e) => setFormData((f) => ({ ...f, hasHealthIssue: e.target.checked }))} />
                  Problème de santé
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={formData.photoAuthorized} onChange={(e) => setFormData((f) => ({ ...f, photoAuthorized: e.target.checked }))} />
                  Autorisation d'utiliser la photo
                </label>
              </div>
              {formData.hasHealthIssue && (
                <div><Label>Précisions médicales</Label><input className={inputCls} value={formData.healthNotes} onChange={setF('healthNotes')} /></div>
              )}
            </section>

            {/* ── Identifiants (auto-générés si vides) — création uniquement ── */}
            {!isEdit && (
              <section className="space-y-2">
                <h4 className="text-sm font-bold text-blue-700">🔑 Identifiants d'accès (auto-générés si vides)</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div><Label>Email</Label><input type="email" className={inputCls} value={formData.email} onChange={setF('email')} placeholder="auto : codemassar@ecole.ma ou nom.prenom@ecole.ma" /></div>
                  <div><Label>Mot de passe</Label><input className={inputCls} value={formData.password} onChange={setF('password')} placeholder="auto (Prénom+année)" /></div>
                </div>
              </section>
            )}

            {error && <p className="text-sm font-medium text-red-600">{error}</p>}

          </form>
        )}
      </div>
    </div>
  );
}
