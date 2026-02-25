import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Users, GraduationCap, Heart } from 'lucide-react';

const benefitsData = [
  {
    role: 'Administration',
    icon: Shield,
    color: 'blue',
    benefits: [
      { title: 'Gain de temps', description: '-70% sur les tâches administratives' },
      { title: 'Vue d\'ensemble', description: 'Complète de l\'école en temps réel' },
      { title: 'Décisions éclairées', description: 'Basées sur les données précises' },
      { title: 'Communication efficace', description: 'Avec toute la communauté scolaire' }
    ]
  },
  {
    role: 'Professeurs',
    icon: GraduationCap,
    color: 'green',
    benefits: [
      { title: 'Interface intuitive', description: 'Rapide et facile à utiliser' },
      { title: 'Moins de paperasse', description: 'Tout est numérisé et centralisé' },
      { title: 'Plus de temps', description: 'Pour l\'enseignement et les élèves' },
      { title: 'Suivi précis', description: 'De chaque élève individuellement' }
    ]
  },
  {
    role: 'Parents',
    icon: Users,
    color: 'purple',
    benefits: [
      { title: 'Transparence totale', description: 'Sur le parcours de leur enfant' },
      { title: 'Notifications instantanées', description: 'En temps réel via WhatsApp' },
      { title: 'Communication directe', description: 'Avec les professeurs et l\'école' },
      { title: 'Suivi des progrès', description: 'Détaillé et accessible 24/7' }
    ]
  },
  {
    role: 'Élèves',
    icon: Heart,
    color: 'pink',
    benefits: [
      { title: 'Motivation accrue', description: 'Par la gamification et badges' },
      { title: 'Accès facile', description: 'Aux devoirs et documents de cours' },
      { title: 'Suivi personnel', description: 'De leurs progrès et objectifs' },
      { title: 'Responsabilisation', description: 'Dans leur parcours scolaire' }
    ]
  }
];

const Benefits = () => {
  const [activeTab, setActiveTab] = useState(0);

  const colorClasses = {
    blue: 'bg-blue-500 text-blue-500 border-blue-500',
    green: 'bg-green-500 text-green-500 border-green-500',
    purple: 'bg-purple-500 text-purple-500 border-purple-500',
    pink: 'bg-pink-500 text-pink-500 border-pink-500'
  };

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
            Bénéfices pour Tous
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Une solution qui profite à toute la communauté éducative
          </p>
        </motion.div>

        {/* Tabs */}
        <div className="flex flex-wrap justify-center gap-4 mb-12">
          {benefitsData.map((benefit, index) => {
            const Icon = benefit.icon;
            const isActive = activeTab === index;
            return (
              <motion.button
                key={index}
                onClick={() => setActiveTab(index)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={`flex items-center gap-3 px-6 py-3 rounded-xl font-semibold transition-all ${
                  isActive
                    ? `${colorClasses[benefit.color].split(' ')[0]} text-white shadow-lg`
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>Pour {benefit.role}</span>
              </motion.button>
            );
          })}
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto"
          >
            {benefitsData[activeTab].benefits.map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="bg-gray-50 dark:bg-gray-800 rounded-xl p-6 hover:shadow-lg transition-shadow"
              >
                <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                  {item.title}
                </h4>
                <p className="text-gray-600 dark:text-gray-400">
                  {item.description}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
};

export default Benefits;
