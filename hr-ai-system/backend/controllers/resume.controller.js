/**
 * Controller de currículos.
 * Gerencia upload, listagem, consulta e exclusão.
 */

const fs = require('fs').promises;
const path = require('path');
const { RoleRepo, ResumeRepo, AnalysisRepo, UploadJobRepo } = require('../database/db');
const { createUploadJob } = require('../services/upload-job.service');
const logger = require('../utils/logger');

/**
 * POST /api/resumes
 * Upload em lote de currículos PDF com processamento assíncrono.
 */
async function uploadResume(req, res, next) {
  try {
    const files = Array.isArray(req.files) ? req.files : (req.file ? [req.file] : []);
    if (!files.length) {
      return res.status(400).json({ ok: false, error: 'Nenhum arquivo enviado.' });
    }

    const roleId = parseInt(req.body?.roleId, 10);
    if (!roleId) {
      return res.status(400).json({ ok: false, error: 'Selecione uma vaga antes de enviar o currículo.' });
    }

    const role = RoleRepo.findById(roleId);
    if (!role) {
      return res.status(404).json({ ok: false, error: 'A vaga selecionada não existe mais.' });
    }

    const job = createUploadJob(roleId, files);

    logger.info('Lote de upload enfileirado', {
      jobId: job.id,
      roleId,
      totalFiles: files.length,
    });

    res.status(201).json({
      ok: true,
      data: {
        role: {
          id: role.id,
          title: role.title,
          description: role.description,
        },
        job,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/resumes
 * Lista todos os currículos com score máximo já obtido.
 */
async function listResumes(req, res, next) {
  try {
    const roleId = req.query.roleId ? parseInt(req.query.roleId, 10) : undefined;
    const items = ResumeRepo.findAll({ roleId: Number.isInteger(roleId) ? roleId : undefined });
    res.json({ ok: true, data: items });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/resumes/:id
 * Retorna detalhes de um currículo, incluindo texto.
 */
async function getResume(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const resume = ResumeRepo.findById(id);
    if (!resume) {
      return res.status(404).json({ ok: false, error: 'Currículo não encontrado.' });
    }
    res.json({ ok: true, data: resume });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/resumes/:id/overview
 * Retorna o currículo com histórico e última análise.
 */
async function getResumeOverview(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const resume = ResumeRepo.findById(id);
    if (!resume) {
      return res.status(404).json({ ok: false, error: 'Currículo não encontrado.' });
    }

    const latestAnalysis = AnalysisRepo.findLatestByResumeId(id);
    const analysisHistory = AnalysisRepo.findByResumeId(id);
    res.json({
      ok: true,
      data: {
        resume,
        latestAnalysis,
        analysisHistory,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/resumes/jobs/latest?roleId=123
 * Retorna o lote mais recente da vaga.
 */
async function getLatestUploadJob(req, res, next) {
  try {
    const roleId = parseInt(req.query.roleId, 10);
    if (!Number.isInteger(roleId)) {
      return res.status(400).json({ ok: false, error: 'Informe roleId.' });
    }

    const job = UploadJobRepo.findLatestByRoleId(roleId);
    res.json({ ok: true, data: job });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/resumes/jobs/:jobId
 * Retorna detalhes do processamento assíncrono.
 */
async function getUploadJob(req, res, next) {
  try {
    const jobId = parseInt(req.params.jobId, 10);
    const job = UploadJobRepo.findById(jobId);
    if (!job) {
      return res.status(404).json({ ok: false, error: 'Lote de upload não encontrado.' });
    }
    res.json({ ok: true, data: job });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/resumes/:id
 * Remove currículo (banco + arquivo físico).
 */
async function deleteResume(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const resume = ResumeRepo.findById(id);
    if (!resume) {
      return res.status(404).json({ ok: false, error: 'Currículo não encontrado.' });
    }

    const filePath = path.join(__dirname, '..', 'uploads', resume.filename);
    await fs.unlink(filePath).catch(() => {});
    ResumeRepo.delete(id);

    logger.info('Currículo removido', { id });
    res.json({ ok: true, data: { id } });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  uploadResume,
  listResumes,
  getResume,
  getResumeOverview,
  getLatestUploadJob,
  getUploadJob,
  deleteResume,
};
