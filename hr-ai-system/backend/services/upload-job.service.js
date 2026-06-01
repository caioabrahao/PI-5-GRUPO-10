const fs = require('fs').promises;
const path = require('path');
const { RoleRepo, ResumeRepo, UploadJobRepo } = require('../database/db');
const { extractTextFromPDF, inferCandidateName } = require('./pdf.service');
const { runResumeAnalysis } = require('./analysis-runner.service');
const logger = require('../utils/logger');

const runningJobs = new Set();

async function processUploadJob(jobId) {
  if (runningJobs.has(jobId)) return;
  runningJobs.add(jobId);

  try {
    const job = UploadJobRepo.findById(jobId);
    if (!job) return;

    const role = RoleRepo.findById(job.role_id);
    if (!role) {
      UploadJobRepo.updateJob(jobId, {
        status: 'failed',
        current_step: 'failed',
        message: 'A vaga associada ao lote não foi encontrada.',
        failed_count: job.total_files,
        completed_at: new Date().toISOString(),
      });
      return;
    }

    UploadJobRepo.updateJob(jobId, {
      status: 'processing',
      current_step: 'extracting',
      message: 'Iniciando processamento dos PDFs',
    });

    const items = UploadJobRepo.getItems(jobId);
    let uploadedCount = 0;
    let analyzedCount = 0;
    let failedCount = 0;

    for (const item of items) {
      const filePath = path.join(__dirname, '..', 'uploads', item.filename);

      UploadJobRepo.updateJob(jobId, {
        current_step: 'extracting',
        current_file: item.original_name,
        message: `Extraindo texto de ${item.original_name}`,
        uploaded_count: uploadedCount,
        analyzed_count: analyzedCount,
        failed_count: failedCount,
      });
      UploadJobRepo.updateItem(item.id, { status: 'processing', step: 'extracting', error: null });

      try {
        const extracted = await extractTextFromPDF(filePath);
        const candidateName = inferCandidateName(extracted.text);
        const resume = ResumeRepo.create({
          roleId: role.id,
          filename: item.filename,
          originalName: item.original_name,
          candidateName,
          extractedText: extracted.text,
          fileSize: null,
        });

        uploadedCount += 1;
        UploadJobRepo.updateItem(item.id, {
          status: 'processing',
          step: 'uploaded',
          resume_id: resume.id,
          candidate_name: candidateName,
        });

        UploadJobRepo.updateJob(jobId, {
          current_step: 'analyzing',
          current_file: item.original_name,
          message: `Analisando ${candidateName || item.original_name}`,
          uploaded_count: uploadedCount,
          analyzed_count: analyzedCount,
          failed_count: failedCount,
        });
        UploadJobRepo.updateItem(item.id, { status: 'processing', step: 'analyzing' });

        const { saved } = await runResumeAnalysis(resume.id);
        analyzedCount += 1;

        UploadJobRepo.updateItem(item.id, {
          status: 'completed',
          step: 'completed',
          analysis_id: saved.id,
        });
      } catch (err) {
        failedCount += 1;
        const currentItem = UploadJobRepo.getItems(jobId).find((entry) => entry.id === item.id);
        if (!currentItem?.resume_id) {
          await fs.unlink(filePath).catch(() => {});
        }

        UploadJobRepo.updateItem(item.id, {
          status: 'failed',
          step: 'failed',
          error: err.message || 'Falha ao processar o PDF.',
        });

        logger.error('Falha no lote de upload', {
          jobId,
          itemId: item.id,
          file: item.original_name,
          error: err.message,
        });
      }
    }

    const status = failedCount && !analyzedCount ? 'failed' : 'completed';
    const message = failedCount
      ? `Lote finalizado com ${analyzedCount} análise${analyzedCount === 1 ? '' : 's'} e ${failedCount} falha${failedCount === 1 ? '' : 's'}.`
      : 'Lote finalizado com sucesso.';

    UploadJobRepo.updateJob(jobId, {
      status,
      current_step: status,
      current_file: null,
      message,
      uploaded_count: uploadedCount,
      analyzed_count: analyzedCount,
      failed_count: failedCount,
      completed_at: new Date().toISOString(),
    });
  } finally {
    runningJobs.delete(jobId);
  }
}

function queueUploadJob(jobId) {
  setImmediate(() => {
    processUploadJob(jobId).catch((err) => {
      logger.error('Falha inesperada no worker de upload', { jobId, error: err.message, stack: err.stack });
      UploadJobRepo.updateJob(jobId, {
        status: 'failed',
        current_step: 'failed',
        message: err.message || 'Falha inesperada no processamento do lote.',
        completed_at: new Date().toISOString(),
      });
    });
  });
}

function createUploadJob(roleId, files) {
  const job = UploadJobRepo.create({ roleId, files });
  queueUploadJob(job.id);
  return job;
}

module.exports = { createUploadJob, processUploadJob, queueUploadJob };