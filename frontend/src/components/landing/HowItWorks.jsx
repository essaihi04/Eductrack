import { motion } from 'framer-motion';
import { UserPlus, Settings, Rocket } from 'lucide-react';

const steps = [
  {
    icon: UserPlus,
    title: 'Inscription Rapide',
    description: 'Créez votre compte école en 2 minutes. Ajoutez vos classes et professeurs.',
    step: '01'
  },
  {
    icon: Settings,
    title: 'Configuration Simple',
    description: 'Importez vos élèves, créez l\'emploi du temps, invitez les professeurs.',
    step: '02'
  },
  {
    icon: Rocket,
    title: 'Commencez à Suivre',
    description: 'Les professeurs enregistrent les présences, les parents reçoivent les notifications.',
    step: '03'
  }
];

const HowItWorks = () => {
  return (
    <section className="py-20 bg-gradient-to-br from-gray-50 to-blue-50 dark:from-gray-800 dark:to-gray-900">
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
            Trois étapes simples pour transformer la gestion de votre école
          </p>
        </motion.div>

        <div className="relative">
          {/* Connection line */}
          <div className="hidden lg:block absolute top-1/2 left-0 right-0 h-1 bg-gradient-to-r from-blue-200 via-indigo-200 to-purple-200 dark:from-blue-800 dark:via-indigo-800 dark:to-purple-800 transform -translate-y-1/2"></div>

          <div className="grid md:grid-cols-3 gap-8 relative">
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
                  <div className="absolute -top-6 -right-6 w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center shadow-lg">
                    <span className="text-white font-bold text-xl">{step.step}</span>
                  </div>

                  {/* Icon */}
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900 dark:to-indigo-900 rounded-xl flex items-center justify-center mb-6">
                    <step.icon className="w-8 h-8 text-blue-600 dark:text-blue-300" />
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
