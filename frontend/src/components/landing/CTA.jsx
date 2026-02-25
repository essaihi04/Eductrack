import { motion } from 'framer-motion';
import { ArrowRight, MessageCircle, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/Button';

const features = [
  'Essai gratuit 30 jours',
  'Sans engagement',
  'Support dédié en français',
  'Formation incluse'
];

const CTA = () => {
  const navigate = useNavigate();

  const handleWhatsAppClick = () => {
    window.open('https://wa.me/212641998700?text=Bonjour,%20je%20souhaite%20une%20démo%20personnalisée%20d\'EduTrack', '_blank');
  };

  return (
    <section className="py-20 bg-gradient-to-br from-gray-50 to-blue-50 dark:from-gray-900 dark:to-blue-950">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="max-w-4xl mx-auto"
        >
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-12 md:p-16 text-center">
              <motion.h2
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 }}
                className="text-4xl md:text-5xl font-bold text-white mb-6"
              >
                Prêt à Moderniser Votre École ?
              </motion.h2>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3 }}
                className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto"
              >
                Rejoignez les écoles qui ont déjà transformé leur gestion avec EduTrack
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.4 }}
                className="grid md:grid-cols-2 gap-4 mb-10 max-w-2xl mx-auto"
              >
                {features.map((feature, index) => (
                  <div key={index} className="flex items-center gap-3 text-white">
                    <CheckCircle className="w-5 h-5 text-green-300 flex-shrink-0" />
                    <span className="text-left">{feature}</span>
                  </div>
                ))}
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.5 }}
                className="flex flex-col sm:flex-row gap-4 justify-center"
              >
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Button
                    onClick={() => navigate('/login')}
                    size="lg"
                    className="w-full sm:w-auto text-lg px-10 py-6 bg-white text-blue-600 hover:bg-gray-100 shadow-xl"
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
                    className="w-full sm:w-auto text-lg px-10 py-6 border-2 border-white text-white hover:bg-white/10 shadow-xl"
                  >
                    <MessageCircle className="mr-2 w-5 h-5" />
                    Demander une Démo
                  </Button>
                </motion.div>
              </motion.div>

              <motion.p
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.6 }}
                className="text-blue-100 text-sm mt-6"
              >
                Aucune carte bancaire requise • Configuration en 5 minutes
              </motion.p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default CTA;
