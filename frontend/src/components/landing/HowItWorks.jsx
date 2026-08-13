import { motion } from 'framer-motion';
import { UserPlus, Settings, Rocket, MessageCircle } from 'lucide-react';

const steps = [
  {
    icon: UserPlus,
    title: 'Création de l\'école',
    description: 'L\'admin crée l\'école, les classes et importe les élèves, professeurs et parents en masse (Excel).',
    step: '01'
  },
  {
    icon: Settings,
    title: 'Configuration des modules',
    description: 'Emploi du temps, bus et tournées de transport, modèles de frais, matières et affectations des professeurs.',
    step: '02'
  },
  {
    icon: Rocket,
    title: 'Utilisation quotidienne',
    description: 'Les profs saisissent présence, notes et devoirs ; les chauffeurs marquent les montées ; la finance émet les factures.',
    step: '03'
  },
  {
    icon: MessageCircle,
    title: 'Notifications automatiques',
    description: 'Les parents reçoivent en temps réel via WhatsApp les alertes pédagogiques, transport et financières, et consultent tout dans leur portail.',
    step: '04'
  }
];

const HowItWorks = () => {
  return (
    <section className="py-20 bg-gradient-to-br from-white to-[#FFF7E9] dark:from-gray-800 dark:to-[#173A59]">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
            Comment ça Marche
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Quatre étapes simples, du setup initial aux notifications WhatsApp automatiques
          </p>
        </motion.div>

        <div className="relative">
          {/* Connection line */}
          <div className="hidden lg:block absolute top-1/2 left-0 right-0 h-1 bg-gradient-to-r from-[#E66F51]/30 via-[#E8B447]/40 to-[#2A9D8F]/40 transform -translate-y-1/2"></div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 relative">
            {steps.map((step, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.2 }}
                className="relative"
              >
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-xl hover:shadow-2xl transition-shadow relative z-10">
                  {/* Step number */}
                  <div className="absolute -top-6 -right-6 w-16 h-16 bg-gradient-to-br from-[#E66F51] to-[#D85A3E] rounded-full flex items-center justify-center shadow-lg">
                    <span className="text-white font-bold text-xl">{step.step}</span>
                  </div>

                  {/* Icon */}
                  <div className="w-16 h-16 bg-gradient-to-br from-[#2A9D8F]/15 to-[#E8B447]/20 dark:from-[#2A9D8F]/30 dark:to-[#E8B447]/20 rounded-xl flex items-center justify-center mb-6">
                    <step.icon className="w-8 h-8 text-[#2A9D8F] dark:text-[#7DD3C7]" />
                  </div>

                  {/* Content */}
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                    {step.title}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
