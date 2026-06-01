/**
 * Rotas relacionadas a currículos.
 */

const express = require('express');
const { upload } = require('../middlewares/upload.middleware');
const {
  uploadResume,
  listResumes,
  getResume,
  getResumeOverview,
  getLatestUploadJob,
  getUploadJob,
  deleteResume,
} = require('../controllers/resume.controller');

const router = express.Router();

router.get('/jobs/latest', getLatestUploadJob);
router.get('/jobs/:jobId', getUploadJob);
router.post('/', upload.array('resumes'), uploadResume);
router.get('/', listResumes);
router.get('/:id/overview', getResumeOverview);
router.get('/:id', getResume);
router.delete('/:id', deleteResume);

module.exports = router;
