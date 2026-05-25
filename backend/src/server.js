import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

import authRoutes from './routes/auth.routes.js';
import adminRoutes from './routes/admin.routes.js';
import teacherRoutes from './routes/teacher.routes.js';
import studentsRoutes from './routes/students.routes.js';
import attendanceRoutes from './routes/attendance.routes.js';
import behaviorRoutes from './routes/behavior.routes.js';
import assignmentsRoutes from './routes/assignments.routes.js';
import aiRoutes from './routes/ai.routes.js';
import homeworkRoutes from './routes/homework.routes.js';
import notificationsRoutes from './routes/notifications.routes.js';
import controlsPlanRoutes from './routes/controlsPlan.routes.js';
import documentsRoutes from './routes/documents.routes.js';
import superadminRoutes from './routes/superadmin.routes.js';
import whatsappRoutes from './routes/whatsapp.routes.js';
import webhooksRoutes from './routes/webhooks.routes.js';
import financeRoutes from './routes/finance.routes.js';
import financeManagersRoutes from './routes/financeManagers.routes.js';
import pedagogicalDirectorsRoutes from './routes/pedagogicalDirectors.routes.js';
import pedagogicalManagersRoutes from './routes/pedagogicalManagers.routes.js';
import transportRoutes from './routes/transport.routes.js';
import transportManagersRoutes from './routes/transportManagers.routes.js';
import driversRoutes from './routes/drivers.routes.js';
import pushRoutes from './routes/push.routes.js';
import parentRoutes from './routes/parent.routes.js';
import bulletinsRoutes from './routes/bulletins.routes.js';
import { startDailyReportScheduler } from './services/dailyReports.js';
import { bootstrapAllSessions } from './services/whatsapp/index.js';
import { handleBaileysIncoming } from './services/whatsapp/chatbot/index.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.set('etag', false);

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors({
  origin: ['https://etrack.ma', 'http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:3000', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Servir les fichiers statiques (logos, documents uploadés)
app.use('/uploads', express.static('uploads'));

// Routes
// Webhooks (sans authentification JWT - doit être avant les autres routes)
app.use('/api/webhooks', webhooksRoutes);

app.use('/api/auth', authRoutes);
// IMPORTANT: sous-routes /api/admin/* spécifiques montées AVANT le routeur admin générique
// (sinon le middleware authorize('admin') du routeur admin bloque les autres rôles)
app.use('/api/admin/whatsapp', whatsappRoutes);
app.use('/api/admin/finance-managers', financeManagersRoutes);
app.use('/api/admin/pedagogical-managers', pedagogicalManagersRoutes);
app.use('/api/admin/pedagogical-directors', pedagogicalDirectorsRoutes);
app.use('/api/admin/transport-managers', transportManagersRoutes);
app.use('/api/admin/drivers', driversRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/teacher', teacherRoutes);
app.use('/api/students', studentsRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/behavior', behaviorRoutes);
app.use('/api/assignments', assignmentsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/teacher', homeworkRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/teacher', controlsPlanRoutes);
app.use('/api', controlsPlanRoutes);
app.use('/api/teacher/documents', documentsRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/superadmin', superadminRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/transport', transportRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/parent', parentRoutes);
app.use('/api/bulletins', bulletinsRoutes);

// Route de test
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'API is running' });
});

// Gestion des erreurs 404
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Gestion des erreurs globales
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, async () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  startDailyReportScheduler();

  // Reconnecte automatiquement toutes les sessions WhatsApp Baileys
  // pour les écoles déjà appairées (auth state présent sur disque).
  try {
    await bootstrapAllSessions(handleBaileysIncoming);
    console.log('✅ Sessions WhatsApp Baileys initialisées');
  } catch (e) {
    console.error('❌ Erreur bootstrap WhatsApp:', e.message);
  }
});
