import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Lock, Moon, Sun, Save, AlertCircle, CheckCircle, Eye, EyeOff, User } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

const AVATARS = [
  { emoji: '🙂' },
  { emoji: '😃' },
  { emoji: '🤓' },
  { emoji: '🧠' },
  { emoji: '😌' },
  { emoji: '👧' },
  { emoji: '👦' },
  { emoji: '🧕' },
  { emoji: '🎨' },
  { emoji: '🎭' },
  { emoji: '🎬' },
  { emoji: '🎵' },
  { emoji: '🎸' },
  { emoji: '🎹' },
  { emoji: '🎤' },
  { emoji: '📷' },
  { emoji: '🎮' },
  { emoji: '🎯' },
  { emoji: '🚗' },
  { emoji: '🚙' },
  { emoji: '🏎️' },
  { emoji: '🏍️' },
  { emoji: '🚲' },
  { emoji: '🚀' },
  { emoji: '⚽' },
  { emoji: '🏀' },
  { emoji: '🎾' },
  { emoji: '🏈' },
  { emoji: '⚾' },
  { emoji: '🎱' },
  { emoji: '🏊' },
  { emoji: '🏃' },
  { emoji: '🚴' },
  { emoji: '💻' },
  { emoji: '📱' },
  { emoji: '🖥️' },
  { emoji: '🎧' },
  { emoji: '📺' },
  { emoji: '📸' },
  { emoji: '📚' },
  { emoji: '✈️' },
  { emoji: '🌍' },
  { emoji: '🍕' },
  { emoji: '🍔' },
  { emoji: '☕' },
  { emoji: '🕌' },
  { emoji: '🤲' },
  { emoji: '📿' },
  { emoji: '📖' },
  { emoji: '🙏' },
  { emoji: '🌙' },
  { emoji: '⭐' },
];

const StudentProfile = () => {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
  const [selectedAvatar, setSelectedAvatar] = useState(profile?.avatar || '🙂');
  const [showAvatarList, setShowAvatarList] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false
  });
  const [formData, setFormData] = useState({
    firstName: profile?.first_name || '',
    lastName: profile?.last_name || '',
    email: profile?.email || '',
    phone: profile?.phone || '',
  });

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const applyTheme = (selectedTheme) => {
    localStorage.setItem('theme', selectedTheme);
    if (selectedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const handleThemeChange = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
  };

  const handleAvatarSelect = (avatarId) => {
    setSelectedAvatar(avatarId);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const validatePassword = (password) => {
    const hasLetters = /[a-zA-Z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
    const isLongEnough = password.length >= 8;

    return {
      isValid: hasLetters && hasNumbers && hasSpecialChar && isLongEnough,
      requirements: {
        hasLetters,
        hasNumbers,
        hasSpecialChar,
        isLongEnough
      }
    };
  };

  const updateProfile = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const updateData = {
        first_name: formData.firstName,
        last_name: formData.lastName,
        phone: formData.phone,
        avatar: selectedAvatar,
      };

      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const res = await fetch(`${apiUrl}/api/auth/profile`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      });

      if (res.ok) {
        setShowAvatarList(false);
        setMessage({ type: 'success', text: '✅ Profil enregistré avec succès !' });
        setTimeout(() => setMessage({ type: '', text: '' }), 4000);
      } else {
        setMessage({ type: 'error', text: 'Erreur lors de la mise à jour du profil' });
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      setMessage({ type: 'error', text: 'Erreur serveur' });
    } finally {
      setLoading(false);
    }
  };

  const updatePassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setMessage({ type: 'error', text: 'Les mots de passe ne correspondent pas' });
      setLoading(false);
      return;
    }

    const validation = validatePassword(passwordData.newPassword);
    if (!validation.isValid) {
      setMessage({ type: 'error', text: 'Le mot de passe ne respecte pas les critères de sécurité' });
      setLoading(false);
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const res = await fetch(`${apiUrl}/api/auth/change-password`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.newPassword
        })
      });

      if (res.ok) {
        setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
        setShowPasswordForm(false);
        setMessage({ type: 'success', text: 'Mot de passe modifié avec succès ! Redirection vers la page de connexion...' });
        
        // Déconnexion et redirection vers la page de login après 2 secondes
        setTimeout(async () => {
          await signOut();
          navigate('/login');
        }, 2000);
      } else {
        const error = await res.json();
        setMessage({ type: 'error', text: error.error || 'Erreur lors du changement de mot de passe' });
      }
    } catch (error) {
      console.error('Error changing password:', error);
      setMessage({ type: 'error', text: 'Erreur serveur' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 pb-8">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Mon Profil</h1>
          <p className="text-muted-foreground mt-2">Gérez vos informations personnelles et préférences</p>
        </div>
        <button
          onClick={handleThemeChange}
          className="p-3 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
          title={`Passer au thème ${theme === 'light' ? 'sombre' : 'clair'}`}
        >
          {theme === 'light' ? (
            <Moon className="w-6 h-6" />
          ) : (
            <Sun className="w-6 h-6" />
          )}
        </button>
      </div>

      {/* Messages */}
      {message.text && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-4 rounded-lg flex items-center gap-3 ${
            message.type === 'success'
              ? 'bg-green-50 border border-green-200'
              : 'bg-red-50 border border-red-200'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-green-600" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600" />
          )}
          <p className={message.type === 'success' ? 'text-green-800' : 'text-red-800'}>
            {message.text}
          </p>
        </motion.div>
      )}

      {/* Section Avatar et Infos de Base */}
      <Card>
        <CardHeader>
          <CardTitle>Avatar</CardTitle>
          <CardDescription>Choisissez votre avatar</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            {/* Avatar actuel */}
            <div className="flex items-center gap-6">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-4xl shadow-lg">
                {selectedAvatar || '🙂'}
              </div>
              <div className="flex-1">
                <p className="font-medium text-lg">{profile?.first_name} {profile?.last_name}</p>
                <p className="text-sm text-muted-foreground">
                  {profile?.role === 'admin' || profile?.role === 'school_admin' ? 'Administrateur' : profile?.role === 'teacher' ? 'Professeur' : 'Élève'}
                </p>
              </div>
              <button
                onClick={() => setShowAvatarList(!showAvatarList)}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
              >
                {showAvatarList ? 'Fermer' : 'Changer'}
              </button>
            </div>

            {/* Liste d'avatars */}
            {showAvatarList && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="pt-4 border-t"
              >
                <div className="grid grid-cols-6 sm:grid-cols-8 gap-2">
                  {AVATARS.map((avatar, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        handleAvatarSelect(avatar.emoji);
                        setShowAvatarList(false);
                      }}
                      className={`p-3 rounded-lg flex items-center justify-center text-3xl transition-all ${
                        selectedAvatar === avatar.emoji
                          ? 'bg-primary ring-2 ring-primary ring-offset-2 scale-110'
                          : 'bg-muted hover:bg-muted/80 hover:scale-105'
                      }`}
                    >
                      {avatar.emoji}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Section Informations Personnelles */}
      <Card>
        <CardHeader>
          <CardTitle>Informations Personnelles</CardTitle>
          <CardDescription>Mettez à jour vos informations de profil</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={updateProfile} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium block mb-2">Prénom</label>
                <input
                  type="text"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled
                />
                <p className="text-xs text-muted-foreground mt-1">Non modifiable</p>
              </div>
              <div>
                <label className="text-sm font-medium block mb-2">Nom</label>
                <input
                  type="text"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled
                />
                <p className="text-xs text-muted-foreground mt-1">Non modifiable</p>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium block mb-2">Téléphone</label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleInputChange}
                placeholder="+212 6XX XXX XXX"
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {loading ? 'Enregistrement...' : 'Enregistrer les modifications'}
            </button>
          </form>
        </CardContent>
      </Card>

      {/* Section Sécurité */}
      <Card>
        <CardHeader>
          <CardTitle>Sécurité</CardTitle>
          <CardDescription>Gérez votre mot de passe et vos paramètres de sécurité</CardDescription>
        </CardHeader>
        <CardContent>
          {!showPasswordForm ? (
            <button
              onClick={() => setShowPasswordForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
            >
              <Lock className="w-4 h-4" />
              Changer le mot de passe
            </button>
          ) : (
            <form onSubmit={updatePassword} className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-2">Mot de passe actuel</label>
                <div className="relative">
                  <input
                    type={showPasswords.current ? 'text' : 'password'}
                    name="currentPassword"
                    value={passwordData.currentPassword}
                    onChange={handlePasswordChange}
                    placeholder="Entrez votre mot de passe actuel"
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords(prev => ({ ...prev, current: !prev.current }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPasswords.current ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">Nouveau mot de passe</label>
                <div className="relative">
                  <input
                    type={showPasswords.new ? 'text' : 'password'}
                    name="newPassword"
                    value={passwordData.newPassword}
                    onChange={handlePasswordChange}
                    placeholder="Entrez votre nouveau mot de passe"
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords(prev => ({ ...prev, new: !prev.new }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPasswords.new ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {/* Critères de sécurité */}
                {passwordData.newPassword && (
                  <div className="mt-3 p-3 bg-gray-50 rounded-lg space-y-2">
                    <p className="text-xs font-medium text-gray-700">Critères de sécurité:</p>
                    <div className="space-y-1 text-xs">
                      <p className={validatePassword(passwordData.newPassword).requirements.isLongEnough ? 'text-green-600' : 'text-gray-600'}>
                        {validatePassword(passwordData.newPassword).requirements.isLongEnough ? '✅' : '⬜'} Au moins 8 caractères
                      </p>
                      <p className={validatePassword(passwordData.newPassword).requirements.hasLetters ? 'text-green-600' : 'text-gray-600'}>
                        {validatePassword(passwordData.newPassword).requirements.hasLetters ? '✅' : '⬜'} Au moins une lettre
                      </p>
                      <p className={validatePassword(passwordData.newPassword).requirements.hasNumbers ? 'text-green-600' : 'text-gray-600'}>
                        {validatePassword(passwordData.newPassword).requirements.hasNumbers ? '✅' : '⬜'} Au moins un chiffre
                      </p>
                      <p className={validatePassword(passwordData.newPassword).requirements.hasSpecialChar ? 'text-green-600' : 'text-gray-600'}>
                        {validatePassword(passwordData.newPassword).requirements.hasSpecialChar ? '✅' : '⬜'} Au moins un caractère spécial (!@#$%^&*)
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">Confirmer le mot de passe</label>
                <div className="relative">
                  <input
                    type={showPasswords.confirm ? 'text' : 'password'}
                    name="confirmPassword"
                    value={passwordData.confirmPassword}
                    onChange={handlePasswordChange}
                    placeholder="Confirmez votre nouveau mot de passe"
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords(prev => ({ ...prev, confirm: !prev.confirm }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPasswords.confirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  <Lock className="w-4 h-4" />
                  {loading ? 'Changement...' : 'Changer le mot de passe'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordForm(false);
                    setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Annuler
                </button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Section Préférences */}
      <Card>
        <CardHeader>
          <CardTitle>Préférences</CardTitle>
          <CardDescription>Personnalisez votre expérience</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div>
              <p className="font-medium">Thème</p>
              <p className="text-sm text-muted-foreground">
                {theme === 'light' ? 'Clair' : 'Sombre'}
              </p>
            </div>
            <button
              onClick={handleThemeChange}
              className="p-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
            >
              {theme === 'light' ? (
                <Moon className="w-5 h-5" />
              ) : (
                <Sun className="w-5 h-5" />
              )}
            </button>
          </div>

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-900">
              💡 Conseil: Utilisez le thème sombre pour réduire la fatigue oculaire lors de longues sessions d'étude.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Section Compte */}
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="text-red-600">Zone de Danger</CardTitle>
          <CardDescription>Actions irréversibles</CardDescription>
        </CardHeader>
        <CardContent>
          <button
            onClick={signOut}
            className="w-full px-4 py-2 bg-red-50 border border-red-200 text-red-600 rounded-lg hover:bg-red-100 transition-colors font-medium"
          >
            Déconnexion
          </button>
        </CardContent>
      </Card>
    </div>
  );
};

export default StudentProfile;
