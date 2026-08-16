import { motion } from 'framer-motion';
import { ArrowRight, MessageCircle, GraduationCap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/Button';

const Hero = () => {
  const navigate = useNavigate();

  const handleWhatsAppClick = () => {
    window.open('https://wa.me/212641998700?text=Bonjour,%20je%20souhaite%20en%20savoir%20plus%20sur%20Bousole', '_blank');
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-blue-900 dark:to-indigo-900 overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-400/20 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-400/20 rounded-full blur-3xl"></div>
      </div>

      <div className="container mx-auto px-4 py-20 relative z-10">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          {/* Left content */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center md:text-left"
          >
            {/* Logo/Badge */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: 'spring' }}
              className="inline-flex items-center justify-center mb-6"
            >
              <img 
                src="/brand/boussoule-logo.png"
                alt="Logo Bousole"
                className="w-24 h-24 object-contain"
              />
            </motion.div>

            <h1 className="text-5xl md:text-6xl font-bold text-gray-900 dark:text-white mb-6 leading-tight">
              Toute votre école dans{' '}
              <span className="text-primary">une seule plateforme</span>
            </h1>

            <p className="text-xl text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">
              Suivi pédagogique, transport scolaire GPS, gestion financière, communication WhatsApp et portail parents — un système unifié pour la direction, les professeurs, les chauffeurs, les parents et les élèves.
            </p>

            {/* Pills modules */}
            <div className="flex flex-wrap gap-2 mb-8 justify-center md:justify-start">
              {['Pédagogique', 'Transport GPS', 'Finance', 'WhatsApp', 'Portail Parents'].map((m) => (
                <span key={m} className="px-3 py-1 rounded-full text-xs font-semibold bg-white/70 dark:bg-gray-800/70 backdrop-blur text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 shadow-sm">
                  {m}
                </span>
              ))}
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start">
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Button
                  onClick={() => navigate('/login')}
                  size="lg"
                  className="w-full sm:w-auto text-lg px-8 py-6 shadow-xl"
                >
                  Commencer Gratuitement
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </motion.div>

              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Button
                  onClick={handleWhatsAppClick}
                  variant="outline"
                  size="lg"
                  className="w-full sm:w-auto text-lg px-8 py-6 border-2 border-green-500 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"
                >
                  <MessageCircle className="mr-2 w-5 h-5" />
                  Contactez-nous
                </Button>
              </motion.div>
            </div>

            {/* Trust indicators */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="mt-8 flex items-center gap-6 justify-center md:justify-start text-sm text-gray-600 dark:text-gray-400"
            >
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span>Essai gratuit 30 jours</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span>Sans engagement</span>
              </div>
            </motion.div>
          </motion.div>

          {/* Right illustration — vrai screenshot dashboard */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="hidden md:flex flex-col items-center gap-4"
          >
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              className="relative w-full"
            >
              <img
                src="/images/dahboard-centralise.png"
                alt="Dashboard centralisé Bousole"
                className="w-full rounded-2xl shadow-2xl border-4 border-white/60 dark:border-gray-700"
              />
              <div className="absolute -bottom-4 -right-4 bg-white dark:bg-gray-800 rounded-xl shadow-xl px-4 py-2 flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Tableau de bord en direct</span>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
