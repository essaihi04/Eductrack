import { useState, useEffect, useRef } from 'react';
import { Wallet, Users, Plus, Trash2, Check, ArrowLeft, Save, Settings, Banknote, Coins, History, Pencil, CreditCard, Clock, Upload, FileText, ExternalLink, Camera, X, Printer } from 'lucide-react';
import { financeApi, formatMAD, formatDate, fileUrl } from '../../lib/financeApi';
import { PageHeader, Drawer, Button, Field } from '../../components/finance/ui';
import { useYear } from '../../contexts/YearContext';
import { useAuth } from '../../contexts/AuthContext';
import { toDashYear } from '../../lib/schoolYear';
import { printPayrollReceipt } from '../../lib/printDocs';

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const ORDER = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8];
const CATEGORIES = [['enseignant', 'Enseignant'], ['assistant', 'Assistant(e)'], ['administratif', 'Administratif'], ['chauffeur', 'Chauffeur'], ['agent_service', 'Agent de service'], ['autre', 'Autre']];
const catLabel = (c) => (CATEGORIES.find(([k]) => k === c)?.[1]) || 'Autre';
function currentAcademicYear() {
  const d = new Date(); const y = d.getFullYear();
  return d.getMonth() + 1 >= 9 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}
function yearOptions() {
  const cur = currentAcademicYear(); const y1 = parseInt(cur.split('-')[0], 10);
  return [`${y1 - 1}-${y1}`, cur, `${y1 + 1}-${y1 + 2}`];
}
const calYearFor = (acad, month) => { const [a, b] = acad.split('-').map(Number); return month >= 9 ? a : b; };

export default function PayrollPage() {
  const [tab, setTab] = useState('payroll');
  const [showConfig, setShowConfig] = useState(false);
  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <PageHeader icon={Wallet} title="Paie & RH" color="purple"
          subtitle="Employés, bulletins calculés (heures × taux, CNSS+AMO, IR). Salaire payé en espèce → Dépenses ; par banque → via le relevé bancaire." />
        <button onClick={() => setShowConfig(true)} className="flex items-center gap-1 px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 shrink-0"><Settings className="w-4 h-4" /> Réglages</button>
      </div>
      <div className="flex gap-2 border-b border-gray-200">
        {[['payroll', 'Bulletins de paie'], ['employees', 'Employés'], ['payments', 'Suivi des paiements']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 ${tab === k ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500'}`}>{l}</button>
        ))}
      </div>
      {tab === 'employees' ? <EmployeesTab /> : tab === 'payments' ? <PaymentsTab /> : <PayrollTab />}
      <ConfigDrawer open={showConfig} onClose={() => setShowConfig(false)} />
    </div>
  );
}

// ── Réglages CNSS / IR ───────────────────────────────────────────────────────
function ConfigDrawer({ open, onClose }) {
  const [cfg, setCfg] = useState(null);
  useEffect(() => { if (open) financeApi.getPayrollConfig().then(d => setCfg(d.config)).catch(() => {}); }, [open]);
  const save = async () => {
    try { await financeApi.updatePayrollConfig(cfg); onClose(); }
    catch (e) { alert('Erreur: ' + e.message); }
  };
  return (
    <Drawer open={open} onClose={onClose} title="Réglages de la paie"
      footer={<><Button variant="secondary" onClick={onClose}>Fermer</Button><Button color="purple" onClick={save} disabled={!cfg}>Enregistrer</Button></>}>
      {!cfg ? <p className="text-sm text-gray-400">Chargement…</p> : (
        <div className="space-y-4">
          <p className="text-xs text-gray-500">Taux appliqués automatiquement au calcul des bulletins (modifiables). CNSS+AMO et IR sont calculés sur le salaire brut.</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Taux CNSS (%)"><input type="number" step="0.01" value={cfg.cnss_rate} onChange={e => setCfg({ ...cfg, cnss_rate: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" /></Field>
            <Field label="Taux AMO (%)"><input type="number" step="0.01" value={cfg.amo_rate} onChange={e => setCfg({ ...cfg, amo_rate: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" /></Field>
            <Field label="Plafond CNSS (MAD)"><input type="number" step="1" value={cfg.cnss_ceiling} onChange={e => setCfg({ ...cfg, cnss_ceiling: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" /></Field>
            <Field label="Heures/mois par défaut"><input type="number" step="1" value={cfg.default_monthly_hours} onChange={e => setCfg({ ...cfg, default_monthly_hours: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" /></Field>
          </div>
          <p className="text-xs text-gray-400">Le barème IR mensuel marocain par défaut est appliqué. (Configuration avancée du barème à venir.)</p>
        </div>
      )}
    </Drawer>
  );
}

// ── Employés ───────────────────────────────────────────────────────────────
function EmployeesTab() {
  const [list, setList] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [edit, setEdit] = useState(null);
  const [payEmp, setPayEmp] = useState(null);
  const [histEmp, setHistEmp] = useState(null);
  const blank = { full_name: '', role_label: '', category: 'enseignant', employment_type: 'permanent', pay_mode: 'fixed', base_salary: 0, hourly_rate: 0, default_monthly_hours: 0, payment_method: 'bank', cnss_subject: true, cnss_number: '', is_active: true, profile_id: '', hire_date: '', end_date: '', paid_months: [],
    cin: '', birth_date: '', birth_place: '', address: '', phone: '', email: '', iban: '', marital_status: '', children_count: 0, weekly_target_hours: 0, photo_url: null };
  const [form, setForm] = useState(blank);

  useEffect(() => { load(); financeApi.listPayrollTeachers().then(d => setTeachers(d.teachers || [])).catch(() => {}); }, []);
  const load = async () => { try { const d = await financeApi.listEmployees(); setList(d.employees || []); } catch (e) { console.error(e); } };

  const openNew = () => { setEdit(null); setForm(blank); setShowForm(true); };
  const openEdit = (e) => { setEdit(e); setForm({ ...blank, ...e }); setShowForm(true); };
  const save = async () => {
    try {
      const payload = { ...form, profile_id: form.profile_id || null };
      if (edit) await financeApi.updateEmployee(edit.id, payload);
      else await financeApi.createEmployee(payload);
      setShowForm(false); load();
    } catch (e) { alert('Erreur: ' + e.message); }
  };
  const remove = async (id) => { if (!confirm('Supprimer cet employé ?')) return; try { await financeApi.deleteEmployee(id); load(); } catch (e) { alert(e.message); } };
  const hourly = form.pay_mode === 'hourly';

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500 flex items-center gap-1"><Users className="w-4 h-4" /> {list.length} salarié(s)</p>
        <Button color="purple" icon={Plus} onClick={openNew}>Nouvel employé</Button>
      </div>
      {list.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-10 text-center text-gray-400">Aucun salarié. Ajoutez un employé ou créez-le depuis la fiche prof.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {list.map(e => (
            <EmployeeCard key={e.id} e={e}
              onEdit={() => openEdit(e)} onPay={() => setPayEmp(e)} onHistory={() => setHistEmp(e)} onDelete={() => remove(e.id)} />
          ))}
        </div>
      )}
      {payEmp && <EmployeePayDrawer employee={payEmp} onClose={() => setPayEmp(null)} onDone={load} />}
      {histEmp && <EmployeeHistoryDrawer employee={histEmp} onClose={() => setHistEmp(null)} />}

      <Drawer open={showForm} onClose={() => setShowForm(false)} title={`${edit ? 'Dossier' : 'Nouvel'} employé`} width="max-w-2xl"
        footer={<><Button variant="secondary" onClick={() => setShowForm(false)}>Fermer</Button><Button color="purple" onClick={save} disabled={!form.full_name}>Enregistrer</Button></>}>
        <div className="space-y-5">
          {/* ── Identité ── */}
          <div className="flex gap-4 items-start">
            {edit && <EmployeePhoto employee={edit} photoUrl={form.photo_url} onChange={(url) => { setForm({ ...form, photo_url: url }); load(); }} />}
            <div className="flex-1 space-y-3">
              <Field label="Nom complet" required>
                <input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Catégorie">
                  <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                    {CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </Field>
                <Field label="Fonction (libre)">
                  <input value={form.role_label || ''} onChange={e => setForm({ ...form, role_label: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="Prof. de maths…" />
                </Field>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="N° CIN"><input value={form.cin || ''} onChange={e => setForm({ ...form, cin: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" /></Field>
            <Field label="Date de naissance"><input type="date" value={form.birth_date || ''} onChange={e => setForm({ ...form, birth_date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" /></Field>
            <Field label="Lieu de naissance"><input value={form.birth_place || ''} onChange={e => setForm({ ...form, birth_place: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" /></Field>
            <Field label="Téléphone"><input value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" /></Field>
            <Field label="Email"><input value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" /></Field>
            <Field label="Adresse"><input value={form.address || ''} onChange={e => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" /></Field>
          </div>

          {/* ── Contrat & paie ── */}
          <div className="border-t border-gray-200 pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Contrat & paie</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type de contrat">
                <select value={form.employment_type} onChange={e => setForm({ ...form, employment_type: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                  <option value="permanent">Permanent</option><option value="vacataire">Vacataire</option>
                </select>
              </Field>
              <Field label="Mode de rémunération">
                <select value={form.pay_mode} onChange={e => setForm({ ...form, pay_mode: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                  <option value="fixed">Salaire fixe</option><option value="hourly">À l'heure</option>
                </select>
              </Field>
              {!hourly && (
                <Field label="Salaire mensuel brut">
                  <input type="number" step="0.01" value={form.base_salary} onChange={e => setForm({ ...form, base_salary: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                </Field>
              )}
              {hourly && <>
                <Field label="Taux horaire">
                  <input type="number" step="0.01" value={form.hourly_rate} onChange={e => setForm({ ...form, hourly_rate: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                </Field>
                <Field label="Heures / mois (par défaut)">
                  <input type="number" step="1" value={form.default_monthly_hours} onChange={e => setForm({ ...form, default_monthly_hours: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                </Field>
              </>}
              <Field label="Mode de paiement habituel">
                <select value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                  <option value="bank">Virement bancaire</option><option value="cash">Espèce</option>
                </select>
              </Field>
              <Field label="RIB / IBAN"><input value={form.iban || ''} onChange={e => setForm({ ...form, iban: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" /></Field>
              <Field label="Situation familiale">
                <select value={form.marital_status || ''} onChange={e => setForm({ ...form, marital_status: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                  <option value="">—</option><option value="celibataire">Célibataire</option><option value="marie">Marié(e)</option><option value="divorce">Divorcé(e)</option><option value="veuf">Veuf(ve)</option>
                </select>
              </Field>
              <Field label="Nb d'enfants"><input type="number" step="1" value={form.children_count} onChange={e => setForm({ ...form, children_count: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" /></Field>
              <Field label="N° CNSS"><input value={form.cnss_number || ''} onChange={e => setForm({ ...form, cnss_number: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" /></Field>
              <Field label="Date d'entrée"><input type="date" value={form.hire_date || ''} onChange={e => setForm({ ...form, hire_date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" /></Field>
              <Field label="Date de sortie (optionnel)"><input type="date" value={form.end_date || ''} onChange={e => setForm({ ...form, end_date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" /></Field>
            </div>
            <div className="mt-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">Mois payés</label>
              <div className="flex flex-wrap gap-1.5">
                {ORDER.map(m => {
                  const pm = form.paid_months || [];
                  const on = pm.includes(m);
                  return <button type="button" key={m} onClick={() => setForm({ ...form, paid_months: on ? pm.filter(x => x !== m) : [...pm, m] })}
                    className={`px-2 py-1 text-xs rounded border ${on ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>{MONTHS[m - 1].slice(0, 4)}</button>;
                })}
              </div>
              <p className="text-xs text-gray-400 mt-1">Vide = payé tous les mois. Cochez pour limiter (ex. Sept→Juin).</p>
            </div>
            {hourly && (
              <div className="mt-3">
                <label className="block text-xs font-medium text-gray-700 mb-1">Compte prof lié (heures réalisées)</label>
                <select value={form.profile_id || ''} onChange={e => setForm({ ...form, profile_id: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                  <option value="">— Aucun (saisie manuelle des heures) —</option>
                  {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <p className="text-xs text-gray-400 mt-1">Lié à un prof, les heures réalisées (séances du suivi) remplissent le bulletin.</p>
              </div>
            )}
            <div className="flex flex-wrap gap-4 mt-3">
              <label className="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={form.cnss_subject} onChange={e => setForm({ ...form, cnss_subject: e.target.checked })} /> Assujetti CNSS/AMO</label>
              <label className="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} /> Actif</label>
            </div>
          </div>

          {/* ── Enseignement (prof lié) ── */}
          {edit && form.profile_id && <TeachingSection employeeId={edit.id} form={form} setForm={setForm} />}

          {/* ── Documents ── */}
          {edit
            ? <DocumentsSection employeeId={edit.id} />
            : <p className="text-xs text-gray-400 border-t border-gray-200 pt-4">📎 Enregistrez l'employé pour ajouter sa photo et ses documents (diplômes, CIN, contrat…).</p>}
        </div>
      </Drawer>
    </div>
  );
}

// Photo de l'employé (upload / suppression)
function EmployeePhoto({ employee, photoUrl, onChange }) {
  const [busy, setBusy] = useState(false);
  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try { const fd = new FormData(); fd.append('file', file); const r = await financeApi.uploadEmployeePhoto(employee.id, fd); onChange(r.photo_url); }
    catch (e) { alert('Erreur: ' + e.message); } finally { setBusy(false); }
  };
  const remove = async () => { setBusy(true); try { await financeApi.deleteEmployeePhoto(employee.id); onChange(null); } catch (e) { alert(e.message); } finally { setBusy(false); } };
  return (
    <div className="shrink-0 text-center">
      <div className="w-24 h-24 rounded-xl bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center">
        {photoUrl ? <img src={fileUrl(photoUrl)} alt="" className="w-full h-full object-cover" /> : <Camera className="w-7 h-7 text-gray-300" />}
      </div>
      <label className={`mt-1 inline-flex items-center gap-1 text-xs cursor-pointer ${busy ? 'opacity-50' : 'text-purple-600 hover:text-purple-800'}`}>
        <Upload className="w-3 h-3" /> {photoUrl ? 'Changer' : 'Photo'}
        <input type="file" accept="image/*" className="hidden" disabled={busy} onChange={e => upload(e.target.files?.[0])} />
      </label>
      {photoUrl && <button onClick={remove} className="block mx-auto text-xs text-gray-400 hover:text-red-500">Retirer</button>}
    </div>
  );
}

const DOC_TYPES = [['diploma', 'Diplôme'], ['cin', 'CIN'], ['contract', 'Contrat'], ['cv', 'CV'], ['other', 'Autre']];
// Documents du dossier (upload / liste / suppression)
function DocumentsSection({ employeeId }) {
  const [docs, setDocs] = useState([]);
  const [docType, setDocType] = useState('diploma');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef();
  const load = () => financeApi.listEmployeeDocuments(employeeId).then(d => setDocs(d.documents || [])).catch(() => {});
  useEffect(() => { load(); }, [employeeId]); // eslint-disable-line react-hooks/exhaustive-deps
  const add = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return alert('Choisissez un fichier (image ou PDF).');
    setBusy(true);
    try { const fd = new FormData(); fd.append('file', file); fd.append('doc_type', docType); fd.append('label', label); await financeApi.uploadEmployeeDocument(employeeId, fd); setLabel(''); if (fileRef.current) fileRef.current.value = ''; load(); }
    catch (e) { alert('Erreur: ' + e.message); } finally { setBusy(false); }
  };
  const remove = async (id) => { if (!confirm('Supprimer ce document ?')) return; try { await financeApi.deleteEmployeeDocument(employeeId, id); load(); } catch (e) { alert(e.message); } };
  return (
    <div className="border-t border-gray-200 pt-4">
      <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Documents</p>
      <div className="flex flex-wrap items-end gap-2 mb-3">
        <select value={docType} onChange={e => setDocType(e.target.value)} className="px-2 py-2 border border-gray-300 rounded-lg text-sm">
          {DOC_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Libellé (optionnel)" className="px-2 py-2 border border-gray-300 rounded-lg text-sm flex-1 min-w-[120px]" />
        <input ref={fileRef} type="file" accept="image/*,application/pdf" className="text-xs" />
        <button onClick={add} disabled={busy} className="flex items-center gap-1 px-3 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50"><Upload className="w-4 h-4" /> Ajouter</button>
      </div>
      <div className="space-y-1.5">
        {docs.length === 0 && <p className="text-xs text-gray-400">Aucun document.</p>}
        {docs.map(d => (
          <div key={d.id} className="flex items-center gap-2 text-sm bg-gray-50 rounded-lg px-3 py-2">
            <FileText className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="text-xs px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-600 shrink-0">{(DOC_TYPES.find(([k]) => k === d.doc_type) || [, 'Autre'])[1]}</span>
            <span className="text-gray-700 truncate flex-1">{d.label || 'Document'}</span>
            <a href={fileUrl(d.view_url || d.file_url)} target="_blank" rel="noreferrer" className="text-purple-600 hover:text-purple-800 inline-flex items-center gap-1 text-xs"><ExternalLink className="w-3 h-3" /> Voir</a>
            <button onClick={() => remove(d.id)} className="p-1 hover:bg-red-50 rounded"><X className="w-3.5 h-3.5 text-red-500" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

// Enseignement : matières + charge hebdo cible (prof lié)
function TeachingSection({ employeeId, form, setForm }) {
  const [subjects, setSubjects] = useState([]);
  const [mine, setMine] = useState([]);
  const load = () => financeApi.listEmployeeSubjects(employeeId).then(d => setMine(d.subject_ids || [])).catch(() => {});
  useEffect(() => { financeApi.listSubjects().then(d => setSubjects(d.subjects || [])).catch(() => {}); load(); }, [employeeId]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = async (sid) => {
    try { if (mine.includes(sid)) await financeApi.removeEmployeeSubject(employeeId, sid); else await financeApi.addEmployeeSubject(employeeId, sid); load(); }
    catch (e) { alert(e.message); }
  };
  return (
    <div className="border-t border-gray-200 pt-4">
      <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Enseignement</p>
      <Field label="Charge hebdomadaire cible (heures à enseigner / semaine)">
        <input type="number" step="0.5" value={form.weekly_target_hours} onChange={e => setForm({ ...form, weekly_target_hours: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
      </Field>
      <label className="block text-xs font-medium text-gray-700 mb-1 mt-3">Matières enseignées</label>
      <div className="flex flex-wrap gap-1.5">
        {subjects.length === 0 && <p className="text-xs text-gray-400">Aucune matière configurée dans l'école.</p>}
        {subjects.map(s => {
          const on = mine.includes(s.id);
          return <button type="button" key={s.id} onClick={() => toggle(s.id)}
            className={`px-2.5 py-1 text-xs rounded-full border ${on ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>{s.name}</button>;
        })}
      </div>
      <p className="text-xs text-gray-400 mt-2">Les heures réalisées sont calculées depuis le suivi des séances (bulletin de paie).</p>
    </div>
  );
}

// Carte salarié avec actions
function EmployeeCard({ e, onEdit, onPay, onHistory, onDelete }) {
  const initials = (e.full_name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const remun = e.pay_mode === 'hourly' ? `${formatMAD(e.hourly_rate)}/h × ${e.default_monthly_hours || 0}h` : `${formatMAD(e.base_salary)}/mois`;
  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-3 ${e.is_active ? '' : 'opacity-60'}`}>
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-semibold shrink-0 overflow-hidden">
          {e.photo_url ? <img src={fileUrl(e.photo_url)} alt="" className="w-full h-full object-cover" /> : initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-800 truncate">{e.full_name}</p>
          <p className="text-xs text-gray-500 truncate">{catLabel(e.category)}{e.role_label ? ` · ${e.role_label}` : ''}</p>
        </div>
        <span className={`text-[11px] px-2 py-0.5 rounded-full shrink-0 ${e.employment_type === 'permanent' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>{e.employment_type === 'permanent' ? 'Permanent' : 'Vacataire'}</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-700 font-medium">{remun}</span>
        <span className="text-xs inline-flex items-center gap-1 text-gray-500">{e.payment_method === 'cash' ? <><Coins className="w-3 h-3" /> Espèce</> : <><Banknote className="w-3 h-3" /> Banque</>}</span>
      </div>
      <div className="flex items-center gap-1 pt-2 border-t border-gray-100">
        <button onClick={onEdit} className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50"><Pencil className="w-3.5 h-3.5" /> Modifier</button>
        <button onClick={onPay} className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700"><CreditCard className="w-3.5 h-3.5" /> Payer</button>
        <button onClick={onHistory} className="flex items-center justify-center gap-1 px-2 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50" title="Historique de paiement"><Clock className="w-3.5 h-3.5" /></button>
        <button onClick={onDelete} className="flex items-center justify-center px-2 py-1.5 text-xs border border-red-200 text-red-500 rounded-lg hover:bg-red-50" title="Supprimer"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
    </div>
  );
}

// Payer un salarié pour un mois (crée/ouvre le bulletin et paie sa ligne)
function EmployeePayDrawer({ employee, onClose, onDone }) {
  const now = new Date();
  const defaultAcad = now.getMonth() + 1 >= 9 ? `${now.getFullYear()}-${now.getFullYear() + 1}` : `${now.getFullYear() - 1}-${now.getFullYear()}`;
  const [acad, setAcad] = useState(defaultAcad);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [method, setMethod] = useState(employee.payment_method || 'bank');
  const [date, setDate] = useState(now.toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try {
      const y = calYearFor(acad, month);
      const d = await financeApi.createPayrollRun(y, month);
      const line = (d.lines || []).find(l => l.employee_id === employee.id);
      if (!line) { alert('Ce salarié n’apparaît pas dans le bulletin de ce mois (employé inactif ?).'); return; }
      if (line.paid) { alert('Déjà payé pour ce mois.'); onDone?.(); onClose(); return; }
      await financeApi.payPayrollLine(d.run.id, line.id, { method, date });
      alert('Paiement enregistré.'); onDone?.(); onClose();
    } catch (e) { alert('Erreur: ' + e.message); }
    finally { setBusy(false); }
  };

  return (
    <Drawer open onClose={onClose} title={`Payer — ${employee.full_name}`}
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button color="purple" onClick={confirm} disabled={busy}>Confirmer</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Année scolaire">
            <select value={acad} onChange={e => setAcad(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
              {yearOptions().map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </Field>
          <Field label="Mois">
            <select value={month} onChange={e => setMonth(Number(e.target.value))} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
              {ORDER.map(m => <option key={m} value={m}>{MONTHS[m - 1]} {calYearFor(acad, m)}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Mode de paiement">
          <div className="flex gap-2">
            <button onClick={() => setMethod('bank')} className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 border rounded-lg text-sm ${method === 'bank' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-300'}`}><Banknote className="w-4 h-4" /> Banque</button>
            <button onClick={() => setMethod('cash')} className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 border rounded-lg text-sm ${method === 'cash' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-300'}`}><Coins className="w-4 h-4" /> Espèce</button>
          </div>
        </Field>
        <Field label="Date de paiement"><input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" /></Field>
        <p className="text-xs text-gray-500">{method === 'cash' ? 'Espèce → une dépense sera créée dans « Dépenses et charges ».' : 'Banque → la charge entrera via le relevé bancaire.'} Le bulletin du mois est créé automatiquement s’il n’existe pas.</p>
      </div>
    </Drawer>
  );
}

// Historique de paiement d'un salarié
function EmployeeHistoryDrawer({ employee, onClose }) {
  const now = new Date();
  const defaultAcad = now.getMonth() + 1 >= 9 ? `${now.getFullYear()}-${now.getFullYear() + 1}` : `${now.getFullYear() - 1}-${now.getFullYear()}`;
  const [acad, setAcad] = useState(defaultAcad);
  const [rows, setRows] = useState([]);
  useEffect(() => { financeApi.listPayrollPayments(acad).then(d => setRows((d.payments || []).filter(p => p.employee_id === employee.id))).catch(() => setRows([])); }, [acad, employee.id]);
  const totalPaid = rows.filter(r => r.paid).reduce((a, r) => a + Number(r.net_salary || 0), 0);
  const totalDue = rows.reduce((a, r) => a + Number(r.net_salary || 0), 0);
  return (
    <Drawer open onClose={onClose} title={`Historique — ${employee.full_name}`}
      footer={<Button variant="secondary" onClick={onClose}>Fermer</Button>}>
      <div className="space-y-3">
        <Field label="Année scolaire">
          <select value={acad} onChange={e => setAcad(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
            {yearOptions().map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </Field>
        <div className="flex gap-2 text-xs">
          <span className="px-2 py-1 rounded-full bg-green-100 text-green-700">Payé : {formatMAD(totalPaid)}</span>
          <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-700">Reste : {formatMAD(totalDue - totalPaid)}</span>
        </div>
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase"><tr><th className="px-3 py-2 text-left">Mois</th><th className="px-3 py-2 text-right">Net</th><th className="px-3 py-2 text-center">Statut</th><th className="px-3 py-2 text-left">Date</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 && <tr><td colSpan="4" className="px-3 py-6 text-center text-gray-400">Aucun bulletin cette année</td></tr>}
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="px-3 py-2 text-gray-600">{MONTHS[r.month - 1]} {r.year}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{formatMAD(r.net_salary)}</td>
                  <td className="px-3 py-2 text-center"><span className={`text-xs px-2 py-0.5 rounded-full ${r.paid ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{r.paid ? (r.payment_method === 'cash' ? 'Espèce' : 'Banque') : 'Non payé'}</span></td>
                  <td className="px-3 py-2 text-gray-500">{r.paid_date ? formatDate(r.paid_date) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Drawer>
  );
}

// ── Bulletins de paie ────────────────────────────────────────────────────
function PayrollTab() {
  const { year: activeYear } = useYear();
  const { school, profile } = useAuth();
  const [year, setYear] = useState(toDashYear(activeYear) || currentAcademicYear());
  const [runs, setRuns] = useState([]);
  const [newMonth, setNewMonth] = useState(ORDER[0]);
  const [run, setRun] = useState(null);
  const [lines, setLines] = useState([]);
  const [saving, setSaving] = useState(false);
  const [payTarget, setPayTarget] = useState(null); // { line } | { all: true }

  useEffect(() => { loadRuns(); }, [year]);
  const loadRuns = async () => { try { const d = await financeApi.listPayrollRuns(year); setRuns(d.runs || []); } catch (e) { console.error(e); } };

  const openRun = async (id) => { try { const d = await financeApi.getPayrollRun(id); setRun(d.run); setLines(d.lines || []); } catch (e) { alert(e.message); } };
  const createRun = async () => {
    try { const d = await financeApi.createPayrollRun(calYearFor(year, newMonth), newMonth); setRun(d.run); setLines(d.lines || []); loadRuns(); }
    catch (e) { alert('Erreur: ' + e.message); }
  };

  const setLine = (id, field, val) => setLines(prev => prev.map(l => l.id === id ? { ...l, [field]: val } : l));
  const totals = lines.reduce((a, l) => ({ s: a.s + Number(l.salary || 0), c: a.c + Number(l.cnss_amo || 0), i: a.i + Number(l.ir || 0), n: a.n + Number(l.net_salary || 0) }), { s: 0, c: 0, i: 0, n: 0 });
  const nPaid = lines.filter(l => l.paid).length;
  const nUnpaid = lines.length - nPaid;

  const saveLines = async () => {
    setSaving(true);
    try { await financeApi.savePayrollLines(run.id, lines); await openRun(run.id); loadRuns(); }
    catch (e) { alert('Erreur: ' + e.message); }
    finally { setSaving(false); }
  };
  const doPay = async ({ method, date }) => {
    try {
      if (payTarget?.all) await financeApi.payAllPayroll(run.id, { method, date });
      else await financeApi.payPayrollLine(run.id, payTarget.line.id, { method, date });
      setPayTarget(null); await openRun(run.id); loadRuns();
    } catch (e) { alert('Erreur: ' + e.message); }
  };
  const unpay = async (line) => { try { await financeApi.unpayPayrollLine(run.id, line.id); await openRun(run.id); loadRuns(); } catch (e) { alert(e.message); } };
  // Reçu de paiement en double exemplaire (École + Employé), avec signatures.
  const printReceipt = (l) => printPayrollReceipt({
    employeeName: l.employee_name, month: run.month, year: run.year,
    salary: l.salary, cnss_amo: l.cnss_amo, ir: l.ir, net_salary: l.net_salary,
    payment_method: l.payment_method, paid_date: l.paid_date,
  }, { school, financeManagerName: profile?.full_name });
  const recomputeHours = async () => { try { const r = await financeApi.recomputePayrollHours(run.id); await openRun(run.id); loadRuns(); alert(`${r.updated} ligne(s) mise(s) à jour avec les heures réalisées.`); } catch (e) { alert(e.message); } };
  const removeRun = async (id) => { if (!confirm('Supprimer ce bulletin et ses dépenses espèce liées ?')) return; try { await financeApi.deletePayrollRun(id); if (run?.id === id) setRun(null); loadRuns(); } catch (e) { alert(e.message); } };

  if (run) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <button onClick={() => { setRun(null); loadRuns(); }} className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"><ArrowLeft className="w-4 h-4" /> Retour</button>
          <div className="flex items-center gap-2">
            <button onClick={recomputeHours} className="flex items-center gap-1 px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50" title="Importer les heures réalisées depuis le suivi des séances"><History className="w-4 h-4" /> Recalculer les heures</button>
            <button onClick={saveLines} disabled={saving} className="flex items-center gap-1 px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"><Save className="w-4 h-4" /> Enregistrer</button>
            {nUnpaid > 0 && <button onClick={() => setPayTarget({ all: true })} className="flex items-center gap-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"><Check className="w-4 h-4" /> Tout payer ({nUnpaid})</button>}
          </div>
        </div>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg font-semibold text-gray-800">Bulletin — {MONTHS[run.month - 1]} {run.year}</h2>
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-700">{nUnpaid} à payer</span>
            <span className="px-2 py-1 rounded-full bg-green-100 text-green-700">{nPaid} payé(s)</span>
            <span className="text-gray-500">Net total : <strong className="text-gray-800">{formatMAD(totals.n)}</strong></span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
              <tr><th className="px-3 py-2 text-left">Employé</th><th className="px-3 py-2 text-right">Heures</th><th className="px-3 py-2 text-right">Taux</th><th className="px-3 py-2 text-right">Brut</th><th className="px-3 py-2 text-right">CNSS+AMO</th><th className="px-3 py-2 text-right">IR</th><th className="px-3 py-2 text-right">Net à payer</th><th className="px-3 py-2 text-center">Paiement</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lines.length === 0 && <tr><td colSpan="8" className="px-4 py-8 text-center text-gray-400">Aucun employé actif. Ajoutez des employés dans l'onglet « Employés ».</td></tr>}
              {lines.map(l => {
                const isHourly = Number(l.hourly_rate || 0) > 0;
                const editable = !l.paid;
                return (
                  <tr key={l.id} className={l.paid ? 'bg-green-50/40' : ''}>
                    <td className="px-3 py-2 text-gray-800">{l.employee_name}</td>
                    <td className="px-2 py-1 text-right">{isHourly && editable ? <input type="number" step="1" value={l.hours ?? 0} onChange={e => setLine(l.id, 'hours', e.target.value)} className="w-16 px-2 py-1 text-right border border-gray-200 rounded" /> : (isHourly ? l.hours : '—')}</td>
                    <td className="px-2 py-1 text-right text-gray-500">{isHourly ? formatMAD(l.hourly_rate) : '—'}</td>
                    <td className="px-2 py-1 text-right">{editable && !isHourly ? <input type="number" step="0.01" value={l.salary ?? 0} onChange={e => setLine(l.id, 'salary', e.target.value)} className="w-24 px-2 py-1 text-right border border-gray-200 rounded" /> : <span className="font-medium">{formatMAD(l.salary)}</span>}</td>
                    {['cnss_amo', 'ir'].map(f => (
                      <td key={f} className="px-2 py-1 text-right">
                        {editable ? <input type="number" step="0.01" value={l[f] ?? 0} onChange={e => setLine(l.id, f, e.target.value)} className="w-24 px-2 py-1 text-right border border-gray-200 rounded" /> : formatMAD(l[f])}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-semibold text-gray-800">{formatMAD(l.net_salary)}</td>
                    <td className="px-3 py-2 text-center whitespace-nowrap">
                      {l.paid
                        ? <span className="inline-flex items-center gap-1">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">{l.payment_method === 'cash' ? 'Payé espèce' : 'Payé banque'} {l.paid_date ? `· ${formatDate(l.paid_date)}` : ''}</span>
                            <button onClick={() => printReceipt(l)} className="text-xs inline-flex items-center gap-0.5 text-purple-600 hover:text-purple-800" title="Imprimer le reçu (double exemplaire)"><Printer className="w-3 h-3" /> Reçu</button>
                            <button onClick={() => unpay(l)} className="text-xs text-gray-400 hover:text-gray-700">Annuler</button>
                          </span>
                        : <button onClick={() => setPayTarget({ line: l })} className="text-xs inline-flex items-center gap-1 text-green-600 hover:text-green-800"><Check className="w-3 h-3" /> Marquer payé</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-gray-50 font-semibold text-gray-800">
              <tr><td className="px-3 py-2" colSpan="3">Totaux</td><td className="px-3 py-2 text-right">{formatMAD(totals.s)}</td><td className="px-3 py-2 text-right">{formatMAD(totals.c)}</td><td className="px-3 py-2 text-right">{formatMAD(totals.i)}</td><td className="px-3 py-2 text-right">{formatMAD(totals.n)}</td><td></td></tr>
            </tfoot>
          </table>
        </div>
        <p className="text-xs text-gray-400">Espèce → crée une dépense dans « Dépenses et charges ». Banque → la charge entre via le relevé bancaire (ne rien comptabiliser deux fois). CNSS et IR sont déclarés ici puis payés à l'État (relevé ou espèce).</p>
        <PayDrawer target={payTarget} onClose={() => setPayTarget(null)} onConfirm={doPay} run={run} unpaidCount={nUnpaid} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <select value={year} onChange={e => setYear(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg">
          {yearOptions().map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <div className="flex items-center gap-2">
          <select value={newMonth} onChange={e => setNewMonth(Number(e.target.value))} className="px-3 py-2 border border-gray-300 rounded-lg">
            {ORDER.map(m => <option key={m} value={m}>{MONTHS[m - 1]} {calYearFor(year, m)}</option>)}
          </select>
          <button onClick={createRun} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"><Plus className="w-4 h-4" /> Bulletin du mois</button>
        </div>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
            <tr><th className="px-4 py-3 text-left">Mois</th><th className="px-4 py-3 text-center">Statut</th><th className="px-4 py-3 text-right">Brut</th><th className="px-4 py-3 text-right">CNSS+AMO</th><th className="px-4 py-3 text-right">IR</th><th className="px-4 py-3 text-right">Total</th><th></th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {runs.length === 0 && <tr><td colSpan="7" className="px-4 py-8 text-center text-gray-400">Aucun bulletin pour cette année</td></tr>}
            {runs.map(r => (
              <tr key={r.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openRun(r.id)}>
                <td className="px-4 py-3 font-medium text-gray-800">{MONTHS[r.month - 1]} {r.year}</td>
                <td className="px-4 py-3 text-center"><span className={`text-xs px-2 py-0.5 rounded-full ${r.status === 'posted' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{r.status === 'posted' ? 'Tout payé' : 'En cours'}</span></td>
                <td className="px-4 py-3 text-right text-gray-700">{formatMAD(r.total_salary)}</td>
                <td className="px-4 py-3 text-right text-gray-700">{formatMAD(r.total_cnss_amo)}</td>
                <td className="px-4 py-3 text-right text-gray-700">{formatMAD(r.total_ir)}</td>
                <td className="px-4 py-3 text-right font-semibold text-gray-800">{formatMAD(r.total)}</td>
                <td className="px-4 py-3"><button onClick={(ev) => { ev.stopPropagation(); removeRun(r.id); }} className="p-1.5 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-500" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Drawer de paiement (méthode + date)
function PayDrawer({ target, onClose, onConfirm, run, unpaidCount }) {
  const defaultDate = run ? `${run.year}-${String(run.month).padStart(2, '0')}-28` : '';
  const [method, setMethod] = useState('bank');
  const [date, setDate] = useState(defaultDate);
  useEffect(() => {
    if (target) { setMethod(target.line?.payment_method || 'bank'); setDate(defaultDate); }
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps
  const isAll = target?.all;
  return (
    <Drawer open={!!target} onClose={onClose} title={isAll ? `Payer ${unpaidCount} salaire(s)` : `Payer — ${target?.line?.employee_name || ''}`}
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button color="purple" onClick={() => onConfirm({ method, date })}>Confirmer le paiement</Button></>}>
      <div className="space-y-4">
        {!isAll && <p className="text-sm text-gray-600">Net à payer : <strong>{formatMAD(target?.line?.net_salary)}</strong></p>}
        <Field label="Mode de paiement">
          <div className="flex gap-2">
            <button onClick={() => setMethod('bank')} className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 border rounded-lg text-sm ${method === 'bank' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-300'}`}><Banknote className="w-4 h-4" /> Banque</button>
            <button onClick={() => setMethod('cash')} className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 border rounded-lg text-sm ${method === 'cash' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-300'}`}><Coins className="w-4 h-4" /> Espèce</button>
          </div>
        </Field>
        <Field label="Date de paiement"><input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" /></Field>
        <p className="text-xs text-gray-500">{method === 'cash'
          ? 'Espèce → une dépense sera créée dans « Dépenses et charges ».'
          : 'Banque → aucune dépense créée ici ; la charge entrera via le relevé bancaire (évite le double comptage).'}
          {isAll ? ' Si un employé a un mode différent, son mode par défaut est utilisé.' : ''}</p>
      </div>
    </Drawer>
  );
}

// ── Suivi des paiements ──────────────────────────────────────────────────
function PaymentsTab() {
  const { year: activeYear } = useYear();
  const { school, profile } = useAuth();
  const [year, setYear] = useState(toDashYear(activeYear) || currentAcademicYear());
  const [payments, setPayments] = useState([]);
  useEffect(() => { load(); }, [year]);
  const load = async () => { try { const d = await financeApi.listPayrollPayments(year); setPayments(d.payments || []); } catch (e) { console.error(e); } };
  const printReceipt = (p) => printPayrollReceipt({
    employeeName: p.employee_name, month: p.month, year: p.year,
    salary: p.salary, cnss_amo: p.cnss_amo, ir: p.ir, net_salary: p.net_salary,
    payment_method: p.payment_method, paid_date: p.paid_date,
  }, { school, financeManagerName: profile?.full_name });
  const totalNet = payments.reduce((a, p) => a + Number(p.net_salary || 0), 0);
  const totalPaid = payments.filter(p => p.paid).reduce((a, p) => a + Number(p.net_salary || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <select value={year} onChange={e => setYear(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg">
          {yearOptions().map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <div className="flex items-center gap-2 text-xs">
          <span className="px-2 py-1 rounded-full bg-green-100 text-green-700">Payé : {formatMAD(totalPaid)}</span>
          <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-700">Reste : {formatMAD(totalNet - totalPaid)}</span>
        </div>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
            <tr><th className="px-4 py-3 text-left">Mois</th><th className="px-4 py-3 text-left">Employé</th><th className="px-4 py-3 text-right">Net</th><th className="px-4 py-3 text-center">Statut</th><th className="px-4 py-3 text-center">Mode</th><th className="px-4 py-3 text-left">Date</th><th className="px-4 py-3 text-center">Reçu</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {payments.length === 0 && <tr><td colSpan="7" className="px-4 py-8 text-center text-gray-400"><History className="w-5 h-5 inline mr-1" /> Aucun paiement pour cette année</td></tr>}
            {payments.map((p, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-600">{MONTHS[p.month - 1]} {p.year}</td>
                <td className="px-4 py-3 font-medium text-gray-800">{p.employee_name}</td>
                <td className="px-4 py-3 text-right text-gray-700">{formatMAD(p.net_salary)}</td>
                <td className="px-4 py-3 text-center"><span className={`text-xs px-2 py-0.5 rounded-full ${p.paid ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{p.paid ? 'Payé' : 'Non payé'}</span></td>
                <td className="px-4 py-3 text-center text-xs text-gray-600">{p.paid ? (p.payment_method === 'cash' ? 'Espèce' : 'Banque') : '—'}</td>
                <td className="px-4 py-3 text-gray-500">{p.paid_date ? formatDate(p.paid_date) : '—'}</td>
                <td className="px-4 py-3 text-center">
                  {p.paid
                    ? <button onClick={() => printReceipt(p)} className="text-xs inline-flex items-center gap-0.5 text-purple-600 hover:text-purple-800" title="Imprimer le reçu (double exemplaire)"><Printer className="w-3.5 h-3.5" /> Reçu</button>
                    : <span className="text-gray-300">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
