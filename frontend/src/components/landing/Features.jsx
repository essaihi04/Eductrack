import { motion } from 'framer-motion';
import { Clock, BookOpen, MessageCircle, TrendingUp, Calendar, Award, Bus, Wallet, FolderOpen, Users } from 'lucide-react';

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
    title: 'Suivi Rapide en classe',
    description: 'Présence, retards, comportement, contrôle des cahiers et participation enregistrés en quelques clics par séance',
    color: 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300'
  },
  {
    icon: BookOpen,
    title: 'Contrôles & Devoirs',
    description: 'Saisie des notes par contrôle, mini-évaluations, devoirs avec soumissions et statistiques de classe',
    color: 'bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-300'
  },
  {
    icon: Bus,
    title: 'Transport scolaire GPS',
    description: 'Suivi temps réel des bus, 4 directions de tournée, notifications montée/dépose, Google Maps & Waze pour les chauffeurs',
    color: 'bg-amber-100 dark:bg-amber-900 text-amber-600 dark:text-amber-300'
  },
  {
    icon: Wallet,
    title: 'Gestion financière',
    description: 'Modèles de frais, génération de factures, suivi des impayés et relances WhatsApp automatiques',
    color: 'bg-emerald-100 dark:bg-emerald-900 text-emerald-600 dark:text-emerald-300'
  },
  {
    icon: MessageCircle,
    title: 'WhatsApp intégré',
    description: 'Notifications automatiques par catégorie (pédagogique, transport, finance) et chatbot pédagogique pour les parents',
    color: 'bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-300'
  },
  {
    icon: Users,
    title: 'Portail Parents',
    description: 'Compte automatique par parent : suivi de chaque enfant (devoirs, notes, suivi, documents, emploi du temps, transport en direct)',
    color: 'bg-rose-100 dark:bg-rose-900 text-rose-600 dark:text-rose-300'
  },
  {
    icon: FolderOpen,
    title: 'Documents pédagogiques',
    description: 'Partage de fiches, cours et corrigés avec parents et élèves, suivi des vues et téléchargements par enfant',
    color: 'bg-cyan-100 dark:bg-cyan-900 text-cyan-600 dark:text-cyan-300'
  },
  {
    icon: TrendingUp,
    title: 'Tableaux de bord',
    description: 'Statistiques classe & élève, heatmap comportementale, alertes automatiques pour la direction',
    color: 'bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300'
  },
  {
    icon: Calendar,
    title: 'Planification',
    description: 'Emplois du temps, cahier de texte, planificateur de contrôles, calendrier de classe partagé',
    color: 'bg-orange-100 dark:bg-orange-900 text-orange-600 dark:text-orange-300'
  },
  {
    icon: Award,
    title: 'Gamification élèves',
    description: 'Badges, système de niveaux et tableau personnel pour motiver les élèves au quotidien',
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
