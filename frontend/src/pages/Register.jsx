import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { UserPlus, Mail, Lock, User, ShieldCheck, Sparkles } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/ui/Card';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const Register = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'student',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (formData.password !== formData.confirmPassword) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          password: formData.password,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Impossible de créer le compte');
      }

      setSuccess('Compte créé avec succès ! Redirection vers la connexion...');
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-slate-950 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/20 via-slate-900 to-slate-950" />
      <div className="absolute -top-32 -right-16 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl" />
      <div className="absolute -bottom-32 -left-16 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />

      <div className="relative z-10 flex flex-col lg:flex-row gap-10 items-stretch px-6 py-12 lg:px-16">
        <motion.section
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="lg:w-2/5 text-white space-y-8"
        >
          <div>
            <div className="inline-flex items-center gap-3 bg-white/10 border border-white/20 rounded-full px-4 py-2 text-sm">
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Plateforme éducative intelligente</span>
            </div>
            <h1 className="mt-6 text-4xl lg:text-5xl font-semibold leading-tight">
              Créez votre espace Boussoule
            </h1>
            <p className="mt-4 text-lg text-white/80">
              Rejoignez la plateforme de suivi pédagogique qui unifie présence, comportement, devoirs et
              accompagnement IA dans une seule interface.
            </p>
          </div>

          <div className="grid gap-4">
            {['Suivi des progrès en temps réel', 'Automatisation des rappels et devoirs', 'Assistant IA pédagogique'].map(
              (feature) => (
                <div key={feature} className="flex items-center gap-3 text-white/80">
                  <div className="w-2 h-10 bg-gradient-to-b from-indigo-400 to-cyan-400 rounded-full" />
                  <p>{feature}</p>
                </div>
              )
            )}
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="lg:w-3/5"
        >
          <Card className="bg-white/90 backdrop-blur shadow-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <UserPlus className="w-6 h-6 text-primary" />
                Création de compte
              </CardTitle>
              <CardDescription>
                Choisissez votre rôle, complétez vos informations puis accédez à votre tableau de bord personnalisé.
              </CardDescription>
            </CardHeader>

            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-6">
                {error && (
                  <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {error}
                  </div>
                )}
                {success && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    {success}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label htmlFor="firstName" className="text-sm font-medium text-gray-700">
                      Prénom
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        id="firstName"
                        name="firstName"
                        placeholder="Marie"
                        value={formData.firstName}
                        onChange={handleChange}
                        className="pl-9"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="lastName" className="text-sm font-medium text-gray-700">
                      Nom
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        id="lastName"
                        name="lastName"
                        placeholder="Dupont"
                        value={formData.lastName}
                        onChange={handleChange}
                        className="pl-9"
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium text-gray-700">
                    Email professionnel
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="vous@ecole.com"
                      value={formData.email}
                      onChange={handleChange}
                      className="pl-9"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label htmlFor="password" className="text-sm font-medium text-gray-700">
                      Mot de passe
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        id="password"
                        name="password"
                        type="password"
                        placeholder="••••••••"
                        value={formData.password}
                        onChange={handleChange}
                        className="pl-9"
                        required
                        minLength={8}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="confirmPassword" className="text-sm font-medium text-gray-700">
                      Confirmer le mot de passe
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        id="confirmPassword"
                        name="confirmPassword"
                        type="password"
                        placeholder="••••••••"
                        value={formData.confirmPassword}
                        onChange={handleChange}
                        className="pl-9"
                        required
                        minLength={8}
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/60 bg-gradient-to-br from-blue-500/10 to-indigo-500/10 px-4 py-4">
                  <p className="font-semibold text-gray-900 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-primary" />
                    Compte élève
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    L'inscription en ligne crée un compte élève. Les comptes
                    professeurs et personnels sont créés par l'administration
                    de l'établissement.
                  </p>
                </div>

                <ul className="text-xs text-gray-500 space-y-1">
                  <li>• Minimum 8 caractères avec majuscule et caractère spécial.</li>
                  <li>• Un email de confirmation pourra être demandé selon la politique de l’établissement.</li>
                </ul>
              </CardContent>

              <CardFooter className="flex flex-col gap-4">
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Création du compte...' : 'Créer mon compte'}
                </Button>
                <p className="text-sm text-muted-foreground text-center">
                  Déjà inscrit ?{' '}
                  <Link to="/login" className="text-primary font-medium hover:underline">
                    Retour à la connexion
                  </Link>
                </p>
              </CardFooter>
            </form>
          </Card>
        </motion.section>
      </div>
    </div>
  );
};

export default Register;
