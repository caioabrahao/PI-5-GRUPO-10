/**
 * Rotas relacionadas a vagas/cargos.
 */

const express = require('express');
const { createRole, listRoles, getRole } = require('../controllers/roles.controller');

const router = express.Router();

router.post('/', createRole);
router.get('/', listRoles);
router.get('/:id', getRole);

module.exports = router;