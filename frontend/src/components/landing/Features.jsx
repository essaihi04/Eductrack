import { motion } from 'framer-motion';
import { Clock, BookOpen, MessageCircle, TrendingUp, Calendar, Award } from 'lucide-react';

const screenshots = [
  {
    src: '/images/suivie-rapide-prof.png',
    title: 'Suivi Rapide Professeur',
    desc: 'Interface intuitive pour enregistrer présences et comportements en quelques clics'
  },
  {
    src: '/images/rapport-journalier.png',
    title: 'Rapport Journalier',
    desc: 'Rapports automatiques générés chaque jour pour un suivi précis'
  },
  {
    src: '/images/discussion-parent.png',
    title: 'Communication Parents',
    desc: 'Espace dédié à la communication directe avec les familles'
  }
];

const features = [
  {
    icon: Clock,
    title: 'Suivi en Temps Réel',
    description: 'Présences et retards instantanés, évaluation du comportement, contrôle des cahiers',
    color: 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300'
  },
  {
    icon: BookOpen,
    title: 'Gestion des Évaluations',
    description: 'Contrôles et mini-évaluations, devoirs avec soumissions en ligne, notes automatisées',
    color: 'bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-300'
  },
  {
    icon: MessageCircle,
    title: 'Communication Parents',
    description: 'WhatsApp intégré, notifications automatiques, rapports personnalisés',
    color: 'bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-300'
  },
  {
    icon: TrendingUp,
    title: 'Tableaux de Bord Intelligents',
    description: 'Statistiques en temps réel, alertes automatiques, rapports détaillés',
    color: 'bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300'
  },
  {
    icon: Calendar,
    title: 'Planification Simplifiée',
    description: 'Emplois du temps automatiques, calendrier de classe, planificateur de contrôles',
    color: 'bg-orange-100 dark:bg-orange-900 text-orange-600 dark:text-orange-300'
  },
  {
    icon: Award,
    title: 'Gamification pour Élèves',
    description: 'Badges et récompenses, système de niveaux, motivation accrue',
    color: 'bg-pink-100 dark:bg-pink-900 text-pink-600 dark:text-pink-300'
  }
];

const Features = () => {
  return (
    <section className="py-20 bg-white dark:bg-gray-900">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
            Fonctionnalités Principales
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Tout ce dont vous avez besoin pour gérer votre école efficacement
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              whileHover={{ y: -5, transition: { duration: 0.2 } }}
              className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-shadow"
            >
              <div className={`w-14 h-14 ${feature.color} rounded-xl flex items-center justify-center mb-4`}>
                <feature.icon className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
                {feature.title}
              </h3>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Screenshots galerie */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-20"
        >
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white text-center mb-10">
            L'application en action
          </h3>
          <div className="grid md:grid-cols-3 gap-6">
            {screenshots.map((shot, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.15 }}
                whileHover={{ y: -6, transition: { duration: 0.2 } }}
                className="rounded-2xl overflow-hidden shadow-xl bg-white dark:bg-gray-800"
              >
                <img
                  src={shot.src}
                  alt={shot.title}
                  className="w-full h-52 object-cover object-top"
                />
                <div className="p-4">
                  <h4 className="font-bold text-gray-900 dark:text-white mb-1">{shot.title}</h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{shot.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default Features;
