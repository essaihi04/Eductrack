import { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, Eye, EyeOff, Lock, Moon, Save, Sun, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import TaskModal from '../../components/ui/TaskModal';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../i18n';
import { supabase } from '../../lib/supabase';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const EMPTY_PASSWORDS = { currentPassword: '', newPassword: '', confirmPassword: '' };

const passwordChecks = (value) => ({
  length: value.length >= 8,
  letter: /[A-Za-z]/.test(value),
  number: /\d/.test(value),
  special: /[^A-Za-z0-9]/.test(value),
});

const authToken = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token;
};

export default function ParentProfilePage() {
  const { profile, signOut } = useAuth();
  const { t, dir } = useI18n();
  const navigate = useNavigate();
  const photoInputRef = useRef(null);
  const [phone, setPhone] = useState(profile?.phone || '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '');
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwords, setPasswords] = useState(EMPTY_PASSWORDS);
  const [show, setShow] = useState({ current: false, next: false, confirm: false });

  useEffect(() => {
    setPhone(profile?.phone || '');
    setAvatarUrl(profile?.avatar_url || '');
  }, [profile?.avatar_url, profile?.phone]);

  const notify = (type, text) => {
    setMessage({ type, text });
    window.setTimeout(() => setMessage(null), 4000);
  };

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    localStorage.setItem('theme', next);
    document.documentElement.classList.toggle('dark', next === 'dark');
  };

  const uploadPhoto = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append('photo', file);
      const res = await fetch(`${apiUrl}/api/auth/profile/photo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await authToken()}` },
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t('pprofile.photoError'));
      setAvatarUrl(data.avatar_url || '');
      notify('success', t('pprofile.photoSaved'));
    } catch (error) {
      notify('error', error.message || t('pprofile.photoError'));
    } finally {
      setUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const saveContact = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`${apiUrl}/api/auth/profile`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${await authToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t('pprofile.saveError'));
      notify('success', t('pprofile.saved'));
    } catch (error) {
      notify('error', error.message || t('pprofile.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (event) => {
    event.preventDefault();
    if (passwords.newPassword !== passwords.confirmPassword) {
      notify('error', t('pprofile.passwordMismatch'));
      return;
    }
    const checks = passwordChecks(passwords.newPassword);
    if (Object.values(checks).some((ok) => !ok)) {
      notify('error', t('pprofile.passwordWeak'));
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${apiUrl}/api/auth/change-password`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await authToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword: passwords.currentPassword,
          newPassword: passwords.newPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t('pprofile.passwordError'));
      setPasswordOpen(false);
      setPasswords(EMPTY_PASSWORDS);
      notify('success', t('pprofile.passwordChanged'));
      window.setTimeout(async () => {
        await signOut();
        navigate('/login');
      }, 1800);
    } catch (error) {
      notify('error', error.message || t('pprofile.passwordError'));
    } finally {
      setSaving(false);
    }
  };

  const checks = passwordChecks(passwords.newPassword);
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ');

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">{t('pprofile.title')}</h1>
          <p className="mt-1 text-sm text-gray-600">{t('pprofile.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={t(theme === 'light' ? 'pprofile.themeDark' : 'pprofile.themeLight')}
          className="rounded-xl border border-gray-200 bg-white p-2.5 text-gray-700 shadow-sm transition hover:bg-gray-50"
        >
          {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
        </button>
      </header>

      {message && (
        <div className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${message.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
          {message.type === 'success' && <CheckCircle2 className="h-4 w-4 shrink-0" />}
          {message.text}
        </div>
      )}

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:p-5">
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-start">
          {avatarUrl ? (
            <img src={avatarUrl.startsWith('http') ? avatarUrl : `${apiUrl}${avatarUrl}`} alt={name} className="h-20 w-20 rounded-full border-2 border-primary/20 object-cover" />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary">
              <UserRound className="h-9 w-9" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-bold text-gray-900">{name}</h2>
            <p className="text-sm font-medium text-primary">{t('pprofile.role')}</p>
            <p className="mt-0.5 truncate text-sm text-gray-500">{profile?.email}</p>
          </div>
          <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={uploadPhoto} />
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 text-sm font-semibold text-primary transition hover:bg-primary/10 disabled:opacity-50"
          >
            <Camera className="h-4 w-4" /> {t(uploading ? 'pprofile.uploading' : 'pprofile.upload')}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:p-5">
        <h2 className="text-lg font-bold text-gray-900">{t('pprofile.contact')}</h2>
        <p className="mb-4 text-sm text-gray-500">{t('pprofile.contactHint')}</p>
        <form onSubmit={saveContact} className="grid gap-4 sm:grid-cols-2">
          <ReadOnlyField label={t('pprofile.fullName')} value={name} hint={t('pprofile.readonly')} />
          <ReadOnlyField label={t('pprofile.email')} value={profile?.email || '—'} hint={t('pprofile.readonly')} />
          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-sm font-medium text-gray-700">{t('pprofile.phone')}</span>
            <input
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+212 6XX XXX XXX"
              dir="ltr"
              className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-start focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50 sm:col-span-2 sm:justify-self-end">
            <Save className="h-4 w-4" /> {t(saving ? 'common.saving' : 'common.save')}
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center md:p-5">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <Lock className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h2 className="font-bold text-gray-900">{t('pprofile.security')}</h2>
          <p className="text-sm text-gray-500">{t('pprofile.securityHint')}</p>
        </div>
        <button type="button" onClick={() => setPasswordOpen(true)} className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100">
          {t('pprofile.changePassword')}
        </button>
      </section>

      <TaskModal
        open={passwordOpen}
        onClose={() => !saving && setPasswordOpen(false)}
        onSubmit={changePassword}
        busy={saving}
        title={t('pprofile.changePassword')}
        subtitle={t('pprofile.passwordHint')}
        closeLabel={t('common.close')}
        maxWidth="max-w-md"
        footer={(
          <>
            <button type="button" onClick={() => setPasswordOpen(false)} disabled={saving} className="flex-1 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 sm:flex-none">{t('common.cancel')}</button>
            <button type="submit" disabled={saving} className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50 sm:flex-none">{t(saving ? 'common.saving' : 'pprofile.changePassword')}</button>
          </>
        )}
      >
        <div className="space-y-3" dir={dir}>
          <PasswordField label={t('pprofile.currentPassword')} value={passwords.currentPassword} visible={show.current} onToggle={() => setShow((v) => ({ ...v, current: !v.current }))} onChange={(value) => setPasswords((v) => ({ ...v, currentPassword: value }))} dir={dir} />
          <PasswordField label={t('pprofile.newPassword')} value={passwords.newPassword} visible={show.next} onToggle={() => setShow((v) => ({ ...v, next: !v.next }))} onChange={(value) => setPasswords((v) => ({ ...v, newPassword: value }))} dir={dir} />
          {passwords.newPassword && (
            <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-gray-50 p-3 text-xs">
              {Object.entries(checks).map(([key, ok]) => <span key={key} className={ok ? 'text-emerald-700' : 'text-gray-500'}>{ok ? '✓' : '○'} {t(`pprofile.rule.${key}`)}</span>)}
            </div>
          )}
          <PasswordField label={t('pprofile.confirmPassword')} value={passwords.confirmPassword} visible={show.confirm} onToggle={() => setShow((v) => ({ ...v, confirm: !v.confirm }))} onChange={(value) => setPasswords((v) => ({ ...v, confirmPassword: value }))} dir={dir} />
        </div>
      </TaskModal>
    </div>
  );
}

const ReadOnlyField = ({ label, value, hint }) => (
  <label>
    <span className="mb-1.5 block text-sm font-medium text-gray-700">{label}</span>
    <input value={value} disabled className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-gray-600" />
    <span className="mt-1 block text-xs text-gray-400">{hint}</span>
  </label>
);

const PasswordField = ({ label, value, visible, onToggle, onChange, dir }) => (
  <label className="block">
    <span className="mb-1.5 block text-sm font-medium text-gray-700">{label}</span>
    <span className="relative block">
      <input type={visible ? 'text' : 'password'} value={value} onChange={(event) => onChange(event.target.value)} required className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 pe-11 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
      <button type="button" onClick={onToggle} className={`absolute top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 ${dir === 'rtl' ? 'left-2' : 'right-2'}`}>
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </span>
  </label>
);
