import { useState } from 'react';
import { AnimatePresence, MotionConfig, motion as Motion } from 'framer-motion';
import { ArrowRight, LogIn, Menu, MessageCircle, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import BrandLogo from '../components/BrandLogo';
import LandingHero3D from '../components/landing/v2/LandingHero3D';
import SchoolDaySimulator from '../components/landing/v2/SchoolDaySimulator';
import RoleExperience from '../components/landing/v2/RoleExperience';
import CapabilitiesAndCTA from '../components/landing/v2/CapabilitiesAndCTA';

const navigation = [
  { label: 'Expérience', target: 'experience' },
  { label: 'Nouveautés', target: 'capabilities' },
  { label: 'Pour chacun', target: 'roles' },
  { label: 'Contact', target: 'contact' },
];

const LandingPage = () => {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const scrollTo = (target) => {
    const performScroll = () => document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (menuOpen) {
      window.setTimeout(performScroll, 220);
    } else {
      performScroll();
    }
    setMenuOpen(false);
  };

  const openWhatsApp = () => {
    window.open('https://wa.me/212641998700?text=Bonjour,%20je%20souhaite%20découvrir%20Boussoule%20pour%20mon%20école', '_blank', 'noopener,noreferrer');
  };

  return (
    <MotionConfig reducedMotion="user">
    <div className="boussoule-landing min-h-screen overflow-x-clip bg-[#FFF7E9] text-[#173A59]">
      <Motion.header
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="fixed inset-x-0 top-0 z-50 border-b border-[#173A59]/10 bg-[#FFF7E9]/95 shadow-[0_8px_30px_rgba(23,58,89,0.05)] backdrop-blur-xl"
      >
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Revenir en haut de la page Boussoule" className="shrink-0">
            <BrandLogo iconClassName="h-11 w-11" nameClassName="text-lg sm:text-xl" showTagline taglineClassName="hidden lg:block" />
          </button>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Navigation principale">
            {navigation.map((item) => (
              <button key={item.target} type="button" onClick={() => scrollTo(item.target)} className="rounded-xl px-4 py-2 text-sm font-extrabold text-[#173A59]/60 transition hover:bg-white/70 hover:text-[#173A59]">
                {item.label}
              </button>
            ))}
          </nav>

          <div className="hidden items-center gap-2 sm:flex">
            <button type="button" onClick={() => navigate('/login')} className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-extrabold text-[#173A59]/70 transition hover:bg-white hover:text-[#173A59]">
              <LogIn className="h-4 w-4" />
              Connexion
            </button>
            <button type="button" onClick={openWhatsApp} className="group inline-flex items-center gap-2 rounded-xl bg-[#173A59] px-4 py-2.5 text-sm font-extrabold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-[#214F74]">
              Demander une démo
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
          </div>

          <button type="button" onClick={() => setMenuOpen((open) => !open)} className="grid h-10 w-10 place-items-center rounded-xl bg-white text-[#173A59] shadow-sm ring-1 ring-[#173A59]/10 sm:hidden" aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'} aria-expanded={menuOpen}>
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        <AnimatePresence>
          {menuOpen && (
            <Motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden border-t border-[#173A59]/10 bg-[#FFF9EF] sm:hidden">
              <div className="space-y-1 px-4 py-4">
                {navigation.map((item) => (
                  <button key={item.target} type="button" onClick={() => scrollTo(item.target)} className="block w-full rounded-xl px-4 py-3 text-left text-sm font-extrabold text-[#173A59]/70 hover:bg-white">
                    {item.label}
                  </button>
                ))}
                <div className="grid grid-cols-2 gap-2 pt-3">
                  <button type="button" onClick={() => navigate('/login')} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#173A59]/10 bg-white px-3 py-3 text-sm font-extrabold text-[#173A59]"><LogIn className="h-4 w-4" />Connexion</button>
                  <button type="button" onClick={openWhatsApp} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#173A59] px-3 py-3 text-sm font-extrabold text-white"><MessageCircle className="h-4 w-4" />Démo</button>
                </div>
              </div>
            </Motion.div>
          )}
        </AnimatePresence>
      </Motion.header>

      <main>
        <LandingHero3D onStart={() => scrollTo('experience')} onRegister={() => navigate('/register')} />

        <div className="border-y border-[#173A59]/10 bg-white/80 py-5 backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-4 text-center text-xs font-extrabold uppercase tracking-[0.14em] text-[#173A59]/50 sm:px-6 lg:px-8">
            <span>Direction scolaire</span>
            <span className="hidden h-1.5 w-1.5 rounded-full bg-[#E66F51] sm:block" />
            <span>Pédagogie</span>
            <span className="hidden h-1.5 w-1.5 rounded-full bg-[#E8B447] sm:block" />
            <span>Familles</span>
            <span className="hidden h-1.5 w-1.5 rounded-full bg-[#2A9D8F] sm:block" />
            <span>Finance</span>
            <span className="hidden h-1.5 w-1.5 rounded-full bg-[#173A59] sm:block" />
            <span>Transport</span>
          </div>
        </div>

        <SchoolDaySimulator />
        <RoleExperience />
        <CapabilitiesAndCTA onRegister={() => navigate('/register')} />
      </main>
    </div>
    </MotionConfig>
  );
};

export default LandingPage;
