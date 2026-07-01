import { useEffect, useMemo, useState } from 'react';
import { Users, Search, Plus, Save, RefreshCw, Check, Copy } from 'lucide-react';
import { PageHeader, FilterBar, Button, Drawer, Field } from '../../../components/finance/ui';
import {
  CardGrid, StudentCard, StudentRow, GridListToggle, StatusPill, DetailDrawer, FieldRow,
} from '../../../components/directory/ui';
import { useYear } from '../../../contexts/YearContext';
import { enrollmentsApi } from '../../../lib/enrollmentsApi';
import { inscriptionsApi } from '../../../lib/inscriptionsApi';
import { generateEmail, generatePassword } from '../../../utils/studentUtils';

// Statut d'inscription d'une ligne de roster (RI/NI/NR) → pastille.
function statusPill(status) {
  if (status === 'RI') return <StatusPill tone="green" icon={Check}>Réinscrit</StatusPill>;
  if (status === 'NI') return <StatusPill tone="blue" icon={Plus}>Nouveau</StatusPill>;
  return <StatusPill tone="red">Non réinscrit</StatusPill>;
}

const emptyForm = {
  email: '', password: '',
  firstName: '', lastName: '', firstNameAr: '', lastNameAr: '',
  gender: 'M', phone: '', cin: '',
  dateOfBirth: '', birthPlace: '', classId: '',
  registrationNumber: '', entryDate: '', massarCode: '',
  previousSchool: '', previousClass: '',
  homeAddress: '', quartier: '', homePhone: '',
};

// Page « Élèves » du pôle Inscriptions (finance) : reprend l'affichage en
// cartes de la fiche élève admin, sans les éléments pédagogiques (documents,
// santé, photo, rattachement parent en ligne, envoi WhatsApp des identifiants…).
// Le responsable financier peut consulter le roster de l'année et inscrire un
// nouvel élève ; la réinscription se fait dans l'onglet dédié.
export default function InscriptionsStudentsPage() {
  const { year } = useYear();
  const [roster, setRoster] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [activeEntry, setActiveEntry] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [created, setCreated] = useState(null); // { email, password } — identifiants à communiquer

  const load = async () => {
    setLoading(true);
    try {
      const data = await enrollmentsApi.list(year);
      setRoster(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [year]);
  useEffect(() => {
    inscriptionsApi.listClasses(year).then((data) => setClasses(Array.isArray(data) ? data : []))
      .catch((e) => console.error(e));
  }, [year]);

  const filtered = useMemo(() => {
    let list = roster;
    if (classFilter) list = list.filter((e) => e.class_id === classFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((e) => `${e.student?.first_name || ''} ${e.student?.last_name || ''}`.toLowerCase().includes(q));
    }
    return list;
  }, [roster, classFilter, search]);

  const openForm = () => {
    setFormError('');
    setCreated(null);
    setFormData(emptyForm);
    setShowForm(true);
  };

  const autoFillCredentials = () => {
    if (!formData.firstName || !formData.lastName) return;
    setFormData((f) => ({
      ...f,
      email: f.email || generateEmail(`${f.firstName}.${f.lastName}`, ''),
      password: f.password || generatePassword(f.firstName),
    }));
  };

  const submitForm = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!formData.firstName || !formData.lastName) { setFormError('Nom et prénom requis'); return; }
    if (!formData.email || !formData.password) { setFormError('Identifiants (email/mot de passe) requis'); return; }
    setSubmitting(true);
    try {
      const res = await inscriptionsApi.createStudent(formData);
      setCreated({ email: res.email, password: res.password, name: `${res.first_name} ${res.last_name}` });
      await load();
    } catch (e2) {
      setFormError(e2.message || "Erreur lors de l'inscription");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        icon={Users}
        title="Élèves"
        subtitle={`Année scolaire ${year} · ${filtered.length} élève(s)`}
        color="orange"
        onRefresh={load}
        loading={loading}
        actions={<Button icon={Plus} onClick={openForm}>Nouvel élève</Button>}
      />

      <FilterBar>
        <div className="flex-1 min-w-[200px] flex items-center gap-2 border border-border rounded-lg px-3 h-9 bg-card">
          <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un élève…"
            className="flex-1 bg-transparent outline-none text-sm"
          />
        </div>
        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          className="border border-border rounded-lg px-3 h-9 text-sm bg-card"
        >
          <option value="">Toutes les classes</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <GridListToggle value={viewMode} onChange={setViewMode} />
      </FilterBar>

      {loading ? (
        <div className="flex justify-center p-10"><RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">Aucun élève trouvé pour {year}.</p>
      ) : viewMode === 'grid' ? (
        <CardGrid>
          {filtered.map((e) => (
            <StudentCard
              key={e.id}
              name={`${e.student?.last_name || ''} ${e.student?.first_name || ''}`.trim()}
              className={e.class?.name || 'Sans classe'}
              photo={e.student?.avatar_url}
              gender={e.student?.gender || ''}
              status={statusPill(e.status)}
              onClick={() => setActiveEntry(e)}
            />
          ))}
        </CardGrid>
      ) : (
        <div>
          {filtered.map((e) => (
            <StudentRow
              key={e.id}
              name={`${e.student?.last_name || ''} ${e.student?.first_name || ''}`.trim()}
              className={e.class?.name || 'Sans classe'}
              sub={e.class?.level}
              photo={e.student?.avatar_url}
              gender={e.student?.gender || ''}
              status={statusPill(e.status)}
              onClick={() => setActiveEntry(e)}
            />
          ))}
        </div>
      )}

      {/* Fiche élève — lecture seule (édition pédagogique réservée à l'admin) */}
      <DetailDrawer open={!!activeEntry} onClose={() => setActiveEntry(null)} title={activeEntry ? `${activeEntry.student?.last_name || ''} ${activeEntry.student?.first_name || ''}`.trim() : ''}>
        {activeEntry && (
          <div>
            <FieldRow label="Classe" value={activeEntry.class?.name || '—'} />
            <FieldRow label="Niveau" value={activeEntry.class?.level || '—'} />
            <FieldRow label="Filière" value={activeEntry.class?.filiere || '—'} />
            <FieldRow label="Statut" value={activeEntry.status === 'RI' ? 'Réinscrit' : activeEntry.status === 'NI' ? 'Nouveau' : 'Non réinscrit'} />
            <FieldRow label="Code Massar" value={activeEntry.student?.massar_code || '—'} mono />
          </div>
        )}
      </DetailDrawer>

      {/* Nouvel élève — champs essentiels uniquement (identité, contact, classe) */}
      <Drawer
        open={showForm}
        onClose={() => setShowForm(false)}
        title="Nouvel élève"
        footer={created ? (
          <Button onClick={() => setShowForm(false)}>Fermer</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={() => setShowForm(false)}>Annuler</Button>
            <Button icon={Save} onClick={submitForm} disabled={submitting}>
              {submitting ? 'Inscription…' : 'Inscrire'}
            </Button>
          </>
        )}
      >
        {created ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm">
              <Check className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{created.name} a été inscrit(e). Communiquez ces identifiants :</span>
            </div>
            <div className="p-3 rounded-lg border border-border bg-muted/30 text-sm space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono">{created.email}</span>
                <button type="button" onClick={() => navigator.clipboard.writeText(created.email)} className="p-1 hover:bg-accent rounded"><Copy className="w-3.5 h-3.5" /></button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono">{created.password}</span>
                <button type="button" onClick={() => navigator.clipboard.writeText(created.password)} className="p-1 hover:bg-accent rounded"><Copy className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            <Button icon={Plus} variant="secondary" onClick={openForm}>Inscrire un autre élève</Button>
          </div>
        ) : (
          <form onSubmit={submitForm} className="space-y-3" onBlur={autoFillCredentials}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Prénom" required>
                <input className="w-full border rounded-lg px-3 py-2 text-sm" value={formData.firstName}
                  onChange={(e) => setFormData((f) => ({ ...f, firstName: e.target.value }))} required />
              </Field>
              <Field label="Nom" required>
                <input className="w-full border rounded-lg px-3 py-2 text-sm" value={formData.lastName}
                  onChange={(e) => setFormData((f) => ({ ...f, lastName: e.target.value }))} required />
              </Field>
              <Field label="Prénom (arabe)">
                <input className="w-full border rounded-lg px-3 py-2 text-sm" value={formData.firstNameAr}
                  onChange={(e) => setFormData((f) => ({ ...f, firstNameAr: e.target.value }))} dir="rtl" />
              </Field>
              <Field label="Nom (arabe)">
                <input className="w-full border rounded-lg px-3 py-2 text-sm" value={formData.lastNameAr}
                  onChange={(e) => setFormData((f) => ({ ...f, lastNameAr: e.target.value }))} dir="rtl" />
              </Field>
              <Field label="Genre">
                <select className="w-full border rounded-lg px-3 py-2 text-sm" value={formData.gender}
                  onChange={(e) => setFormData((f) => ({ ...f, gender: e.target.value }))}>
                  <option value="M">Garçon</option>
                  <option value="F">Fille</option>
                </select>
              </Field>
              <Field label="Classe">
                <select className="w-full border rounded-lg px-3 py-2 text-sm" value={formData.classId}
                  onChange={(e) => setFormData((f) => ({ ...f, classId: e.target.value }))}>
                  <option value="">— aucune —</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Date de naissance">
                <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={formData.dateOfBirth}
                  onChange={(e) => setFormData((f) => ({ ...f, dateOfBirth: e.target.value }))} />
              </Field>
              <Field label="Lieu de naissance">
                <input className="w-full border rounded-lg px-3 py-2 text-sm" value={formData.birthPlace}
                  onChange={(e) => setFormData((f) => ({ ...f, birthPlace: e.target.value }))} />
              </Field>
              <Field label="CIN">
                <input className="w-full border rounded-lg px-3 py-2 text-sm" value={formData.cin}
                  onChange={(e) => setFormData((f) => ({ ...f, cin: e.target.value }))} />
              </Field>
              <Field label="Téléphone">
                <input className="w-full border rounded-lg px-3 py-2 text-sm" value={formData.phone}
                  onChange={(e) => setFormData((f) => ({ ...f, phone: e.target.value }))} />
              </Field>
              <Field label="Code Massar">
                <input className="w-full border rounded-lg px-3 py-2 text-sm" value={formData.massarCode}
                  onChange={(e) => setFormData((f) => ({ ...f, massarCode: e.target.value }))} />
              </Field>
              <Field label="N° inscription">
                <input className="w-full border rounded-lg px-3 py-2 text-sm" value={formData.registrationNumber}
                  onChange={(e) => setFormData((f) => ({ ...f, registrationNumber: e.target.value }))} />
              </Field>
              <Field label="École précédente">
                <input className="w-full border rounded-lg px-3 py-2 text-sm" value={formData.previousSchool}
                  onChange={(e) => setFormData((f) => ({ ...f, previousSchool: e.target.value }))} />
              </Field>
            </div>

            <div className="pt-2 border-t border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-600">Identifiants</span>
                <button type="button" onClick={() => setFormData((f) => ({
                  ...f,
                  email: generateEmail(`${f.firstName}.${f.lastName}`, ''),
                  password: generatePassword(f.firstName),
                }))} className="text-xs text-blue-600 hover:underline">Générer</button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Email" required>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" value={formData.email}
                    onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value }))} required />
                </Field>
                <Field label="Mot de passe" required>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" value={formData.password}
                    onChange={(e) => setFormData((f) => ({ ...f, password: e.target.value }))} required />
                </Field>
              </div>
            </div>

            {formError && <p className="text-sm font-medium text-red-600">{formError}</p>}
          </form>
        )}
      </Drawer>
    </div>
  );
}
