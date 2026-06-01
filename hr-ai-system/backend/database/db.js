/**
 * Camada de banco de dados — SQLite via better-sqlite3 (síncrono, robusto e rápido).
 *
 * Tabelas:
 *   - roles: vagas/cargos criados pelo recrutador
 *   - resumes: currículos enviados e vinculados a uma vaga
 *   - analyses: histórico de análises feitas pela IA
 *   - comparisons: histórico de comparações entre candidatos
 */

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const logger = require('../utils/logger');

const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, 'hr_system.db');

// Garante que o diretório existe
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Otimizações de performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ---------------------- SCHEMA ----------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS resumes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role_id INTEGER,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    candidate_name TEXT,
    extracted_text TEXT NOT NULL,
    file_size INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    resume_id INTEGER NOT NULL,
    role_id INTEGER,
    job_description TEXT,
    score INTEGER,
    level TEXT,
    risk TEXT,
    full_analysis TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS comparisons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    resume_id_a INTEGER NOT NULL,
    resume_id_b INTEGER NOT NULL,
    role_id INTEGER,
    job_description TEXT,
    full_comparison TEXT NOT NULL,
    winner TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (resume_id_a) REFERENCES resumes(id) ON DELETE CASCADE,
    FOREIGN KEY (resume_id_b) REFERENCES resumes(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_roles_created ON roles(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_analyses_resume ON analyses(resume_id);
  CREATE INDEX IF NOT EXISTS idx_analyses_score ON analyses(score DESC);
  CREATE INDEX IF NOT EXISTS idx_resumes_created ON resumes(created_at DESC);
`);

function ensureColumn(tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!columns.some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
  }
}

ensureColumn('resumes', 'role_id', 'role_id INTEGER');
ensureColumn('analyses', 'role_id', 'role_id INTEGER');
ensureColumn('comparisons', 'role_id', 'role_id INTEGER');

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_resumes_role ON resumes(role_id);
  CREATE INDEX IF NOT EXISTS idx_analyses_role ON analyses(role_id);
`);

logger.success('Banco de dados SQLite inicializado', { path: DB_PATH });

// ---------------------- HELPERS ----------------------

const RoleRepo = {
  create({ title, description }) {
    const stmt = db.prepare(`
      INSERT INTO roles (title, description)
      VALUES (?, ?)
    `);
    const result = stmt.run(title, description);
    return this.findById(result.lastInsertRowid);
  },

  findById(id) {
    return db.prepare(`
      SELECT
        id,
        title,
        description,
        created_at,
        (SELECT COUNT(*) FROM resumes WHERE role_id = roles.id) AS resume_count,
        (SELECT COUNT(*) FROM analyses WHERE role_id = roles.id) AS analysis_count
      FROM roles
      WHERE id = ?
    `).get(id);
  },

  findAll() {
    return db.prepare(`
      SELECT
        id,
        title,
        description,
        created_at,
        (SELECT COUNT(*) FROM resumes WHERE role_id = roles.id) AS resume_count,
        (SELECT COUNT(*) FROM analyses WHERE role_id = roles.id) AS analysis_count
      FROM roles
      ORDER BY created_at DESC
    `).all();
  },
};

const ResumeRepo = {
  create({ roleId, filename, originalName, candidateName, extractedText, fileSize }) {
    const stmt = db.prepare(`
      INSERT INTO resumes (role_id, filename, original_name, candidate_name, extracted_text, file_size)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(roleId || null, filename, originalName, candidateName, extractedText, fileSize);
    return this.findById(result.lastInsertRowid);
  },

  findById(id) {
    return db.prepare(`
      SELECT
        r.*,
        role.title AS role_title,
        role.description AS role_description
      FROM resumes r
      LEFT JOIN roles role ON role.id = r.role_id
      WHERE r.id = ?
    `).get(id);
  },

  findAll({ roleId } = {}) {
    const query = db.prepare(`
      SELECT
        r.id,
        r.role_id,
        r.filename,
        r.original_name,
        r.candidate_name,
        r.file_size,
        r.created_at,
        role.title AS role_title,
        role.description AS role_description,
        (SELECT MAX(score) FROM analyses WHERE resume_id = r.id) AS best_score
      FROM resumes r
      LEFT JOIN roles role ON role.id = r.role_id
      ${roleId ? 'WHERE r.role_id = ?' : ''}
      ORDER BY r.created_at DESC
    `);
    return roleId ? query.all(roleId) : query.all();
  },

  delete(id) {
    return db.prepare('DELETE FROM resumes WHERE id = ?').run(id);
  },
};

const AnalysisRepo = {
  create({ resumeId, roleId, jobDescription, score, level, risk, fullAnalysis }) {
    const stmt = db.prepare(`
      INSERT INTO analyses (resume_id, role_id, job_description, score, level, risk, full_analysis)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      resumeId,
      roleId || null,
      jobDescription || null,
      score,
      level,
      risk,
      JSON.stringify(fullAnalysis)
    );
    return this.findById(result.lastInsertRowid);
  },

  findById(id) {
    const row = db.prepare('SELECT * FROM analyses WHERE id = ?').get(id);
    if (row) row.full_analysis = JSON.parse(row.full_analysis);
    return row;
  },

  findByResumeId(resumeId) {
    const rows = db.prepare(
      'SELECT * FROM analyses WHERE resume_id = ? ORDER BY created_at DESC'
    ).all(resumeId);
    return rows.map((r) => ({ ...r, full_analysis: JSON.parse(r.full_analysis) }));
  },

  findRanking(limit = 10, roleId) {
    const hasRoleFilter = Number.isInteger(roleId);
    const query = db.prepare(`
      SELECT a.id AS analysis_id, a.score, a.level, a.risk, a.created_at,
        r.id AS resume_id, r.original_name, r.candidate_name,
        role.id AS role_id, role.title AS role_title, role.description AS role_description
      FROM analyses a
      JOIN resumes r ON r.id = a.resume_id
      LEFT JOIN roles role ON role.id = a.role_id
      WHERE a.score IS NOT NULL ${hasRoleFilter ? 'AND a.role_id = ?' : ''}
      ORDER BY a.score DESC, a.created_at DESC
      LIMIT ?
    `);
    return hasRoleFilter ? query.all(roleId, limit) : query.all(limit);
  },

  findHistory(limit = 50, roleId) {
    const hasRoleFilter = Number.isInteger(roleId);
    const query = db.prepare(`
      SELECT a.id, a.resume_id, a.role_id, a.score, a.level, a.risk, a.created_at, a.full_analysis,
        r.original_name, r.candidate_name,
        role.title AS role_title, role.description AS role_description
      FROM analyses a
      JOIN resumes r ON r.id = a.resume_id
      LEFT JOIN roles role ON role.id = a.role_id
      ${hasRoleFilter ? 'WHERE a.role_id = ?' : ''}
      ORDER BY a.created_at DESC
      LIMIT ?
    `);
    return hasRoleFilter ? query.all(roleId, limit) : query.all(limit);
  },

};

const ComparisonRepo = {
  create({ resumeIdA, resumeIdB, roleId, jobDescription, fullComparison, winner }) {
    const stmt = db.prepare(`
      INSERT INTO comparisons (resume_id_a, resume_id_b, role_id, job_description, full_comparison, winner)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      resumeIdA,
      resumeIdB,
      roleId || null,
      jobDescription || null,
      JSON.stringify(fullComparison),
      winner
    );
    return this.findById(result.lastInsertRowid);
  },

  findById(id) {
    const row = db.prepare('SELECT * FROM comparisons WHERE id = ?').get(id);
    if (row) row.full_comparison = JSON.parse(row.full_comparison);
    return row;
  },
};

module.exports = { db, RoleRepo, ResumeRepo, AnalysisRepo, ComparisonRepo };
