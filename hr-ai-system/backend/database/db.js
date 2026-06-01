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

  CREATE TABLE IF NOT EXISTS upload_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    total_files INTEGER NOT NULL DEFAULT 0,
    uploaded_count INTEGER NOT NULL DEFAULT 0,
    analyzed_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    current_step TEXT,
    current_file TEXT,
    message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS upload_job_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    step TEXT NOT NULL DEFAULT 'queued',
    error TEXT,
    resume_id INTEGER,
    analysis_id INTEGER,
    candidate_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES upload_jobs(id) ON DELETE CASCADE,
    FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE SET NULL,
    FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_roles_created ON roles(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_analyses_resume ON analyses(resume_id);
  CREATE INDEX IF NOT EXISTS idx_analyses_score ON analyses(score DESC);
  CREATE INDEX IF NOT EXISTS idx_resumes_created ON resumes(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_upload_jobs_role ON upload_jobs(role_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_upload_job_items_job ON upload_job_items(job_id, id ASC);
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
ensureColumn('upload_jobs', 'role_id', 'role_id INTEGER NOT NULL DEFAULT 0');

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

  findLatestByResumeId(resumeId) {
    const row = db.prepare(
      `SELECT a.*, role.title AS role_title, role.description AS role_description
       FROM analyses a
       LEFT JOIN roles role ON role.id = a.role_id
       WHERE a.resume_id = ?
       ORDER BY a.created_at DESC
       LIMIT 1`
    ).get(resumeId);
    if (row) row.full_analysis = JSON.parse(row.full_analysis);
    return row || null;
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

function normalizeUploadJob(job) {
  if (!job) return null;
  const totalUnits = Math.max(Number(job.total_files || 0) * 2, 1);
  const completedUnits = Math.min(
    totalUnits,
    Number(job.uploaded_count || 0) + Number(job.analyzed_count || 0) + Number(job.failed_count || 0)
  );

  return {
    ...job,
    total_files: Number(job.total_files || 0),
    uploaded_count: Number(job.uploaded_count || 0),
    analyzed_count: Number(job.analyzed_count || 0),
    failed_count: Number(job.failed_count || 0),
    progress_percent: Math.round((completedUnits / totalUnits) * 100),
  };
}

const UploadJobRepo = {
  create({ roleId, files }) {
    const insertJob = db.prepare(`
      INSERT INTO upload_jobs (role_id, total_files, current_step, message)
      VALUES (?, ?, 'queued', 'Arquivos recebidos')
    `);
    const insertItem = db.prepare(`
      INSERT INTO upload_job_items (job_id, filename, original_name)
      VALUES (?, ?, ?)
    `);

    const tx = db.transaction((payload) => {
      const jobResult = insertJob.run(payload.roleId, payload.files.length);
      for (const file of payload.files) {
        insertItem.run(jobResult.lastInsertRowid, file.filename, file.originalname);
      }
      return jobResult.lastInsertRowid;
    });

    return this.findById(tx({ roleId, files }));
  },

  findById(id) {
    const job = db.prepare(`
      SELECT j.*, role.title AS role_title
      FROM upload_jobs j
      LEFT JOIN roles role ON role.id = j.role_id
      WHERE j.id = ?
    `).get(id);

    if (!job) return null;

    const items = db.prepare(`
      SELECT id, job_id, filename, original_name, status, step, error, resume_id, analysis_id, candidate_name, created_at, updated_at
      FROM upload_job_items
      WHERE job_id = ?
      ORDER BY id ASC
    `).all(id);

    return {
      ...normalizeUploadJob(job),
      items,
    };
  },

  findLatestByRoleId(roleId) {
    const row = db.prepare(`
      SELECT id
      FROM upload_jobs
      WHERE role_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `).get(roleId);
    return row ? this.findById(row.id) : null;
  },

  updateJob(id, patch) {
    const keys = Object.keys(patch || {});
    if (!keys.length) return this.findById(id);

    const assignments = keys.map((key) => `${key} = @${key}`).join(', ');
    db.prepare(`
      UPDATE upload_jobs
      SET ${assignments}, updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `).run({ id, ...patch });

    return this.findById(id);
  },

  updateItem(id, patch) {
    const keys = Object.keys(patch || {});
    if (!keys.length) return;

    const assignments = keys.map((key) => `${key} = @${key}`).join(', ');
    db.prepare(`
      UPDATE upload_job_items
      SET ${assignments}, updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `).run({ id, ...patch });
  },

  getItems(jobId) {
    return db.prepare(`
      SELECT id, job_id, filename, original_name, status, step, error, resume_id, analysis_id, candidate_name, created_at, updated_at
      FROM upload_job_items
      WHERE job_id = ?
      ORDER BY id ASC
    `).all(jobId);
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

module.exports = { db, RoleRepo, ResumeRepo, AnalysisRepo, ComparisonRepo, UploadJobRepo };
