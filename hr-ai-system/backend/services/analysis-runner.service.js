const { RoleRepo, ResumeRepo, AnalysisRepo } = require('../database/db');
const { analyzeResume } = require('./openai.service');

async function runResumeAnalysis(resumeId, { jobDescription } = {}) {
  const resume = ResumeRepo.findById(resumeId);
  if (!resume) {
    throw new Error('Currículo não encontrado.');
  }

  if (!resume.role_id) {
    throw new Error('Este currículo ainda não está vinculado a uma vaga.');
  }

  const role = RoleRepo.findById(resume.role_id);
  if (!role) {
    throw new Error('A vaga associada ao currículo não foi encontrada.');
  }

  const effectiveRoleDescription = (jobDescription && jobDescription.trim()) || role.description;
  const analysis = await analyzeResume(resume.extracted_text, {
    title: role.title,
    description: effectiveRoleDescription,
  });

  if (typeof analysis.score !== 'number' || !analysis.nivel) {
    throw new Error('Resposta da IA incompleta. Tente novamente.');
  }

  const saved = AnalysisRepo.create({
    resumeId,
    roleId: role.id,
    jobDescription: effectiveRoleDescription,
    score: analysis.score,
    level: analysis.nivel,
    risk: analysis.risco_contratacao,
    fullAnalysis: analysis,
  });

  return {
    saved,
    analysis,
    resume,
    role,
    effectiveRoleDescription,
  };
}

module.exports = { runResumeAnalysis };