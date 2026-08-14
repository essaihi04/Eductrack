import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import authRoutes from './routes/auth.routes.js';
import adminRoutes from './routes/admin.routes.js';
import timetableImportRoutes from './routes/timetableImport.routes.js';
import chatbotAccessRoutes from './routes/chatbotAccess.routes.js';
import parentAssistantRoutes from './routes/parentAssistant.routes.js';
import studentDossierRoutes from './routes/studentDossier.routes.js';
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
import chatbotDocsRoutes from './routes/chatbotDocs.routes.js';
import schoolShowcaseRoutes from './routes/schoolShowcase.routes.js';
import cloudWebhookRoutes from './routes/cloudWebhook.routes.js';
import legalRoutes from './routes/legal.routes.js';
import communicationsRoutes from './routes/communications.routes.js';
import { startCommunicationScheduler } from './services/communicationScheduler.js';
import financeRoutes from './routes/finance.routes.js';
import financeAccountingRoutes from './routes/financeAccounting.routes.js';
import financePayrollRoutes from './routes/financePayroll.routes.js';
import financeLoansTaxesRoutes from './routes/financeLoansTaxes.routes.js';
import financeBankRoutes from './routes/financeBank.routes.js';
import financeManagersRoutes from './routes/financeManagers.routes.js';
import pedagogicalDirectorsRoutes from './routes/pedagogicalDirectors.routes.js';
import pedagogicalManagersRoutes from './routes/pedagogicalManagers.routes.js';
import receptionistsRoutes from './routes/receptionists.routes.js';
import transportRoutes from './routes/transport.routes.js';
import transportManagersRoutes from './routes/transportManagers.routes.js';
import driversRoutes from './routes/drivers.routes.js';
import pushRoutes from './routes/push.routes.js';
import parentRoutes from './routes/parent.routes.js';
import bulletinsRoutes from './routes/bulletins.routes.js';
import schoolLifeRoutes from './routes/schoolLife.routes.js';
import appointmentsRoutes from './routes/appointments.routes.js';
import approvalRoutes from './routes/approval.routes.js';
import enrollmentsRoutes from './routes/enrollments.routes.js';
import inscriptionsRoutes from './routes/inscriptions.routes.js';
import { startInvoiceScheduler } from './services/invoiceScheduler.js';
import { bootstrapAllSessions } from './services/whatsapp/index.js';
import { handleBaileysIncoming } from './services/whatsapp/chatbot/index.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.set('etag', false);
// Derrière nginx : nécessaire pour que le rate limiting voie l'IP réelle
// du client (X-Forwarded-For) et non celle du proxy.
app.set('trust proxy', 1);

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
// verify : capture le corps brut pour vérifier la signature des webhooks Meta
app.use(express.json({
  limit: '50mb',
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Servir les fichiers statiques (logos, documents uploadés)
app.use('/uploads', express.static(join(__dirname, '../uploads')));

// Routes
// Webhook WhatsApp Cloud API — PUBLIC (pas d'auth, appelé par Meta)
app.use('/api/whatsapp/cloud', cloudWebhookRoutes);
// Pages légales publiques (politique de confidentialité, conditions, suppression)
app.use('/api/legal', legalRoutes);
app.use('/api/auth', authRoutes);
// IMPORTANT: sous-routes /api/admin/* spécifiques montées AVANT le routeur admin générique
// (sinon le middleware authorize('admin') du routeur admin bloque les autres rôles)
app.use('/api/admin/whatsapp', whatsappRoutes);
app.use('/api/admin/chatbot-docs', chatbotDocsRoutes);
app.use('/api/admin/school-showcase', schoolShowcaseRoutes);
app.use('/api/admin/communications', communicationsRoutes);
app.use('/api/admin/finance-managers', financeManagersRoutes);
app.use('/api/admin/pedagogical-managers', pedagogicalManagersRoutes);
app.use('/api/admin/pedagogical-directors', pedagogicalDirectorsRoutes);
app.use('/api/admin/receptionists', receptionistsRoutes);
app.use('/api/admin/transport-managers', transportManagersRoutes);
app.use('/api/admin/drivers', driversRoutes);
app.use('/api/admin/dossier', studentDossierRoutes);
app.use('/api/admin/timetable-import', timetableImportRoutes);
app.use('/api/admin/chatbot-access', chatbotAccessRoutes);
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
app.use('/api/finance', financeAccountingRoutes);
app.use('/api/finance', financePayrollRoutes);
app.use('/api/finance', financeLoansTaxesRoutes);
app.use('/api/finance', financeBankRoutes);
app.use('/api/transport', transportRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/parent/assistant', parentAssistantRoutes);
app.use('/api/parent', parentRoutes);
app.use('/api/bulletins', bulletinsRoutes);
app.use('/api/school-life', schoolLifeRoutes);
app.use('/api/appointments', appointmentsRoutes);
app.use('/api/approvals', approvalRoutes);
app.use('/api/enrollments', enrollmentsRoutes);
app.use('/api/inscriptions', inscriptionsRoutes);

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
  startCommunicationScheduler();
  startInvoiceScheduler();

  // Reconnecte automatiquement toutes les sessions WhatsApp Baileys
  // pour les écoles déjà appairées (auth state présent sur disque).
  try {
    await bootstrapAllSessions(handleBaileysIncoming);
    console.log('✅ Sessions WhatsApp Baileys initialisées');
  } catch (e) {
    console.error('❌ Erreur bootstrap WhatsApp:', e.message);
  }
});
