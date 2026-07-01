// Fiche d'inscription imprimable (recto + engagement) — extraite telle quelle
// de la fiche élève admin pour être réutilisée à l'identique côté finance.
// Ouvre une fenêtre d'impression → « Enregistrer en PDF ».

const DOC_KEYS = [
  ['livret_famille', 'Livret de famille'],
  ['carnet_vaccination', 'Carnet de vaccination'],
  ['cin_pere', 'CIN du père'],
  ['cin_mere', 'CIN de la mère'],
  ['photos_4', '4 Photos'],
  ['cert_scolarite', 'Certificat de scolarité'],
  ['dossier_medical', 'Dossier médical'],
  ['bulletin', 'Bulletin de notes'],
];

const currentAcademicYear = () => {
  const d = new Date();
  const y = d.getFullYear();
  return d.getMonth() >= 8 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
};

// { student, school, classes, apiBase, academicYear }
export function printInscriptionFiche({ student, school = {}, classes = [], apiBase = '', academicYear } = {}) {
  const w = window.open('', '_blank');
  if (!w) { alert('Veuillez autoriser les pop-ups pour télécharger la fiche.'); return; }
  const yearLabel = academicYear || currentAcademicYear();
  const resolveAsset = (u) => !u ? null : (u.startsWith('http') ? u : `${apiBase}${u.startsWith('/') ? '' : '/'}${u}`);
  const logoSrc = resolveAsset(school.logo_url);
  const photoSrc = resolveAsset(student.avatar_url);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const val = (v) => (v === null || v === undefined || v === '') ? '—' : esc(v);
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';
  const genderLabel = student.gender === 'M' ? 'Garçon' : student.gender === 'F' ? 'Fille' : '—';
  const classLabel = classes.find((c) => c.id === student.class_id)?.name || '';
  const level = student.level || classes.find((c) => c.id === student.class_id)?.level || '';
  const parents = student.parents || [];
  const yesNo = (b) => `<span class="opt ${b === true ? 'on' : ''}">Oui</span> <span class="opt ${b === false ? 'on' : ''}">Non</span>`;
  const checkbox = (on) => `<span class="cb">${on ? '☑' : '☐'}</span>`;

  const parentBlock = (p) => `
    <div class="party">
      <div class="row"><div class="lbl">Nom : <b>${val(p?.last_name)}</b></div><div class="lbl ar" dir="rtl">الاسم العائلي</div></div>
      <div class="row"><div class="lbl">Prénom : <b>${val(p?.first_name)}</b></div><div class="lbl ar" dir="rtl">الاسم الشخصي</div></div>
      <div class="grid2">
        <div>Relation : ${val(p?.relationship)}</div>
        <div>Situation familiale : ${val(p?.marital_status)}</div>
        <div>CIN : ${val(p?.cin)}</div>
        <div>Profession : ${val(p?.profession)}</div>
        <div>Téléphone : ${val(p?.phone)}</div>
        <div>Email : ${val(p?.email)}</div>
      </div>
    </div>`;

  const html = `
  <html lang="fr"><head><meta charset="utf-8"><title>Fiche d'inscription ${esc(student.first_name)} ${esc(student.last_name)}</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:Arial,'Noto Sans Arabic',sans-serif;color:#1f2937;margin:0;padding:24px 34px}
    .header{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #1e40af;padding-bottom:12px;margin-bottom:14px}
    .header .logo{width:74px;height:74px;object-fit:contain}
    .header .title{text-align:center;flex:1}
    .header .title h1{margin:0;font-size:1.15em;color:#1e40af}
    .header .title h2{margin:2px 0 0;font-size:1.4em;color:#111827}
    .header .photo{width:84px;height:104px;object-fit:cover;border:1px solid #cbd5e1;border-radius:4px;background:#f1f5f9}
    .sec{margin:12px 0;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden}
    .sec > .h{background:#eff6ff;color:#1e40af;font-weight:bold;padding:6px 10px;font-size:.9em;border-bottom:1px solid #e5e7eb}
    .sec > .b{padding:8px 10px;font-size:.86em}
    .grid2{display:grid;grid-template-columns:1fr 1fr;gap:4px 18px}
    .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px 18px}
    .row{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:2px 0}
    .ar{color:#374151;font-size:.95em}
    .party{padding:6px 0;border-bottom:1px dashed #e5e7eb}
    .party:last-child{border-bottom:none}
    .lbl b{font-weight:700}
    .opt{display:inline-block;border:1px solid #9ca3af;border-radius:10px;padding:1px 10px;margin-left:4px;font-size:.9em}
    .opt.on{background:#1e40af;color:#fff;border-color:#1e40af;font-weight:bold}
    .cb{font-size:1.1em;margin-right:4px}
    .foot{margin-top:16px;border-top:1px solid #d1d5db;padding-top:6px;font-size:.72em;color:#6b7280;display:flex;justify-content:space-between}
    .page2{page-break-before:always;padding-top:10px}
    .page2 h2{color:#1e40af;text-align:center;letter-spacing:1px}
    .engage p{font-size:.9em;line-height:1.5}
    .sign{margin-top:50px;text-align:right;font-size:.9em}
    .dots{border-bottom:1px dotted #555;display:inline-block;min-width:280px}
    @media print{body{padding:14px 22px}}
  </style></head><body>

    <div class="header">
      ${logoSrc ? `<img src="${logoSrc}" class="logo" alt="logo"/>` : '<div style="width:74px"></div>'}
      <div class="title">
        <h1>${val(school.name) === '—' ? 'Établissement' : esc(school.name)}</h1>
        <h2>Fiche d'inscription</h2>
        <div style="color:#6b7280">${esc(yearLabel)}</div>
      </div>
      ${photoSrc ? `<img src="${photoSrc}" class="photo" alt="photo"/>` : '<div class="photo"></div>'}
    </div>

    <div class="sec">
      <div class="h">1 — Cadre réservé à l'administration</div>
      <div class="b">
        <div class="grid3">
          <div>N° matricule : <b>${val(student.registration_number)}</b></div>
          <div>Date d'entrée : ${fmtDate(student.entry_date)}</div>
          <div>Niveau : <b>${val(level)}</b>${classLabel ? ` (${esc(classLabel)})` : ''}</div>
        </div>
        <div style="margin-top:6px">${checkbox(student.dossier_status === 'complet')} Dossier complet
          &nbsp;&nbsp; ${checkbox(student.dossier_status === 'incomplet')} Dossier incomplet</div>
        <hr style="border:none;border-top:1px solid #eee;margin:8px 0"/>
        <div class="row"><div>Nom de l'enfant : <b>${val(student.last_name)}</b></div><div class="ar" dir="rtl">الاسم العائلي : <b>${val(student.last_name_ar)}</b></div></div>
        <div class="row"><div>Prénom de l'enfant : <b>${val(student.first_name)}</b></div><div class="ar" dir="rtl">الاسم الشخصي : <b>${val(student.first_name_ar)}</b></div></div>
        <div class="grid3" style="margin-top:4px">
          <div>Né(e) le : ${fmtDate(student.date_of_birth)}</div>
          <div>à : ${val(student.birth_place)}</div>
          <div>Sexe : ${genderLabel}</div>
        </div>
        ${student.massar_code ? `<div style="margin-top:4px">Code Massar : <b>${val(student.massar_code)}</b></div>` : ''}
      </div>
    </div>

    <div class="sec">
      <div class="h">2 — Renseignements familiaux</div>
      <div class="b">
        ${parents.length ? parents.slice(0, 2).map(parentBlock).join('') : '<div style="color:#9ca3af">Aucun parent renseigné</div>'}
        <div class="grid3" style="margin-top:6px">
          <div>Tél. domicile : ${val(student.home_phone)}</div>
          <div>Quartier : ${val(student.quartier)}</div>
          <div>Adresse : ${val(student.home_address)}</div>
        </div>
      </div>
    </div>

    <div class="sec">
      <div class="h">3 — Scolarité antérieure</div>
      <div class="b grid2">
        <div>Établissement fréquenté l'année précédente : ${val(student.previous_school)}</div>
        <div>Classe : ${val(student.previous_class)}</div>
      </div>
    </div>

    <div class="sec">
      <div class="h">4 — Renseignements médicaux</div>
      <div class="b">
        <div>Votre enfant a-t-il un problème de santé ? ${yesNo(student.has_health_issue === true ? true : student.has_health_issue === false ? false : null)}</div>
        ${student.health_notes ? `<div style="margin-top:4px">Précisions : ${val(student.health_notes)}</div>` : ''}
      </div>
    </div>

    <div class="sec">
      <div class="h">5 — Autorisations école</div>
      <div class="b">
        <div>L'école est autorisée à utiliser la photo de l'enfant ? ${yesNo(student.photo_authorized === true ? true : student.photo_authorized === false ? false : null)}</div>
      </div>
    </div>

    <div class="sec">
      <div class="h">6 — Documents du dossier</div>
      <div class="b grid2">
        ${DOC_KEYS.map(([k, lbl]) => `<div>${checkbox(!!(student.inscription_documents || {})[k])} ${lbl}</div>`).join('')}
      </div>
    </div>

    <div class="sec">
      <div class="h">7 — Informations supplémentaires</div>
      <div class="b">
        <div class="grid3">
          <div>Nationalité : ${val(student.nationality)}</div>
          <div>Pays : ${val(student.country)}</div>
          <div>Date de réinscription : ${fmtDate(student.reinscription_date)}</div>
          <div>Établissement d'origine : ${val(student.origin_school)}</div>
          <div>Transport scolaire : ${student.has_transport ? 'Oui' : 'Non'}</div>
          <div>Enfant du personnel : ${student.is_staff_child ? 'Oui' : 'Non'}</div>
        </div>
        ${student.inscription_signature ? `<div style="margin-top:6px">Signature électronique : <b>${val(student.inscription_signature)}</b></div>` : ''}
      </div>
    </div>

    <div class="foot"><span>${val(school.name) === '—' ? '' : esc(school.name)}</span><span>1/2 · ${new Date().toLocaleString('fr-FR')}</span></div>

    <div class="page2 engage">
      <h2>ENGAGEMENT</h2>
      <p>Je soussigné(e), M. ou Mme <span class="dots"></span></p>
      <p>Parent(s) de l'élève <b>${esc(student.last_name)} ${esc(student.first_name)}</b> en classe de <b>${val(level)}</b>.</p>
      <p>— Certifie avoir pris connaissance du règlement de l'Établissement et l'accepter dans sa totalité.<br/>
         — L'établissement décline sa responsabilité avant et après les horaires d'ouverture et de fermeture des portes.<br/>
         — Les frais réglés à l'inscription ne sont remboursés en aucun cas.</p>
      <h3 style="color:#1e40af">Autorisation parentale</h3>
      <p>Enfant inscrit : Crèche – Maternelle – Primaire<br/>
         Entre 12h00 et 13h15 mon enfant restera à l'école : ${yesNo(null)}</p>
      <p>Enfant inscrit : Collège – Lycée : ${yesNo(null)}</p>
      <div class="sign">
        Signature du parent précédée de la mention « Lu et Approuvé »<br/><br/>
        <span class="dots"></span>
      </div>
      <div class="foot"><span>${val(school.name) === '—' ? '' : esc(school.name)}</span><span>2/2 · ${new Date().toLocaleString('fr-FR')}</span></div>
    </div>

  </body></html>`;
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 600);
}
