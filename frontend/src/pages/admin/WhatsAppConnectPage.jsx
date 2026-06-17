import { useState, useEffect, useCallback } from 'react';
import { Smartphone, Wifi, WifiOff, RefreshCw, QrCode, CheckCircle, AlertCircle, Info, Plus, Trash2 } from 'lucide-react';
import QRCode from 'qrcode';

const WhatsAppConnectPage = () => {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  const [sessionStatus, setSessionStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [qrCode, setQrCode] = useState(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState('');

  // Create session
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const [newSessionPhone, setNewSessionPhone] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Delete session
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Cloud API onboarding (numéro officiel)
  const [cloudCC, setCloudCC] = useState('212');
  const [cloudPhone, setCloudPhone] = useState('');
  const [cloudName, setCloudName] = useState('');
  const [cloudMethod, setCloudMethod] = useState('SMS');
  const [cloudStep, setCloudStep] = useState('form'); // form | code | done
  const [cloudCode, setCloudCode] = useState('');
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudError, setCloudError] = useState('');
  const [cloudPin, setCloudPin] = useState(null);

  // Affiche l'ancien flux Baileys (QR) — masqué par défaut au profit du Cloud
  const [showLegacy, setShowLegacy] = useState(false);

  const getAuthToken = async () => {
    const { supabase } = await import('../../lib/supabase');
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  };

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/session-status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Le serveur backend ne répond pas correctement. Vérifiez qu\'il est démarré.');
      }
      const data = await res.json();
      setSessionStatus(data);
    } catch (error) {
      console.error('Erreur statut:', error);
      setSessionStatus({ connected: false, error: 'Erreur de connexion au serveur' });
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const fetchQR = async () => {
    setQrLoading(true);
    setQrError('');
    setQrCode(null);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/session-qr`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.qrString) {
        // Convert raw QR string to data URL image
        const dataUrl = await QRCode.toDataURL(data.qrString, { width: 300, margin: 2 });
        setQrCode(dataUrl);
      } else {
        setQrError(data.error || 'QR code non disponible');
      }
    } catch (error) {
      console.error('Erreur QR:', error);
      setQrError('Erreur de connexion au serveur');
    } finally {
      setQrLoading(false);
    }
  };

  const handleCreateSession = async () => {
    if (!newSessionName || !newSessionPhone) {
      setCreateError('Nom et numéro de téléphone requis');
      return;
    }
    setCreating(true);
    setCreateError('');
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/sessions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: newSessionName, phone_number: newSessionPhone })
      });
      const data = await res.json();
      if (data.success) {
        setShowCreateForm(false);
        setNewSessionName('');
        setNewSessionPhone('');
        fetchStatus();
      } else {
        setCreateError(data.error || 'Erreur lors de la création');
      }
    } catch (error) {
      console.error('Erreur création:', error);
      setCreateError('Erreur de connexion au serveur');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteSession = async () => {
    if (!sessionStatus?.session?.id) return;
    setDeleting(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/sessions/${sessionStatus.session.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setConfirmDelete(false);
        setSessionStatus(null);
        setQrCode(null);
        fetchStatus();
      } else {
        alert(data.error || 'Erreur lors de la suppression');
      }
    } catch (error) {
      console.error('Erreur suppression:', error);
      alert('Erreur de connexion au serveur');
    } finally {
      setDeleting(false);
    }
  };

  const handleCloudAddNumber = async () => {
    if (!cloudPhone || !cloudName) {
      setCloudError('Numéro et nom affiché requis');
      return;
    }
    setCloudLoading(true);
    setCloudError('');
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/cloud/add-number`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ cc: cloudCC, phone: cloudPhone, verified_name: cloudName, code_method: cloudMethod }),
      });
      const data = await res.json();
      if (data.success) {
        setCloudStep('code');
      } else {
        setCloudError(data.error || 'Erreur lors de l\'ajout du numéro');
      }
    } catch (e) {
      console.error('Erreur cloud add:', e);
      setCloudError('Erreur de connexion au serveur');
    } finally {
      setCloudLoading(false);
    }
  };

  const handleCloudVerify = async () => {
    if (!cloudCode) {
      setCloudError('Code requis');
      return;
    }
    setCloudLoading(true);
    setCloudError('');
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/cloud/verify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: cloudCode }),
      });
      const data = await res.json();
      if (data.success) {
        setCloudPin(data.pin || null);
        setCloudStep('done');
        fetchStatus();
      } else {
        setCloudError(data.error || 'Vérification échouée');
      }
    } catch (e) {
      console.error('Erreur cloud verify:', e);
      setCloudError('Erreur de connexion au serveur');
    } finally {
      setCloudLoading(false);
    }
  };

  const isCloudConnected = sessionStatus?.provider === 'cloud' && sessionStatus?.connected;

  return (
    <div className="p-4 space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Smartphone className="w-6 h-6 text-green-600" />
          Connexion WhatsApp
        </h1>
        <p className="text-sm text-gray-500 mt-1">Gérez la connexion de votre numéro WhatsApp pour l'envoi de messages</p>
      </div>

      {/* Status Card */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800">Statut de la session</h2>
          <button
            onClick={fetchStatus}
            disabled={loading}
            className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
          </div>
        ) : sessionStatus?.status === 'no_session' ? (
          <div className="text-center py-6 space-y-2">
            <p className="text-gray-500 text-sm">Aucun numéro connecté.</p>
            <p className="text-gray-500 text-sm">Utilisez la <strong>connexion via API officielle</strong> ci-dessous. 👇</p>
          </div>
        ) : sessionStatus ? (
          <div className="space-y-4">
            {/* Connection status */}
            <div className={`flex items-center gap-3 p-4 rounded-lg ${sessionStatus.connected ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              {sessionStatus.connected ? (
                <>
                  <Wifi className="w-8 h-8 text-green-600" />
                  <div>
                    <p className="font-semibold text-green-800">Connecté</p>
                    <p className="text-sm text-green-700">Votre session WhatsApp est active et prête à envoyer des messages.</p>
                  </div>
                </>
              ) : (
                <>
                  <WifiOff className="w-8 h-8 text-red-600" />
                  <div>
                    <p className="font-semibold text-red-800">Déconnecté</p>
                    <p className="text-sm text-red-700">
                      {sessionStatus.error || 'La session WhatsApp n\'est pas connectée. Scannez le QR code ci-dessous.'}
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Session details */}
            {sessionStatus.session && (
              <>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500 font-medium">Nom de session</p>
                    <p className="text-gray-800 font-medium">{sessionStatus.session.name || '—'}</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500 font-medium">Numéro</p>
                    <p className="text-gray-800 font-medium">{sessionStatus.session.phone || '—'}</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500 font-medium">ID Session</p>
                    <p className="text-gray-800 font-medium text-xs">{sessionStatus.session.id || '—'}</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500 font-medium">Statut</p>
                    <p className="text-gray-800 font-medium">{sessionStatus.session.status || '—'}</p>
                  </div>
                </div>

                {/* Delete session button */}
                <div className="pt-2 border-t border-gray-100">
                  {confirmDelete ? (
                    <div className="flex items-center gap-3 p-3 bg-red-50 rounded-lg border border-red-200">
                      <p className="text-sm text-red-800 flex-1">Supprimer cette session ? Cette action est irréversible.</p>
                      <button
                        onClick={handleDeleteSession}
                        disabled={deleting}
                        className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                      >
                        {deleting ? 'Suppression...' : 'Confirmer'}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(false)}
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        Annuler
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(true)}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                      Supprimer la session
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">Impossible de récupérer le statut.</p>
        )}
      </div>

      {/* Cloud API onboarding (numéro officiel Meta) */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 shadow-sm space-y-4">
        <div>
          <h2 className="text-base font-semibold text-emerald-900 flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            Connexion via API officielle WhatsApp (recommandé)
          </h2>
          <p className="text-xs text-emerald-700 mt-1">
            Boutons cliquables, pas de QR, pas de risque de blocage. Le numéro doit être
            <strong> dédié</strong> et ne plus être utilisé dans l'application WhatsApp.
          </p>
        </div>

        {isCloudConnected ? (
          <div className="flex items-center gap-3 p-4 bg-white rounded-lg border border-emerald-200">
            <CheckCircle className="w-6 h-6 text-emerald-600" />
            <div>
              <p className="font-medium text-emerald-800">Numéro officiel connecté</p>
              <p className="text-sm text-emerald-700">{sessionStatus?.session?.phone || '—'}</p>
            </div>
          </div>
        ) : cloudStep === 'done' ? (
          <div className="space-y-2">
            <div className="flex items-center gap-3 p-4 bg-white rounded-lg border border-emerald-200">
              <CheckCircle className="w-6 h-6 text-emerald-600" />
              <p className="font-medium text-emerald-800">Numéro vérifié et activé ✅</p>
            </div>
            {cloudPin && (
              <p className="text-xs text-gray-600">
                Code PIN 2FA généré (à conserver) : <strong>{cloudPin}</strong>
              </p>
            )}
          </div>
        ) : cloudStep === 'code' ? (
          <div className="space-y-3">
            <p className="text-sm text-emerald-800">
              Un code a été envoyé par {cloudMethod === 'SMS' ? 'SMS' : 'appel'} au
              {' '}<strong>+{cloudCC} {cloudPhone}</strong>. Saisissez-le ci-dessous.
            </p>
            <input
              type="text"
              value={cloudCode}
              onChange={(e) => setCloudCode(e.target.value)}
              placeholder="Code à 6 chiffres"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
            />
            {cloudError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg border border-red-200">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                <p className="text-sm text-red-800">{cloudError}</p>
              </div>
            )}
            <div className="flex items-center gap-3">
              <button
                onClick={handleCloudVerify}
                disabled={cloudLoading}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm font-medium"
              >
                {cloudLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Vérifier et connecter
              </button>
              <button
                onClick={() => { setCloudStep('form'); setCloudError(''); setCloudCode(''); }}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Recommencer
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Indicatif</label>
                <input
                  type="text"
                  value={cloudCC}
                  onChange={(e) => setCloudCC(e.target.value.replace(/[^\d]/g, ''))}
                  placeholder="212"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-gray-700 block mb-1">Numéro (sans indicatif) *</label>
                <input
                  type="text"
                  value={cloudPhone}
                  onChange={(e) => setCloudPhone(e.target.value.replace(/[^\d]/g, ''))}
                  placeholder="600000000"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">Nom affiché de l'établissement *</label>
              <input
                type="text"
                value={cloudName}
                onChange={(e) => setCloudName(e.target.value)}
                placeholder="Ex: Groupe Scolaire Al Amal"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">Recevoir le code par</label>
              <select
                value={cloudMethod}
                onChange={(e) => setCloudMethod(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
              >
                <option value="SMS">SMS</option>
                <option value="VOICE">Appel vocal</option>
              </select>
            </div>
            {cloudError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg border border-red-200">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                <p className="text-sm text-red-800">{cloudError}</p>
              </div>
            )}
            <button
              onClick={handleCloudAddNumber}
              disabled={cloudLoading}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm font-medium"
            >
              {cloudLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Envoyer le code de vérification
            </button>
          </div>
        )}
      </div>

      {/* Create Session Form */}
      {showCreateForm && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-6 shadow-sm space-y-4">
          <h2 className="text-base font-semibold text-green-900 flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Créer une nouvelle session WhatsApp
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">Nom de la session *</label>
              <input
                type="text"
                value={newSessionName}
                onChange={(e) => setNewSessionName(e.target.value)}
                placeholder="Ex: Suivi des étudiants"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">Numéro de téléphone * (format international)</label>
              <input
                type="text"
                value={newSessionPhone}
                onChange={(e) => setNewSessionPhone(e.target.value)}
                placeholder="Ex: +212600000000"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
            </div>
          </div>

          {createError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg border border-red-200">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
              <p className="text-sm text-red-800">{createError}</p>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={handleCreateSession}
              disabled={creating}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
            >
              {creating ? (
                <><RefreshCw className="w-4 h-4 animate-spin" /> Création...</>
              ) : (
                <><Plus className="w-4 h-4" /> Créer la session</>
              )}
            </button>
            <button
              onClick={() => { setShowCreateForm(false); setCreateError(''); }}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* QR Code Section (ancienne méthode Baileys, masquée par défaut) */}
      {showLegacy && sessionStatus && !sessionStatus.connected && sessionStatus.provider !== 'cloud' && sessionStatus.session && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
              <QrCode className="w-5 h-5" />
              Scanner le QR Code
            </h2>
            <button
              onClick={fetchQR}
              disabled={qrLoading}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${qrLoading ? 'animate-spin' : ''}`} />
              {qrCode ? 'Rafraîchir' : 'Obtenir le QR'}
            </button>
          </div>

          {qrLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
            </div>
          ) : qrCode ? (
            <div className="flex flex-col items-center gap-4">
              <div className="p-4 bg-white border-2 border-gray-200 rounded-xl">
                <img src={qrCode} alt="QR Code WhatsApp" className="w-64 h-64" />
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-700 font-medium">Scannez ce QR code avec WhatsApp</p>
                <p className="text-xs text-gray-500 mt-1">
                  Ouvrez WhatsApp → Menu (⋮) → Appareils connectés → Connecter un appareil
                </p>
              </div>
            </div>
          ) : qrError ? (
            <div className="flex items-center gap-2 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
              <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
              <p className="text-sm text-yellow-800">{qrError}</p>
            </div>
          ) : (
            <p className="text-sm text-gray-500 text-center py-8">
              Cliquez sur "Obtenir le QR" pour afficher le code QR de connexion.
            </p>
          )}
        </div>
      )}

      {/* Méthode alternative : ancien flux Baileys (QR), masqué par défaut */}
      {sessionStatus?.provider !== 'cloud' && (
        <div className="text-center">
          {!showLegacy ? (
            <button
              onClick={() => setShowLegacy(true)}
              className="text-xs text-gray-400 hover:text-gray-600 underline"
            >
              Méthode alternative : connexion par QR code (Baileys, non-officielle)
            </button>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-5 space-y-3 text-left">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <QrCode className="w-4 h-4" /> Connexion par QR code (ancienne méthode)
                </h3>
                <button
                  onClick={() => setShowLegacy(false)}
                  className="text-xs text-gray-400 hover:text-gray-600 underline"
                >
                  Masquer
                </button>
              </div>
              <p className="text-xs text-gray-500">
                Méthode non-officielle (Baileys), sans boutons et avec risque de blocage.
                Préférez l'API officielle ci-dessus.
              </p>
              {sessionStatus?.status === 'no_session' && (
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm font-medium"
                >
                  <Plus className="w-4 h-4" /> Créer une session QR
                </button>
              )}
              <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
                <li>Créez une session avec le numéro WhatsApp de l'école</li>
                <li>Cliquez sur « Obtenir le QR »</li>
                <li>WhatsApp → Appareils connectés → Connecter un appareil → scannez</li>
              </ol>
            </div>
          )}
        </div>
      )}

      {/* Connected success */}
      {sessionStatus?.connected && (
        <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg border border-green-200">
          <CheckCircle className="w-6 h-6 text-green-600" />
          <div>
            <p className="font-medium text-green-800">Tout est prêt !</p>
            <p className="text-sm text-green-700">Vous pouvez maintenant envoyer des messages WhatsApp aux parents depuis la page "Envoyer".</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default WhatsAppConnectPage;
