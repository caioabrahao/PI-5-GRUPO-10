/**
 * Controller de análises de IA.
 *
 * Endpoints:
 *   POST /api/analysis/:resumeId   — análise individual
 *   POST /api/analysis/compare     — comparação entre dois currículos
 *   GET  /api/analysis/ranking     — ranking de candidatos por score
 *   GET  /api/analysis/history     — histórico de análises
 */

const { RoleRepo, ResumeRepo, AnalysisRepo, ComparisonRepo } = require('../database/db');
const { compareResumes } = require('../services/openai.service');
const { runResumeAnalysis } = require('../services/analysis-runner.service');
const logger = require('../utils/logger');

/**
 * POST /api/analysis/:resumeId
 * Body: { jobDescription?: string }
 */
async function analyzeOne(req, res, next) {
  try {
    const resumeId = parseInt(req.params.resumeId, 10);
    const { jobDescription } = req.body || {};

    const resume = ResumeRepo.findById(resumeId);
    if (!resume) {
      return res.status(404).json({ ok: false, error: 'Currículo não encontrado.' });
    }

    logger.info('Iniciando análise IA', { resumeId, roleId: resume.role_id, hasJob: !!jobDescription });

    const { saved, analysis, role } = await runResumeAnalysis(resumeId, { jobDescription });

    res.json({
      ok: true,
      data: {
        analysisId: saved.id,
        role: {
          id: role.id,
          title: role.title,
          description: role.description,
        },
        resume: {
          id: resume.id,
          candidate_name: resume.candidate_name,
          original_name: resume.original_name,
        },
        analysis,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/analysis/compare
 * Body: { resumeIdA, resumeIdB, jobDescription? }
 */
async function compareTwo(req, res, next) {
  try {
    const { resumeIdA, resumeIdB, jobDescription } = req.body || {};

    if (!resumeIdA || !resumeIdB) {
      return res.status(400).json({
        ok: false,
        error: 'É necessário informar resumeIdA e resumeIdB.',
      });
    }
    if (resumeIdA === resumeIdB) {
      return res.status(400).json({
        ok: false,
        error: 'Você precisa selecionar dois currículos diferentes.',
      });
    }

    const a = ResumeRepo.findById(parseInt(resumeIdA, 10));
    const b = ResumeRepo.findById(parseInt(resumeIdB, 10));
    if (!a || !b) {
      return res.status(404).json({ ok: false, error: 'Um dos currículos não foi encontrado.' });
    }

    if (!a.role_id || !b.role_id) {
      return res.status(400).json({ ok: false, error: 'Os currículos precisam estar vinculados a uma vaga.' });
    }

    if (a.role_id !== b.role_id) {
      return res.status(400).json({ ok: false, error: 'A comparação só pode ser feita entre currículos da mesma vaga.' });
    }

    const role = RoleRepo.findById(a.role_id);
    if (!role) {
      return res.status(404).json({ ok: false, error: 'A vaga associada aos currículos não foi encontrada.' });
    }

    const effectiveRoleDescription = (jobDescription && jobDescription.trim()) || role.description;

    logger.info('Iniciando comparação IA', { a: a.id, b: b.id, roleId: role.id });

    const comparison = await compareResumes(a.extracted_text, b.extracted_text, {
      title: role.title,
      description: effectiveRoleDescription,
    });

    const saved = ComparisonRepo.create({
      resumeIdA: a.id,
      resumeIdB: b.id,
      roleId: role.id,
      jobDescription: effectiveRoleDescription,
      fullComparison: comparison,
      winner: comparison.vencedor || null,
    });

    res.json({
      ok: true,
      data: {
        comparisonId: saved.id,
        role: {
          id: role.id,
          title: role.title,
          description: role.description,
        },
        resumeA: { id: a.id, name: a.candidate_name, file: a.original_name },
        resumeB: { id: b.id, name: b.candidate_name, file: b.original_name },
        comparison,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/analysis/ranking?limit=10
 * Retorna os melhores candidatos por score.
 */
async function ranking(req, res, next) {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    const roleId = req.query.roleId ? parseInt(req.query.roleId, 10) : undefined;
    const rows = AnalysisRepo.findRanking(limit, Number.isInteger(roleId) ? roleId : undefined);
    res.json({ ok: true, data: rows });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/analysis/history?limit=50
 */
async function history(req, res, next) {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
    const roleId = req.query.roleId ? parseInt(req.query.roleId, 10) : undefined;
    const rows = AnalysisRepo.findHistory(limit, Number.isInteger(roleId) ? roleId : undefined);
    res.json({ ok: true, data: rows });
  } catch (err) {
    next(err);
  }
}

module.exports = { analyzeOne, compareTwo, ranking, history };
