import express from 'express';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

// Assistant IA pour les professeurs
router.post('/teacher-assistant', async (req, res) => {
  try {
    const { question, context } = req.body;

    // Simulation de réponse IA (à remplacer par OpenAI API)
    const response = {
      answer: "Basé sur les données de l'élève, je recommande un suivi personnalisé en mathématiques avec des exercices supplémentaires.",
      suggestions: [
        "Organiser une séance de soutien hebdomadaire",
        "Proposer des exercices adaptés au niveau",
        "Encourager la participation en classe"
      ]
    };

    res.json(response);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: error.message });
  }
});

// Assistant IA pour les élèves
router.post('/student-assistant', async (req, res) => {
  try {
    const { question } = req.body;

    const response = {
      answer: "Voici un plan d'étude personnalisé pour améliorer tes résultats.",
      tips: [
        "Révise 30 minutes par jour",
        "Fais des pauses régulières",
        "Demande de l'aide si nécessaire"
      ]
    };

    res.json(response);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
