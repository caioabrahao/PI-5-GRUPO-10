/**
 * Entry point do servidor HR AI System.
 *
 * Carrega .env, monta middlewares, registra rotas e serve o frontend estático.
 */

// 1) Carrega variáveis de ambiente ANTES de qualquer outro require
require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');

const logger = require('./utils/logger');
const { errorHandler, notFoundHandler } = require('./middlewares/error.middleware');

// Inicializa o banco (cria tabelas se não existirem)
require('./database/db');

// Rotas
const rolesRoutes = require('./routes/roles.routes');
const resumeRoutes = require('./routes/resume.routes');
const analysisRoutes = require('./routes/analysis.routes');

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// ---------------------------------------------------------------------------
//                              MIDDLEWARES
// ---------------------------------------------------------------------------
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Log simples de requisições
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const elapsed = Date.now() - start;
    logger.debug(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${elapsed}ms)`);
  });
  next();
});

// ---------------------------------------------------------------------------
//                              ROTAS DA API
// ---------------------------------------------------------------------------
app.use('/api/roles', rolesRoutes);
app.use('/api/resumes', resumeRoutes);
app.use('/api/analysis', analysisRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    data: {
      status: 'online',
      env: process.env.NODE_ENV || 'development',
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      openai_configured: !!process.env.OPENAI_API_KEY,
    },
  });
});

// ---------------------------------------------------------------------------
//                              FRONTEND ESTÁTICO
// ---------------------------------------------------------------------------
const FRONTEND_DIR = path.join(__dirname, '..', '..');
app.use(express.static(FRONTEND_DIR));

// SPA fallback — qualquer rota não-API retorna index.html
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

// ---------------------------------------------------------------------------
//                              ERROR HANDLERS
// ---------------------------------------------------------------------------
app.use(notFoundHandler);
app.use(errorHandler);

// ---------------------------------------------------------------------------
//                              START
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  logger.success(`HR AI System rodando em http://localhost:${PORT}`);
  if (!process.env.OPENAI_API_KEY) {
    logger.warn('⚠️  OPENAI_API_KEY ausente. Configure o arquivo .env para usar análises com IA.');
  }
});

// Tratamento de exceções não capturadas
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
});
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection', { reason: String(reason) });
});

module.exports = app;
