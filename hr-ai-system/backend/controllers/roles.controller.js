/**
 * Controller de vagas/cargos.
 */

const { RoleRepo } = require('../database/db');

async function createRole(req, res, next) {
  try {
    const title = String(req.body?.title || '').trim();
    const description = String(req.body?.description || '').trim();

    if (!title || !description) {
      return res.status(400).json({ ok: false, error: 'Informe título e descrição da vaga.' });
    }

    const role = RoleRepo.create({ title, description });

    res.status(201).json({
      ok: true,
      data: role,
    });
  } catch (err) {
    next(err);
  }
}

async function listRoles(req, res, next) {
  try {
    const roles = RoleRepo.findAll();
    res.json({ ok: true, data: roles });
  } catch (err) {
    next(err);
  }
}

async function getRole(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const role = RoleRepo.findById(id);
    if (!role) {
      return res.status(404).json({ ok: false, error: 'Vaga não encontrada.' });
    }
    res.json({ ok: true, data: role });
  } catch (err) {
    next(err);
  }
}

module.exports = { createRole, listRoles, getRole };