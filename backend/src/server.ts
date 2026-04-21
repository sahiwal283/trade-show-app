import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';
import { initializeUploadDirectories } from './config/upload';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import roleRoutes from './routes/roles';
import eventRoutes from './routes/events';
import expenseRoutes from './routes/expenses';
import settingsRoutes from './routes/settings';
import devDashboardRoutes from './routes/devDashboard';
import quickActionsRoutes from './routes/quickActions';
import syncRoutes from './routes/sync';
import ocrV2Routes from './routes/ocrV2';
import ocrTrainingRoutes from './routes/ocrTraining';
import learningAnalyticsRoutes from './routes/learningAnalytics';
import modelRetrainingRoutes from './routes/modelRetraining';
import trainingSyncRoutes from './routes/trainingSync';
import checklistRoutes from './routes/checklist';
import userChecklistRoutes from './routes/userChecklist';
import telegramRoutes from './routes/telegram';
import { requestLogger, errorLogger } from './middleware/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { authenticateToken } from './middleware/auth';
import { sessionTracker } from './middleware/sessionTracker';
import { apiRequestLogger } from './middleware/apiRequestLogger';

dotenv.config();

// Read version from package.json
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));
const VERSION = packageJson.version;

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Middleware
// Parse CORS_ORIGIN - support comma-separated origins or single origin
// Note: With relative API paths (same origin), CORS_ORIGIN can be '*' or specific origins
// Same-origin requests don't require CORS, but having CORS configured doesn't hurt
const corsOrigin = process.env.CORS_ORIGIN 
  ? (process.env.CORS_ORIGIN.includes(',') 
      ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
      : process.env.CORS_ORIGIN.trim())
  : '*';

app.use(cors({
  origin: corsOrigin,
  credentials: true, // Required for cookies and Authorization headers
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'Content-Type'],
  maxAge: 86400 // 24 hours - cache preflight requests
}));

// Log CORS configuration on startup
console.log('[Server] CORS configuration:', {
  origin: corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  note: 'Same-origin requests (relative API paths) work regardless of CORS_ORIGIN setting'
});
app.use(express.json());
app.use(requestLogger);
app.use(apiRequestLogger); // Log all API requests for analytics

// Serve uploaded files
app.use('/uploads', express.static(process.env.UPLOAD_DIR || 'uploads'));
app.use('/api/uploads', express.static(process.env.UPLOAD_DIR || 'uploads'));

// Routes - Auth routes FIRST (no authentication required)
app.use('/api/auth', authRoutes);
app.use('/api/telegram', telegramRoutes);

// Authenticated routes with session tracking
// Session tracking updates last_activity on every API request for real-time monitoring
app.use('/api/users', authenticateToken, sessionTracker, userRoutes);
app.use('/api/roles', authenticateToken, sessionTracker, roleRoutes);
app.use('/api/events', authenticateToken, sessionTracker, eventRoutes);
app.use('/api/expenses', authenticateToken, sessionTracker, expenseRoutes);
app.use('/api/settings', authenticateToken, sessionTracker, settingsRoutes);
app.use('/api/dev-dashboard', authenticateToken, sessionTracker, devDashboardRoutes);
app.use('/api/quick-actions', authenticateToken, sessionTracker, quickActionsRoutes);
app.use('/api/sync', authenticateToken, sessionTracker, syncRoutes);
app.use('/api/ocr/v2', authenticateToken, sessionTracker, ocrV2Routes);
app.use('/api/training', authenticateToken, sessionTracker, ocrTrainingRoutes);
app.use('/api/learning', authenticateToken, sessionTracker, learningAnalyticsRoutes);
app.use('/api/retraining', authenticateToken, sessionTracker, modelRetrainingRoutes);
app.use('/api/training/sync', authenticateToken, sessionTracker, trainingSyncRoutes);
app.use('/api/checklist', authenticateToken, sessionTracker, checklistRoutes);
app.use('/api/user-checklist', authenticateToken, sessionTracker, userChecklistRoutes);

// Health check (with database connectivity test) - existing contract
app.get('/api/health', async (req, res) => {
  const startTime = Date.now();
  try {
    const { query } = await import('./config/database');
    await query('SELECT 1');
    const responseTime = Date.now() - startTime;
    res.json({
      status: 'ok',
      version: VERSION,
      timestamp: new Date().toISOString(),
      database: 'connected',
      responseTime: `${responseTime}ms`,
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error('[Health] Health check failed:', err);
    res.status(503).json({
      status: 'error',
      version: VERSION,
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: 'Database connection failed',
      environment: process.env.NODE_ENV || 'development'
    });
  }
});

// Platform health (no auth) - { status: 'healthy', app: slug }
app.get('/health', async (_req, res) => {
  try {
    const { query } = await import('./config/database');
    await query('SELECT 1');
    res.json({ status: 'healthy', app: process.env.APP_SLUG || 'trade-show' });
  } catch {
    res.status(503).json({ status: 'error', app: process.env.APP_SLUG || 'trade-show' });
  }
});

// Platform meta/version (no auth)
app.get('/api/meta/version', (_req, res) => {
  res.json({
    name: 'Trade Show Expense Management App',
    slug: process.env.APP_SLUG || 'trade-show',
    version: VERSION,
    build: process.env.APP_BUILD || 'dev',
    commit: process.env.APP_COMMIT || 'local',
  });
});

// Diagnostic endpoint for troubleshooting
app.get('/api/diagnostics', (req, res) => {
  res.json({
    server: {
      version: VERSION,
      environment: process.env.NODE_ENV || 'development',
      port: PORT,
      timestamp: new Date().toISOString()
    },
    cors: {
      origin: corsOrigin,
      credentials: true
    },
    request: {
      method: req.method,
      path: req.path,
      url: req.url,
      origin: req.get('origin'),
      referer: req.get('referer'),
      userAgent: req.get('user-agent'),
      ip: req.ip || req.socket.remoteAddress,
      headers: Object.keys(req.headers)
    }
  });
});

// Error handling (must be after routes)
app.use(errorLogger);
app.use(notFoundHandler);
app.use(errorHandler);

// Initialize upload directories on startup
initializeUploadDirectories();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Version: ${VERSION}`);
  console.log(`Listening on 0.0.0.0:${PORT}`);
});
