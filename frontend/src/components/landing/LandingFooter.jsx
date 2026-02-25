import { motion } from 'framer-motion';
import { GraduationCap, MessageCircle, Mail, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';

const LandingFooter = () => {
  const currentYear = new Date().getFullYear();

  const handleWhatsAppClick = () => {
    window.open('https://wa.me/212641998700?text=Bonjour,%20je%20souhaite%20en%20savoir%20plus%20sur%20EduTrack', '_blank');
  };

  return (
    <footer className="bg-gray-900 text-gray-300">
      <div className="container mx-auto px-4 py-12">
        <div className="grid md:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div className="col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <img 
                src="/logo.jpeg" 
                alt="EduTrack Logo" 
                className="w-10 h-10 object-contain rounded-lg"
              />
              <span className="text-xl font-bold text-white">EduTrack</span>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed">
              La plateforme moderne de gestion scolaire pour transformer votre école
            </p>
          </div>

          {/* Product */}
          <div>
            <h3 className="text-white font-semibold mb-4">Produit</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/login" className="hover:text-white transition-colors">
                  Fonctionnalités
                </Link>
              </li>
              <li>
                <button onClick={handleWhatsAppClick} className="hover:text-white transition-colors">
                  Tarifs
                </button>
              </li>
              <li>
                <button onClick={handleWhatsAppClick} className="hover:text-white transition-colors">
                  Démo
                </button>
              </li>
              <li>
                <Link to="/login" className="hover:text-white transition-colors">
                  Se Connecter
                </Link>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h3 className="text-white font-semibold mb-4">Support</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <button onClick={handleWhatsAppClick} className="hover:text-white transition-colors">
                  Centre d'aide
                </button>
              </li>
              <li>
                <button onClick={handleWhatsAppClick} className="hover:text-white transition-colors">
                  Documentation
                </button>
              </li>
              <li>
                <button onClick={handleWhatsAppClick} className="hover:text-white transition-colors">
                  Contact
                </button>
              </li>
              <li>
                <button onClick={handleWhatsAppClick} className="hover:text-white transition-colors">
                  Formation
                </button>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-white font-semibold mb-4">Contact</h3>
            <ul className="space-y-3 text-sm">
              <li>
                <button
                  onClick={handleWhatsAppClick}
                  className="flex items-center gap-2 hover:text-white transition-colors group"
                >
                  <MessageCircle className="w-4 h-4 text-green-500 group-hover:text-green-400" />
                  <span>0641998700</span>
                </button>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-blue-500" />
                <span>contact@etrack.ma</span>
              </li>
              <li className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-red-500 mt-1 flex-shrink-0" />
                <span>Maroc</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-gray-800 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-gray-400">
              © {currentYear} EduTrack. Tous droits réservés.
            </p>
            <div className="flex gap-6 text-sm">
              <button onClick={handleWhatsAppClick} className="hover:text-white transition-colors">
                Conditions d'utilisation
              </button>
              <button onClick={handleWhatsAppClick} className="hover:text-white transition-colors">
                Politique de confidentialité
              </button>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default LandingFooter;
