import { useAuth } from '../contexts/AuthContext';
import ParentProfilePage from './parent/ParentProfilePage';
import StudentProfilePage from './student/StudentProfile';

// Une seule URL /profile, mais une expérience réellement adaptée au rôle.
// Les parents ne doivent plus tomber sur les textes et avatars de l'élève.
export default function AccountProfilePage() {
  const { profile } = useAuth();
  return profile?.role === 'parent' ? <ParentProfilePage /> : <StudentProfilePage />;
}
