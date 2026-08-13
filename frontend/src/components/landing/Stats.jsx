import { useEffect, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { Layers, Users, Target, Smartphone } from 'lucide-react';

const stats = [
  {
    icon: Layers,
    value: 10,
    suffix: '+',
    label: 'Modules intégrés',
    description: 'Pédagogie, transport, finance, parents…',
    color: 'from-[#2A9D8F] to-[#247F76]'
  },
  {
    icon: Users,
    value: 6,
    suffix: '',
    label: 'Rôles utilisateurs',
    description: 'Admin, prof, parent, élève, chauffeur, responsable',
    color: 'from-[#E66F51] to-[#C94F35]'
  },
  {
    icon: Target,
    value: 30,
    suffix: 's',
    label: 'Prise de présence',
    description: 'Pour une classe entière',
    color: 'from-[#E8B447] to-[#CE8D1E]'
  },
  {
    icon: Smartphone,
    value: 3,
    suffix: '',
    label: 'Plateformes',
    description: 'Web, Android (APK), Desktop',
    color: 'from-[#5A83A0] to-[#173A59]'
  }
];

const AnimatedCounter = ({ value, suffix, duration = 2000 }) => {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (!isInView) return;

    let startTime;
    let animationFrame;

    const animate = (currentTime) => {
      if (!startTime) startTime = currentTime;
      const progress = Math.min((currentTime - startTime) / duration, 1);
      
      setCount(Math.floor(progress * value));

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [isInView, value, duration]);

  return (
    <span ref={ref} className="tabular-nums">
      {count}{suffix}
    </span>
  );
};

const Stats = () => {
  return (
    <section className="py-20 bg-gradient-to-br from-[#173A59] via-[#204D63] to-[#2A9D8F] dark:from-[#102638] dark:to-[#173A59]">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Une plateforme complète
          </h2>
          <p className="text-xl text-[#D8E7E4] max-w-2xl mx-auto">
            Conçue pour couvrir toute la chaîne de la vie scolaire
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="text-center"
              >
                <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 hover:bg-white/20 transition-all">
                  <div className={`w-16 h-16 bg-gradient-to-br ${stat.color} rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg`}>
                    <Icon className="w-8 h-8 text-white" />
                  </div>
                  
                  <div className="text-5xl font-bold text-white mb-2">
                    <AnimatedCounter value={stat.value} suffix={stat.suffix} />
                  </div>
                  
                  <h3 className="text-lg font-semibold text-white mb-1">
                    {stat.label}
                  </h3>
                  
                  <p className="text-[#D8E7E4] text-sm">
                    {stat.description}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default Stats;
