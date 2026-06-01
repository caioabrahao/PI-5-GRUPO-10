/**
 * Rotas relacionadas a análises e comparações com IA.
 */

const express = require('express');
const {
  analyzeOne,
  compareTwo,
  ranking,
  history,
} = require('../controllers/analysis.controller');

const router = express.Router();

router.post('/compare', compareTwo);
router.get('/ranking', ranking);
router.get('/history', history);
router.post('/:resumeId', analyzeOne);

module.exports = router;
