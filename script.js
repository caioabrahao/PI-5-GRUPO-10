/**
 * HR AI System — Root frontend, role-centric.
 */

const API = '/api';
const TERMINAL_JOB_STATUSES = new Set(['completed', 'failed']);

const state = {
  roles: [],
  selectedRoleId: null,
  selectedResumeIds: new Set(),
  overview: {
    resumes: [],
    analyses: [],
  },
  analysisQueue: {
    jobId: null,
    active: false,
    total: 0,
    completed: 0,
    progress: 0,
    label: 'Pronto',
    message: 'Nenhum processamento em andamento.',
    status: 'idle',
    snapshot: null,
    pollTimer: null,
    lastCompletedJobId: null,
  },
  page: 'overview',
  candidateOverview: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function initials(name) {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

function formatDate(iso) {
  if (!iso) return '';
  const date = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function scoreColor(score) {
  if (score >= 75) return 'var(--success)';
  if (score >= 60) return '#4ade80';
  if (score >= 45) return 'var(--warning)';
  return 'var(--danger)';
}

function normalizeRiskClass(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function truncateText(value, max = 320) {
  if (!value) return '';
  const text = String(value).trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}...`;
}

function setLoader(title, text) {
  $('#loaderTitle').textContent = title;
  $('#loaderText').textContent = text;
  $('#loader').classList.add('active');
}

function hideLoader() {
  $('#loader').classList.remove('active');
}

function toast(message, type = 'info') {
  const container = $('#toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.3s';
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

async function api(path, options = {}) {
  const opts = { ...options, headers: { ...(options.headers || {}) } };
  if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
    opts.body = JSON.stringify(opts.body);
    opts.headers['Content-Type'] = 'application/json';
  }
  if (opts.body instanceof FormData) {
    delete opts.headers['Content-Type'];
  }

  const res = await fetch(`${API}${path}`, opts);
  const payload = await res.json().catch(() => ({ ok: false, error: 'Resposta inválida' }));
  if (!res.ok || !payload.ok) {
    throw new Error(payload.error || `HTTP ${res.status}`);
  }
  return payload.data;
}

function currentRole() {
  return state.roles.find((role) => role.id === state.selectedRoleId) || null;
}

function selectedResumeIds() {
  return Array.from(state.selectedResumeIds);
}

function getRoutePage() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/roles/new') return { page: 'create-role' };
  if (path === '/roles') return { page: 'roles' };
  const candidateMatch = path.match(/^\/candidates\/(\d+)$/);
  if (candidateMatch) return { page: 'candidate', candidateId: parseInt(candidateMatch[1], 10) };
  const roleMatch = path.match(/^\/roles\/(\d+)$/);
  if (roleMatch) return { page: 'overview', roleId: parseInt(roleMatch[1], 10) };
  if (path === '/upload') return { page: 'upload' };
  return { page: 'overview' };
}

function navigate(path, replace = false) {
  if (replace) window.history.replaceState({}, '', path);
  else window.history.pushState({}, '', path);
  renderRoute().catch(handleRouteError);
}

function handleRouteError(err) {
  console.error(err);
  toast(err.message || 'Não foi possível carregar a página.', 'error');
}

function showPage(page) {
  ['view-overview', 'view-upload', 'view-create-role', 'view-roles', 'view-candidate'].forEach((id) => {
    const el = document.getElementById(id);
    const visible = id === `view-${page}`;
    el.classList.toggle('active', visible);
    el.style.display = visible ? 'flex' : 'none';
  });

  $$('.nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.page === page);
  });
  state.page = page;
}

function renderRolePicker() {
  const role = currentRole();
  $('#rolePickerTitle').textContent = role?.title || 'Selecione uma vaga';
  $('#rolePickerMeta').textContent = role
    ? `${Number(role.resume_count || 0)} candidato${Number(role.resume_count || 0) === 1 ? '' : 's'} · criada em ${formatDate(role.created_at)}`
    : 'Escolha uma vaga para trocar o contexto';

  const menu = $('#rolePickerMenu');
  if (!state.roles.length) {
    menu.innerHTML = '<div class="empty empty-inline">Nenhuma vaga cadastrada.</div>';
    return;
  }

  menu.innerHTML = state.roles.map((item) => `
    <button
      class="role-switcher-option ${item.id === state.selectedRoleId ? 'active' : ''}"
      type="button"
      data-role-option="${item.id}"
      role="option"
      aria-selected="${item.id === state.selectedRoleId ? 'true' : 'false'}"
    >
      <strong>${escapeHtml(item.title)}</strong>
      <span>${Number(item.resume_count || 0)} candidato${Number(item.resume_count || 0) === 1 ? '' : 's'} · ${Number(item.analysis_count || 0)} análise${Number(item.analysis_count || 0) === 1 ? '' : 's'}</span>
    </button>
  `).join('');

  menu.querySelectorAll('[data-role-option]').forEach((button) => {
    button.addEventListener('click', () => {
      const roleId = parseInt(button.dataset.roleOption, 10);
      if (!Number.isInteger(roleId)) return;
      toggleRolePicker(false);
      state.selectedRoleId = roleId;
      navigate(`/roles/${roleId}`);
    });
  });
}

function renderRoleSummary() {
  const role = currentRole();
  $('#activeRoleName').textContent = role?.title || 'Selecione uma vaga';
  $('#activeRoleDescription').textContent = role
    ? truncateText(role.description, 180)
    : 'Use o dropdown da sidebar para trocar entre vagas.';
  $('#activeRoleDescription').title = role?.description || '';
  $('#roleMetaHint').textContent = role ? `Criada em ${formatDate(role.created_at)}` : 'Nenhuma vaga selecionada';
}

function toggleRolePicker(force) {
  const picker = $('#rolePicker');
  const trigger = $('#rolePickerTrigger');
  const menu = $('#rolePickerMenu');
  const nextState = typeof force === 'boolean' ? force : !picker.classList.contains('open');

  picker.classList.toggle('open', nextState);
  menu.classList.toggle('hidden', !nextState);
  trigger.setAttribute('aria-expanded', nextState ? 'true' : 'false');
}

function clearResumeSelection() {
  state.selectedResumeIds.clear();
}

function syncResumeSelection() {
  const resumeIds = new Set(state.overview.resumes.map((item) => item.id));
  state.selectedResumeIds.forEach((id) => {
    if (!resumeIds.has(id)) {
      state.selectedResumeIds.delete(id);
    }
  });
}

function renderResumeBatchActions() {
  const batch = $('#resumeBatchActions');
  const toolbar = $('#resumeToolbar');
  const selectedCount = state.selectedResumeIds.size;
  const hasItems = state.overview.resumes.length > 0;

  toolbar.classList.toggle('hidden', !hasItems);
  batch.classList.toggle('hidden', selectedCount === 0);
  $('#resumeBatchLabel').textContent = `${selectedCount} selecionado${selectedCount === 1 ? '' : 's'}`;

  const selectAll = $('#selectAllResumes');
  if (!hasItems) {
    selectAll.checked = false;
    selectAll.indeterminate = false;
    return;
  }

  selectAll.checked = selectedCount > 0 && selectedCount === state.overview.resumes.length;
  selectAll.indeterminate = selectedCount > 0 && selectedCount < state.overview.resumes.length;
}

function toggleResumeSelection(id, checked) {
  if (checked) state.selectedResumeIds.add(id);
  else state.selectedResumeIds.delete(id);
  renderResumeBatchActions();
}

async function analyzeSelectedResumes() {
  const ids = selectedResumeIds();
  if (!ids.length) return;

  const button = $('#analyzeSelectedBtn');
  button.disabled = true;
  button.textContent = 'Analisando...';

  try {
    const results = [];
    for (let index = 0; index < ids.length; index += 1) {
      $('#analysisProgressKpi').textContent = `Analisando ${index + 1}/${ids.length}`;
      try {
        await api(`/analysis/${ids[index]}`, { method: 'POST', body: {} });
        results.push({ ok: true });
      } catch (err) {
        results.push({ ok: false, error: err.message });
      }
    }

    const successCount = results.filter((item) => item.ok).length;
    await loadOverviewData(true);
    clearResumeSelection();
    rerenderCurrentPage();
    toast(
      successCount === ids.length
        ? `Análise gerada para ${successCount} candidato${successCount === 1 ? '' : 's'}.`
        : `${successCount} de ${ids.length} análises concluídas.`,
      successCount === ids.length ? 'success' : 'info'
    );
  } finally {
    button.disabled = false;
    button.textContent = 'Gerar análise';
    renderProgressHeader();
  }
}

async function deleteSelectedResumes() {
  const ids = selectedResumeIds();
  if (!ids.length) return;
  if (!confirm(`Excluir ${ids.length} candidato${ids.length === 1 ? '' : 's'} selecionado${ids.length === 1 ? '' : 's'}?`)) return;

  const button = $('#deleteSelectedBtn');
  button.disabled = true;
  button.textContent = 'Excluindo...';

  try {
    await Promise.all(ids.map((id) => api(`/resumes/${id}`, { method: 'DELETE' })));
    await loadOverviewData(true);
    clearResumeSelection();
    rerenderCurrentPage();
    toast('Candidatos removidos com sucesso.', 'success');
  } finally {
    button.disabled = false;
    button.textContent = 'Excluir';
  }
}

function resetJobState() {
  state.analysisQueue.jobId = null;
  state.analysisQueue.active = false;
  state.analysisQueue.total = 0;
  state.analysisQueue.completed = 0;
  state.analysisQueue.progress = 0;
  state.analysisQueue.label = 'Pronto';
  state.analysisQueue.message = 'Nenhum processamento em andamento.';
  state.analysisQueue.status = 'idle';
  state.analysisQueue.snapshot = null;
  renderProgressHeader();
  renderUploadStatus();
}

function applyJobState(job) {
  if (!job) {
    resetJobState();
    return;
  }

  const active = !TERMINAL_JOB_STATUSES.has(job.status);
  const completed = Number(job.analyzed_count || 0) + Number(job.failed_count || 0);
  let label = job.message || 'Processando lote';

  if (active && job.current_step === 'extracting') {
    label = `Processando PDFs ${job.uploaded_count || 0}/${job.total_files || 0}`;
  } else if (active && job.current_step === 'analyzing') {
    label = `Analisando ${job.analyzed_count || 0}/${job.total_files || 0}`;
  } else if (job.status === 'completed') {
    label = job.failed_count ? 'Concluído com alertas' : 'Concluído';
  } else if (job.status === 'failed') {
    label = 'Falha no processamento';
  }

  state.analysisQueue.jobId = job.id;
  state.analysisQueue.active = active;
  state.analysisQueue.total = Number(job.total_files || 0);
  state.analysisQueue.completed = completed;
  state.analysisQueue.progress = Number(job.progress_percent || 0);
  state.analysisQueue.label = label;
  state.analysisQueue.message = job.message || 'Nenhum processamento em andamento.';
  state.analysisQueue.status = job.status;
  state.analysisQueue.snapshot = job;

  renderProgressHeader();
  renderUploadStatus();
}

function renderProgressHeader() {
  const fill = $('#headerProgressFill');
  const value = $('#headerProgressValue');
  const meta = $('#headerProgressMeta');
  const shell = $('#headerProgressShell');

  fill.style.width = `${state.analysisQueue.progress}%`;
  value.textContent = `${state.analysisQueue.progress}%`;
  meta.textContent = state.analysisQueue.active
    ? state.analysisQueue.message
    : state.analysisQueue.label === 'Pronto'
      ? 'Nenhum processamento em andamento'
      : state.analysisQueue.message;

  shell.classList.toggle('active', state.analysisQueue.active);
  $('#analysisProgressKpi').textContent = state.analysisQueue.label;
}

function renderUploadStatus() {
  const statusEl = $('#uploadStatus');
  const job = state.analysisQueue.snapshot;

  if (!job) {
    statusEl.className = 'upload-status hidden';
    statusEl.innerHTML = '';
    return;
  }

  const className = state.analysisQueue.active
    ? 'upload-status info'
    : job.failed_count
      ? 'upload-status error'
      : 'upload-status success';

  statusEl.className = className;
  statusEl.innerHTML = `
    <strong>${escapeHtml(job.role_title || 'Lote de upload')}</strong><br>
    ${escapeHtml(job.message || 'Processamento em andamento.')}<br>
    ${job.current_file ? `Arquivo atual: <strong>${escapeHtml(job.current_file)}</strong><br>` : ''}
    PDFs prontos: <strong>${job.uploaded_count || 0}/${job.total_files || 0}</strong> ·
    análises concluídas: <strong>${job.analyzed_count || 0}</strong>
    ${job.failed_count ? ` · falhas: <strong>${job.failed_count}</strong>` : ''}
  `;
}

function clearJobPolling() {
  if (state.analysisQueue.pollTimer) {
    window.clearTimeout(state.analysisQueue.pollTimer);
    state.analysisQueue.pollTimer = null;
  }
}

function rerenderCurrentPage() {
  renderRolePicker();
  renderRoleSummary();

  if (state.page === 'roles') {
    renderRolesList();
    return;
  }
  if (state.page === 'candidate') {
    renderCandidateOverview();
    return;
  }
  renderOverview();
}

function scheduleJobPoll(jobId) {
  clearJobPolling();
  if (!jobId) return;

  state.analysisQueue.pollTimer = window.setTimeout(async () => {
    try {
      const previous = state.analysisQueue.snapshot;
      const job = await api(`/resumes/jobs/${jobId}`);
      const countsChanged = !previous
        || previous.uploaded_count !== job.uploaded_count
        || previous.analyzed_count !== job.analyzed_count
        || previous.failed_count !== job.failed_count
        || previous.status !== job.status;

      applyJobState(job);

      if (countsChanged && currentRole()?.id === job.role_id) {
        await loadOverviewData(false);
        rerenderCurrentPage();
      }

      if (!TERMINAL_JOB_STATUSES.has(job.status)) {
        scheduleJobPoll(jobId);
        return;
      }

      clearJobPolling();
      if (state.analysisQueue.lastCompletedJobId !== job.id) {
        state.analysisQueue.lastCompletedJobId = job.id;
        toast(
          job.failed_count
            ? 'Processamento concluído com algumas falhas.'
            : 'Processamento concluído com sucesso.',
          job.failed_count ? 'info' : 'success'
        );
      }

      if (currentRole()?.id === job.role_id) {
        await loadOverviewData(true);
        rerenderCurrentPage();
      }

      if (state.page === 'candidate' && state.candidateOverview?.resume?.role_id === job.role_id) {
        await loadCandidateData(state.candidateOverview.resume.id);
        renderCandidateOverview();
      }
    } catch {
      scheduleJobPoll(jobId);
    }
  }, 1800);
}

async function syncLatestJob() {
  const role = currentRole();
  if (!role) {
    clearJobPolling();
    resetJobState();
    return;
  }

  const job = await api(`/resumes/jobs/latest?roleId=${role.id}`).catch(() => null);
  applyJobState(job);
  if (job && !TERMINAL_JOB_STATUSES.has(job.status)) {
    scheduleJobPoll(job.id);
  } else {
    clearJobPolling();
  }
}

function updateHeaderStats() {
  const role = currentRole();
  const currentResumes = state.overview.resumes;
  const currentAnalyses = state.overview.analyses;
  const totalCandidates = state.roles.reduce((sum, item) => sum + Number(item.resume_count || 0), 0);
  const totalAnalyses = state.roles.reduce((sum, item) => sum + Number(item.analysis_count || 0), 0);

  $('#kpiRoleCount').textContent = state.roles.length;
  $('#kpiTotal').textContent = state.page === 'roles' ? totalCandidates : currentResumes.length;
  $('#kpiAnalyses').textContent = state.page === 'roles' ? totalAnalyses : currentAnalyses.length;
  $('#overviewCandidates').textContent = currentResumes.length;
  $('#overviewAnalyzed').textContent = currentAnalyses.length;
  $('#overviewBest').textContent = currentAnalyses[0]?.score !== undefined ? `${currentAnalyses[0].score}/100` : '—';
  renderProgressHeader();

  if (state.page === 'create-role') {
    $('#viewTitle').textContent = 'Nova vaga';
    $('#viewSubtitle').textContent = 'Descreva o cargo, as competências esperadas e os requisitos do candidato';
    return;
  }

  if (state.page === 'upload') {
    $('#viewTitle').textContent = 'Upload de currículos';
    $('#viewSubtitle').textContent = 'Envie PDFs para a vaga selecionada e acompanhe o processamento em segundo plano';
    return;
  }

  if (state.page === 'roles') {
    $('#viewTitle').textContent = 'Todas as vagas';
    $('#viewSubtitle').textContent = 'Veja o pipeline de cada vaga e abra a visão detalhada que quiser.';
    return;
  }

  if (state.page === 'candidate' && state.candidateOverview?.resume) {
    const candidateName = state.candidateOverview.resume.candidate_name || state.candidateOverview.resume.original_name;
    $('#viewTitle').textContent = candidateName;
    $('#viewSubtitle').textContent = role
      ? `${role.title} · visão detalhada do candidato e da análise de IA`
      : 'Visão detalhada do candidato e da análise de IA';
    return;
  }

  if (role) {
    $('#viewTitle').textContent = role.title;
    $('#viewSubtitle').textContent = 'Resumo da vaga, melhores candidatos e progresso do processamento automático';
    return;
  }

  $('#viewTitle').textContent = 'Overview da vaga';
  $('#viewSubtitle').textContent = 'Veja a vaga, os melhores candidatos e o progresso da análise';
}

function renderOverview() {
  updateHeaderStats();
  syncResumeSelection();

  const bestContainer = $('#bestCandidatesList');
  const topCandidates = state.overview.analyses.slice(0, 5);
  if (!topCandidates.length) {
    bestContainer.innerHTML = '<div class="empty">Nenhum candidato analisado ainda.</div>';
  } else {
    bestContainer.innerHTML = topCandidates.map((item, index) => `
      <div class="compact-item clickable-card" tabindex="0" role="button" data-open-candidate="${item.resume_id}">
        <div class="compact-rank">${index + 1}</div>
        <div class="compact-main">
          <strong>${escapeHtml(item.candidate_name || item.original_name || 'Candidato')}</strong>
          <p>${escapeHtml(item.role_title || '')} · ${formatDate(item.created_at)}</p>
        </div>
        <div class="compact-score" style="color:${scoreColor(item.score)}">${item.score}/100</div>
      </div>
    `).join('');

    bestContainer.querySelectorAll('[data-open-candidate]').forEach((item) => {
      item.addEventListener('click', () => navigate(`/candidates/${item.dataset.openCandidate}`));
      item.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          navigate(`/candidates/${item.dataset.openCandidate}`);
        }
      });
    });
  }

  const resumeContainer = $('#resumeList');
  if (!state.overview.resumes.length) {
    resumeContainer.innerHTML = '<div class="empty">Nenhum currículo enviado ainda.</div>';
    renderResumeBatchActions();
  } else {
    resumeContainer.innerHTML = state.overview.resumes.map((item) => `
      <div class="resume-item clickable-card ${state.selectedResumeIds.has(item.id) ? 'selected' : ''}" tabindex="0" role="button" data-open-candidate="${item.id}">
        <label class="resume-select">
          <input type="checkbox" data-select-resume="${item.id}" ${state.selectedResumeIds.has(item.id) ? 'checked' : ''} />
        </label>
        <div class="resume-icon">${escapeHtml(initials(item.candidate_name || item.original_name))}</div>
        <div class="resume-info">
          <h4>${escapeHtml(item.candidate_name || item.original_name)}</h4>
          <p>${escapeHtml(item.original_name)} · ${escapeHtml(item.role_title || '')} · ${formatDate(item.created_at)}</p>
        </div>
        ${item.best_score ? `<span class="resume-score" style="background:${scoreColor(item.best_score)}22; color:${scoreColor(item.best_score)}">${item.best_score}/100</span>` : '<span class="resume-score" style="background:var(--bg-3); color:var(--text-3)">não analisado</span>'}
        <div class="resume-actions">
          <button class="icon-btn" data-open-candidate="${item.id}" title="Abrir candidato">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
          <button class="icon-btn danger" data-delete-resume="${item.id}" title="Excluir">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-2 14a2 2 0 01-2 2H9a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
          </button>
        </div>
      </div>
    `).join('');

    renderResumeBatchActions();

    resumeContainer.querySelectorAll('[data-select-resume]').forEach((input) => {
      input.addEventListener('click', (event) => event.stopPropagation());
      input.addEventListener('change', (event) => {
        const id = parseInt(input.dataset.selectResume, 10);
        toggleResumeSelection(id, event.target.checked);
        input.closest('.resume-item')?.classList.toggle('selected', event.target.checked);
      });
    });

    resumeContainer.querySelectorAll('[data-open-candidate]').forEach((btn) => {
      btn.addEventListener('click', () => navigate(`/candidates/${btn.dataset.openCandidate}`));
    });

    resumeContainer.querySelectorAll('.resume-item.clickable-card').forEach((item) => {
      item.addEventListener('click', (event) => {
        if (event.target.closest('[data-select-resume]')) return;
        if (event.target.closest('[data-delete-resume]')) return;
        navigate(`/candidates/${item.dataset.openCandidate}`);
      });
      item.addEventListener('keydown', (event) => {
        if ((event.key === 'Enter' || event.key === ' ') && !event.target.closest('[data-delete-resume]') && !event.target.closest('[data-select-resume]')) {
          event.preventDefault();
          navigate(`/candidates/${item.dataset.openCandidate}`);
        }
      });
    });

    resumeContainer.querySelectorAll('[data-delete-resume]').forEach((btn) => {
      btn.addEventListener('click', async (event) => {
        event.stopPropagation();
        const id = parseInt(btn.dataset.deleteResume, 10);
        if (!confirm('Excluir este currículo? As análises associadas também serão removidas.')) return;
        await api(`/resumes/${id}`, { method: 'DELETE' });
        await loadOverviewData(true);
        state.selectedResumeIds.delete(id);
        rerenderCurrentPage();
        toast('Currículo removido', 'success');
      });
    });
  }

  renderUploadStatus();
}

function renderRolesList() {
  updateHeaderStats();

  const container = $('#rolesList');
  if (!state.roles.length) {
    container.innerHTML = '<div class="empty">Nenhuma vaga cadastrada ainda.</div>';
  } else {
    container.innerHTML = state.roles.map((role) => `
      <article class="role-list-card clickable-card" tabindex="0" role="button" data-open-role="${role.id}">
        <div class="role-list-head">
          <div>
            <h3>${escapeHtml(role.title)}</h3>
            <p>${escapeHtml(truncateText(role.description, 220))}</p>
          </div>
          <span class="role-list-date">${formatDate(role.created_at)}</span>
        </div>
        <div class="role-list-stats">
          <span><strong>${Number(role.resume_count || 0)}</strong> candidatos</span>
          <span><strong>${Number(role.analysis_count || 0)}</strong> análises</span>
        </div>
        <div class="role-list-actions">
          <button class="btn-ghost" data-open-role="${role.id}">Abrir overview</button>
          <button class="btn-primary" data-open-upload="${role.id}">Enviar PDFs</button>
        </div>
      </article>
    `).join('');

    container.querySelectorAll('[data-open-role]').forEach((item) => {
      item.addEventListener('click', () => navigate(`/roles/${item.dataset.openRole}`));
    });
    container.querySelectorAll('[data-open-upload]').forEach((item) => {
      item.addEventListener('click', () => {
        state.selectedRoleId = parseInt(item.dataset.openUpload, 10);
        navigate('/upload');
      });
    });
    container.querySelectorAll('.role-list-card').forEach((item) => {
      item.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          navigate(`/roles/${item.dataset.openRole}`);
        }
      });
    });
  }
}

function renderChipList(items, className = '') {
  const values = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!values.length) return '<div class="empty empty-inline">Nenhum item disponível.</div>';
  return `<div class="chips">${values.map((item) => `<span class="chip ${className}">${escapeHtml(item)}</span>`).join('')}</div>`;
}

function renderItemList(items, tone) {
  const values = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!values.length) return '<div class="empty empty-inline">Nenhum item disponível.</div>';
  return `<div class="item-list">${values.map((item) => `
    <div class="item ${tone}">
      <div class="item-title">${escapeHtml(item.titulo || 'Sem título')}</div>
      <div class="item-desc">${escapeHtml(item.descricao || '')}</div>
    </div>
  `).join('')}</div>`;
}

function renderExperienceList(items) {
  const values = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!values.length) return '<div class="empty empty-inline">Nenhuma experiência destacada.</div>';
  return `<div class="detail-cards">${values.map((item) => `
    <div class="experience-item">
      <div class="head">
        <div class="company">${escapeHtml(item.empresa || 'Empresa não identificada')}</div>
        <div class="period">${escapeHtml(item.periodo || 'Período não informado')}</div>
      </div>
      <div class="role">${escapeHtml(item.cargo || 'Cargo não informado')}</div>
      <div class="relevance">${escapeHtml(item.relevancia || '')}</div>
    </div>
  `).join('')}</div>`;
}

function renderAnalysisHistory(items) {
  const values = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!values.length) return '<div class="empty empty-inline">Nenhuma análise gerada até agora.</div>';
  return `<div class="analysis-history">${values.slice(0, 6).map((item) => `
    <div class="analysis-history-item">
      <div>
        <strong>${escapeHtml(item.level || item.nivel || 'Análise')}</strong>
        <p>${formatDate(item.created_at)}</p>
      </div>
      <span class="resume-score" style="background:${scoreColor(item.score)}22; color:${scoreColor(item.score)}">${item.score}/100</span>
    </div>
  `).join('')}</div>`;
}

function renderCandidateOverview() {
  updateHeaderStats();

  const container = $('#candidateOverview');
  const payload = state.candidateOverview;
  if (!payload?.resume) {
    container.innerHTML = '<div class="empty">Selecione um candidato para ver os detalhes.</div>';
    return;
  }

  const { resume, latestAnalysis, analysisHistory } = payload;
  const analysis = latestAnalysis?.full_analysis || latestAnalysis?.fullAnalysis || {};
  const score = latestAnalysis?.score ?? analysis.score;
  const level = latestAnalysis?.level || analysis.nivel || 'Sem análise';
  const risk = latestAnalysis?.risk || analysis.risco_contratacao || 'n/a';
  const role = currentRole();

  container.innerHTML = `
    <div class="candidate-top">
      <div>
        <div class="role-summary-label">Candidato</div>
        <h3 class="candidate-page-title">${escapeHtml(resume.candidate_name || resume.original_name || 'Candidato')}</h3>
        <p class="candidate-page-subtitle">${escapeHtml(role?.title || resume.role_title || 'Sem vaga associada')} · ${escapeHtml(resume.original_name)}</p>
      </div>
      <div class="candidate-actions">
        <button class="btn-ghost" id="backToRoleBtn">Voltar para a vaga</button>
        <button class="btn-primary" id="reanalyzeCandidateBtn">Gerar nova análise</button>
      </div>
    </div>

    <div class="result-grid">
      <div class="result-score-card level-${escapeHtml(level)}">
        <div class="score-circle">
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle class="bg-ring" cx="60" cy="60" r="48"></circle>
            <circle class="progress-ring" cx="60" cy="60" r="48" stroke="${scoreColor(score || 0)}" stroke-dasharray="301.6" stroke-dashoffset="${301.6 - ((score || 0) / 100) * 301.6}"></circle>
          </svg>
          <div class="score-text">
            <div class="num">${score ?? '—'}</div>
            <div class="of">de 100</div>
          </div>
        </div>
        <div class="candidate-name">${escapeHtml(resume.candidate_name || resume.original_name || 'Candidato')}</div>
        <div class="level-badge ${escapeHtml(level)}">${escapeHtml(level)}</div>
        <div class="risk-row">
          <div class="risk-label">Risco de contratação</div>
          <span class="risk-badge ${normalizeRiskClass(risk)}">${escapeHtml(risk)}</span>
          <div class="risk-justify">${escapeHtml(analysis.risco_justificativa || 'A IA ainda não trouxe uma justificativa detalhada para este currículo.')}</div>
        </div>
      </div>

      <div class="detail-cards">
        <div class="detail-card">
          <h4>Resumo profissional</h4>
          <p>${escapeHtml(analysis.resumo_profissional || 'Ainda não há resumo profissional disponível para este candidato.')}</p>
          ${analysis.destaque_principal ? `<div class="highlight-bar">${escapeHtml(analysis.destaque_principal)}</div>` : ''}
        </div>

        <div class="detail-card positive">
          <h4>Compatibilidade com a vaga</h4>
          <p>${escapeHtml(analysis.compatibilidade_vaga || 'Sem análise detalhada de compatibilidade até o momento.')}</p>
        </div>

        <div class="detail-card">
          <h4>Skills técnicas</h4>
          ${renderChipList(analysis.hard_skills, 'hard')}
        </div>

        <div class="detail-card">
          <h4>Soft skills</h4>
          ${renderChipList(analysis.soft_skills, 'soft')}
        </div>
      </div>
    </div>

    <div class="candidate-grid">
      <div class="card detail-card positive">
        <h4>Pontos fortes</h4>
        ${renderItemList(analysis.pontos_fortes, 'positive')}
      </div>

      <div class="card detail-card negative">
        <h4>Pontos fracos</h4>
        ${renderItemList(analysis.pontos_fracos, 'negative')}
      </div>

      <div class="card detail-card warning">
        <h4>Sugestões de melhoria</h4>
        ${renderItemList(analysis.sugestoes_melhoria, 'warning')}
      </div>

      <div class="card detail-card">
        <h4>Experiências relevantes</h4>
        ${renderExperienceList(analysis.experiencias_relevantes)}
      </div>

      <div class="card detail-card">
        <h4>Red flags</h4>
        ${renderChipList(analysis.red_flags, '')}
      </div>

      <div class="card detail-card">
        <h4>Texto extraído</h4>
        <p class="candidate-text-preview">${escapeHtml(truncateText(resume.extracted_text, 1200) || 'Texto do currículo indisponível.')}</p>
      </div>
    </div>

    <div class="card detail-card">
      <h4>Histórico de análises</h4>
      ${renderAnalysisHistory(analysisHistory)}
    </div>
  `;

  $('#backToRoleBtn').addEventListener('click', () => {
    if (resume.role_id) {
      navigate(`/roles/${resume.role_id}`);
      return;
    }
    navigate('/roles');
  });

  $('#reanalyzeCandidateBtn').addEventListener('click', async (event) => {
    const btn = event.currentTarget;
    btn.disabled = true;
    btn.textContent = 'Analisando...';
    try {
      await api(`/analysis/${resume.id}`, { method: 'POST', body: {} });
      await loadCandidateData(resume.id);
      await loadOverviewData(true);
      renderCandidateOverview();
      toast('Nova análise concluída.', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Gerar nova análise';
    }
  });
}

async function loadRoles() {
  state.roles = await api('/roles');
  if (!state.selectedRoleId || !state.roles.some((role) => role.id === state.selectedRoleId)) {
    state.selectedRoleId = state.roles[0]?.id || null;
  }
}

async function loadOverviewData(syncJob = true) {
  const role = currentRole();
  if (!role) {
    state.overview = { resumes: [], analyses: [] };
    clearResumeSelection();
    if (syncJob) resetJobState();
    return;
  }

  const requests = [
    api(`/resumes?roleId=${role.id}`),
    api(`/analysis/history?limit=100&roleId=${role.id}`),
  ];

  if (syncJob) {
    requests.push(api(`/resumes/jobs/latest?roleId=${role.id}`).catch(() => null));
  }

  const [resumes, analyses, latestJob] = await Promise.all(requests);
  state.overview = {
    resumes,
    analyses: analyses.sort((a, b) => (b.score || 0) - (a.score || 0)),
  };
  syncResumeSelection();

  if (syncJob) {
    applyJobState(latestJob);
    if (latestJob && !TERMINAL_JOB_STATUSES.has(latestJob.status)) {
      scheduleJobPoll(latestJob.id);
    } else {
      clearJobPolling();
    }
  }
}

async function loadCandidateData(resumeId) {
  state.candidateOverview = await api(`/resumes/${resumeId}/overview`);
  if (state.candidateOverview?.resume?.role_id) {
    state.selectedRoleId = state.candidateOverview.resume.role_id;
  }
}

async function createRole() {
  const title = $('#roleTitleInput').value.trim();
  const description = $('#roleDescriptionInput').value.trim();
  if (!title || !description) {
    toast('Informe o título e a descrição da vaga.', 'error');
    return;
  }

  $('#createRoleBtn').disabled = true;
  setLoader('Criando vaga', 'Salvando a descrição do cargo...');
  try {
    const role = await api('/roles', { method: 'POST', body: { title, description } });
    $('#roleTitleInput').value = '';
    $('#roleDescriptionInput').value = '';
    state.selectedRoleId = role.id;
    await loadRoles();
    await loadOverviewData(true);
    navigate(`/roles/${role.id}`);
    toast('Vaga criada com sucesso!', 'success');
  } finally {
    hideLoader();
    $('#createRoleBtn').disabled = false;
  }
}

async function uploadFiles(files) {
  const role = currentRole();
  if (!role) {
    toast('Crie ou selecione uma vaga antes de enviar currículos.', 'error');
    return;
  }

  if (!files.length) return;

  const invalid = files.some((file) => file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf'));
  if (invalid) {
    toast('Envie apenas arquivos PDF.', 'error');
    return;
  }

  $('#uploadStatus').className = 'upload-status info';
  $('#uploadStatus').innerHTML = `
    <strong>Enfileirando lote</strong><br>
    Recebendo ${files.length} arquivo${files.length === 1 ? '' : 's'} para ${escapeHtml(role.title)}.
  `;

  try {
    const fd = new FormData();
    files.forEach((file) => fd.append('resumes', file));
    fd.append('roleId', String(role.id));
    const result = await api('/resumes', { method: 'POST', body: fd });

    applyJobState(result.job);
    scheduleJobPoll(result.job.id);
    await loadOverviewData(false);
    rerenderCurrentPage();
    toast('Upload recebido. O processamento seguirá em segundo plano.', 'success');
  } catch (err) {
    $('#uploadStatus').className = 'upload-status error';
    $('#uploadStatus').textContent = `✗ ${err.message}`;
    toast(err.message, 'error');
  }
}

function bindUploadControls() {
  const dropzone = $('#dropzone');
  const fileInput = $('#fileInput');

  ['dragenter', 'dragover'].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (event) => {
    const files = Array.from(event.dataTransfer.files || []);
    uploadFiles(files);
  });

  dropzone.addEventListener('click', () => fileInput.click());
  $('#pickFileBtn').addEventListener('click', (event) => {
    event.stopPropagation();
    fileInput.click();
  });
  $('#openUploadBtn').addEventListener('click', () => {
    if (!currentRole()) {
      toast('Selecione uma vaga antes de abrir o upload.', 'error');
      return;
    }
    navigate('/upload');
  });

  fileInput.addEventListener('change', (event) => {
    const files = Array.from(event.target.files || []);
    uploadFiles(files);
    fileInput.value = '';
  });
}

function bindSidebarControls() {
  $('#rolePickerTrigger').addEventListener('click', () => toggleRolePicker());
  $('#rolePickerTrigger').addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      toggleRolePicker(false);
    }
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('#rolePicker')) {
      toggleRolePicker(false);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      toggleRolePicker(false);
    }
  });

  $('#openCreateRoleBtn').addEventListener('click', () => navigate('/roles/new'));
  $('#openRolesBtn').addEventListener('click', () => navigate('/roles'));
  $('#createRoleBtn').addEventListener('click', createRole);
  $('#refreshOverviewBtn').addEventListener('click', () => renderRoute().catch(handleRouteError));
  $('#refreshResumesBtn').addEventListener('click', () => renderRoute().catch(handleRouteError));
  $('#rolesCreateBtn').addEventListener('click', () => navigate('/roles/new'));
  $('#clearSelectionBtn').addEventListener('click', () => {
    clearResumeSelection();
    rerenderCurrentPage();
  });
  $('#analyzeSelectedBtn').addEventListener('click', analyzeSelectedResumes);
  $('#deleteSelectedBtn').addEventListener('click', deleteSelectedResumes);
  $('#selectAllResumes').addEventListener('change', (event) => {
    if (event.target.checked) {
      state.overview.resumes.forEach((item) => state.selectedResumeIds.add(item.id));
    } else {
      clearResumeSelection();
    }
    rerenderCurrentPage();
  });
}

function bindNavigation() {
  $$('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.page === 'create-role') {
        navigate('/roles/new');
        return;
      }
      if (btn.dataset.page === 'upload') {
        navigate('/upload');
        return;
      }
      navigate(state.selectedRoleId ? `/roles/${state.selectedRoleId}` : '/');
    });
  });

  window.addEventListener('popstate', () => {
    renderRoute().catch(handleRouteError);
  });
}

async function renderRoute() {
  const route = getRoutePage();

  if (route.roleId) {
    state.selectedRoleId = route.roleId;
  }

  if (route.page === 'candidate') {
    await loadCandidateData(route.candidateId);
  }

  await loadOverviewData(true);
  renderRolePicker();
  renderRoleSummary();
  toggleRolePicker(false);

  showPage(route.page);

  if (route.page === 'roles') {
    renderRolesList();
    return;
  }

  if (route.page === 'candidate') {
    renderCandidateOverview();
    return;
  }

  renderOverview();
}

async function healthcheck() {
  try {
    const result = await api('/health');
    const label = result.openai_configured ? `Online · ${result.model}` : '⚠ Sem API key';
    $('#apiStatus').classList.add('online');
    $('#apiStatus .label').textContent = label;
  } catch {
    $('#apiStatus').classList.add('offline');
    $('#apiStatus .label').textContent = 'Backend offline';
  }
}

(async function init() {
  bindSidebarControls();
  bindNavigation();
  bindUploadControls();
  await healthcheck();
  await loadRoles();
  await syncLatestJob().catch(() => {});
  await renderRoute();
})();
