/**
 * Middleware central de tratamento de erros.
 * Padroniza respostas de erro em todo o backend.
 */

const multer = require('multer');
const logger = require('../utils/logger');

function errorHandler(err, req, res, next) {
  // Erros do Multer (upload)
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        ok: false,
        error: `Arquivo excede o tamanho máximo permitido (${process.env.MAX_FILE_SIZE_MB || 10}MB).`,
      });
    }
    return res.status(400).json({ ok: false, error: `Erro no upload: ${err.message}` });
  }

  // Erros genéricos lançados pelos services / controllers
  const status = err.status || 500;
  const message = err.message || 'Erro interno do servidor.';

  logger.error('Erro tratado pelo middleware', {
    path: req.path,
    method: req.method,
    status,
    message,
  });

  res.status(status).json({ ok: false, error: message });
}

// 404 padronizado
function notFoundHandler(req, res) {
  res.status(404).json({ ok: false, error: `Rota não encontrada: ${req.method} ${req.path}` });
}

module.exports = { errorHandler, notFoundHandler };
