import { motion } from 'framer-motion';
import Hero from '../components/landing/Hero';
import Features from '../components/landing/Features';
import HowItWorks from '../components/landing/HowItWorks';
import Benefits from '../components/landing/Benefits';
import Stats from '../components/landing/Stats';
import CTA from '../components/landing/CTA';
import LandingFooter from '../components/landing/LandingFooter';
import WhatsAppButton from '../components/landing/WhatsAppButton';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, LogIn } from 'lucide-react';
import { Button } from '../components/ui/Button';

const LandingPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      {/* Navigation */}
      <motion.nav
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        className="fixed top-0 left-0 right-0 z-40 bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg border-b border-gray-200 dark:border-gray-800"
      >
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
              <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                <GraduationCap className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold text-gray-900 dark:text-white">EduTrack</span>
            </div>

            {/* Navigation Links */}
            <div className="hidden md:flex items-center gap-8">
              <button
                onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
                className="text-gray-600 dark:text-gray-300 hover:text-primary transition-colors"
              >
                Fonctionnalités
              </button>
              <button
                onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
                className="text-gray-600 dark:text-gray-300 hover:text-primary transition-colors"
              >
                Comment ça marche
              </button>
              <button
                onClick={() => document.getElementById('benefits')?.scrollIntoView({ behavior: 'smooth' })}
                className="text-gray-600 dark:text-gray-300 hover:text-primary transition-colors"
              >
                Bénéfices
              </button>
            </div>

            {/* Login Button */}
            <Button
              onClick={() => navigate('/login')}
              variant="outline"
              className="flex items-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              Se Connecter
            </Button>
          </div>
        </div>
      </motion.nav>

      {/* Main Content */}
      <main className="pt-16">
        <Hero />
        
        <div id="features">
          <Features />
        </div>
        
        <div id="how-it-works">
          <HowItWorks />
        </div>
        
        <div id="benefits">
          <Benefits />
        </div>
        
        <Stats />
        
        <CTA />
      </main>

      {/* Footer */}
      <LandingFooter />

      {/* WhatsApp Floating Button */}
      <WhatsAppButton />
    </div>
  );
};

export default LandingPage;
