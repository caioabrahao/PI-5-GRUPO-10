/**
 * Controller de currículos.
 * Gerencia upload, listagem, consulta e exclusão.
 */

const fs = require('fs').promises;
const path = require('path');
const { RoleRepo, ResumeRepo } = require('../database/db');
const { extractTextFromPDF, inferCandidateName } = require('../services/pdf.service');
const logger = require('../utils/logger');

/**
 * POST /api/resumes
 * Upload de um currículo PDF.
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

    const results = [];

    for (const file of files) {
      const { filename, originalname, path: filePath, size } = file;

      logger.info('Processando PDF', { filename, size, roleId });

      try {
        const extracted = await extractTextFromPDF(filePath);
        const candidateName = inferCandidateName(extracted.text);

        const resume = ResumeRepo.create({
          roleId,
          filename,
          originalName: originalname,
          candidateName,
          extractedText: extracted.text,
          fileSize: size,
        });

        logger.success('Currículo cadastrado', {
          id: resume.id,
          candidate: candidateName,
          role: role.title,
          pages: extracted.pages,
        });

        results.push({
          ok: true,
          id: resume.id,
          filename: resume.filename,
          original_name: resume.original_name,
          candidate_name: resume.candidate_name,
          role_id: resume.role_id,
          role_title: resume.role_title,
          file_size: resume.file_size,
          created_at: resume.created_at,
          pages: extracted.pages,
          text_preview: extracted.text.slice(0, 300),
        });
      } catch (extractErr) {
        await fs.unlink(filePath).catch(() => {});
        results.push({
          ok: false,
          filename: originalname,
          error: extractErr.message || 'Não foi possível extrair texto do PDF.',
        });
      }
    }

    const successCount = results.filter((item) => item.ok).length;
    const errorCount = results.length - successCount;

    const responsePayload = {
      role: {
        id: role.id,
        title: role.title,
        description: role.description,
      },
      successCount,
      errorCount,
      items: results,
    };

    if (!successCount) {
      return res.status(422).json({
        ok: false,
        error: 'Nenhum PDF pôde ser processado.',
        data: responsePayload,
      });
    }

    res.status(201).json({
      ok: true,
      data: responsePayload,
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

module.exports = { uploadResume, listResumes, getResume, deleteResume };
