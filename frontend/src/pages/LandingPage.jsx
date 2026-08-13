import { motion } from 'framer-motion';
import ChatbotHero from '../components/landing/ChatbotHero';
import Features from '../components/landing/Features';
import AutoMessages from '../components/landing/AutoMessages';
import TransportTracking from '../components/landing/TransportTracking';
import HowItWorks from '../components/landing/HowItWorks';
import Benefits from '../components/landing/Benefits';
import Stats from '../components/landing/Stats';
import CTA from '../components/landing/CTA';
import LandingFooter from '../components/landing/LandingFooter';
import WhatsAppButton from '../components/landing/WhatsAppButton';
import { useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { Button } from '../components/ui/Button';
import BrandLogo from '../components/BrandLogo';

const LandingPage = () => {
  const navigate = useNavigate();

  return (
    <div className="brand-landing min-h-screen bg-[#FFF7E9] dark:bg-gray-900">
      {/* Navigation */}
      <motion.nav
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        className="fixed top-0 left-0 right-0 z-40 bg-[#FFF7E9]/90 dark:bg-[#173A59]/95 backdrop-blur-xl border-b border-[#173A59]/10 dark:border-white/10 shadow-[0_8px_30px_rgba(23,58,89,0.06)]"
      >
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <button
              type="button"
              className="cursor-pointer"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              aria-label="Revenir en haut de la page Boussoule"
            >
              <BrandLogo iconClassName="h-12 w-12" showTagline taglineClassName="hidden sm:block" />
            </button>

            {/* Navigation Links */}
            <div className="hidden md:flex items-center gap-8">
              <button
                onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
                className="text-[#173A59]/75 dark:text-gray-200 hover:text-[#2A9D8F] font-semibold transition-colors"
              >
                Fonctionnalités
              </button>
              <button
                onClick={() => document.getElementById('transport')?.scrollIntoView({ behavior: 'smooth' })}
                className="text-[#173A59]/75 dark:text-gray-200 hover:text-[#2A9D8F] font-semibold transition-colors"
              >
                Transport
              </button>
              <button
                onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
                className="text-[#173A59]/75 dark:text-gray-200 hover:text-[#2A9D8F] font-semibold transition-colors"
              >
                Comment ça marche
              </button>
              <button
                onClick={() => document.getElementById('benefits')?.scrollIntoView({ behavior: 'smooth' })}
                className="text-[#173A59]/75 dark:text-gray-200 hover:text-[#2A9D8F] font-semibold transition-colors"
              >
                Bénéfices
              </button>
              <button
                onClick={() => document.getElementById('downloads')?.scrollIntoView({ behavior: 'smooth' })}
                className="text-[#173A59]/75 dark:text-gray-200 hover:text-[#2A9D8F] font-semibold transition-colors"
              >
                Téléchargements
              </button>
            </div>

            {/* Login Button */}
            <Button
              onClick={() => navigate('/login')}
              variant="outline"
              className="flex items-center gap-2 border-[#173A59]/20 text-[#173A59] hover:bg-[#2A9D8F]/10 dark:text-white"
            >
              <LogIn className="w-4 h-4" />
              Se Connecter
            </Button>
          </div>
        </div>
      </motion.nav>

      {/* Main Content */}
      <main className="pt-16">
        <ChatbotHero />

        <div id="auto-messages">
          <AutoMessages />
        </div>

        <div id="transport">
          <TransportTracking />
        </div>

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
        
        <div id="downloads">
          <CTA />
        </div>
      </main>

      {/* Footer */}
      <LandingFooter />

      {/* WhatsApp Floating Button */}
      <WhatsAppButton />
    </div>
  );
};

export default LandingPage;
