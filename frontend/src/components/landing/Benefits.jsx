import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Users, GraduationCap, Heart, Bus } from 'lucide-react';

const roleImages = {
  'Administration': '/images/dahboard-centralise.png',
  'Professeurs': '/images/suivie-rapide-prof.png',
  'Parents': '/images/arabe-discussion.png',
  'Élèves': '/images/rapport-journalier.png',
  'Chauffeurs': '/images/dahboard-centralise.png'
};

const benefitsData = [
  {
    role: 'Administration',
    icon: Shield,
    color: 'navy',
    benefits: [
      { title: 'Vue centralisée', description: 'Pédagogie, transport, finance et communication dans un seul tableau de bord' },
      { title: 'Création de comptes auto', description: 'Identifiants parents générés automatiquement et envoyés par WhatsApp' },
      { title: 'Audit & traçabilité', description: 'Historique complet des actions et des notifications envoyées' },
      { title: 'Multi-rôles', description: 'Délégation à des responsables pédagogiques et financiers' }
    ]
  },
  {
    role: 'Professeurs',
    icon: GraduationCap,
    color: 'teal',
    benefits: [
      { title: 'Suivi Rapide', description: 'Présence, comportement, cahier et participation en quelques clics par séance' },
      { title: 'Contrôles & devoirs', description: 'Saisie des notes, devoirs avec soumissions et statistiques de classe' },
      { title: 'Documents pédagogiques', description: 'Partage de fiches et corrigés avec stats de vues et téléchargements' },
      { title: 'Cahier de texte & planificateur', description: 'Préparation des séances et calendrier de classe partagé' }
    ]
  },
  {
    role: 'Parents',
    icon: Users,
    color: 'coral',
    benefits: [
      { title: 'Portail dédié', description: 'Un compte par parent, plusieurs enfants suivis en un seul endroit' },
      { title: 'Notifications WhatsApp', description: 'Absences, contrôles, montée bus et arrivée à l\'école automatiques' },
      { title: 'Suivi complet', description: 'Devoirs par matière, notes, suivi pédagogique, documents, emploi du temps' },
      { title: 'Transport en direct', description: 'Position du bus sur la carte + notifications à chaque étape' }
    ]
  },
  {
    role: 'Élèves',
    icon: Heart,
    color: 'gold',
    benefits: [
      { title: 'Gamification', description: 'Badges, système de niveaux et tableau personnel motivant' },
      { title: 'Devoirs en ligne', description: 'Réception des consignes et soumission directe depuis l\'app' },
      { title: 'Documents de cours', description: 'Téléchargement des fiches et corrigés partagés par les profs' },
      { title: 'Suivi personnel', description: 'Notes, présences et emploi du temps accessibles à tout moment' }
    ]
  },
  {
    role: 'Chauffeurs',
    icon: Bus,
    color: 'navy',
    benefits: [
      { title: 'Tournée guidée', description: 'Liste ordonnée des élèves avec drag-and-drop, bannière élève courant' },
      { title: 'Navigation externe', description: 'Ouverture directe dans Google Maps ou Waze d\'un seul clic' },
      { title: 'Marquage simple', description: 'Boutons Monté / Déposé / Absent avec notifications WhatsApp auto aux parents' },
      { title: 'GPS partagé', description: 'Position envoyée toutes les 5s, vue admin et parents en temps réel' }
    ]
  }
];

const Benefits = () => {
  const [activeTab, setActiveTab] = useState(0);

  const colorClasses = {
    navy: 'bg-[#173A59] text-[#173A59] border-[#173A59]',
    teal: 'bg-[#2A9D8F] text-[#2A9D8F] border-[#2A9D8F]',
    coral: 'bg-[#E66F51] text-[#E66F51] border-[#E66F51]',
    gold: 'bg-[#E8B447] text-[#E8B447] border-[#E8B447]'
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
            className="grid lg:grid-cols-2 gap-10 max-w-5xl mx-auto items-center"
          >
            {/* Benefits list */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            </div>

            {/* Screenshot for active role */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
              className="hidden lg:block rounded-2xl overflow-hidden shadow-2xl border border-gray-100 dark:border-gray-700"
            >
              <img
                src={roleImages[benefitsData[activeTab].role]}
                alt={`Boussoule - ${benefitsData[activeTab].role}`}
                className="w-full h-72 object-cover object-top"
              />
              <div className="bg-white dark:bg-gray-800 px-4 py-3 text-center">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                  {benefitsData[activeTab].role} — Interface dédiée
                </p>
              </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
};

export default Benefits;
