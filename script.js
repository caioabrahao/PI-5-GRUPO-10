/**
 * HR AI System — Root frontend, role-centric.
 */

const API = '/api';

const state = {
  roles: [],
  selectedRoleId: null,
  overview: {
    resumes: [],
    analyses: [],
    bestCandidates: [],
  },
  analysisQueue: {
    active: false,
    total: 0,
    completed: 0,
    label: 'Pronto',
  },
  page: 'overview',
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
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('');
}

function formatDate(iso) {
  if (!iso) return '';
  const date = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function scoreColor(score) {
  if (score >= 75) return 'var(--success)';
  if (score >= 60) return '#4ade80';
  if (score >= 45) return 'var(--warning)';
  return 'var(--danger)';
}

function setLoader(title, text) {
  $('#loaderTitle').textContent = title;
  $('#loaderText').textContent = text;
  $('#loader').classList.add('active');
}

function hideLoader() {
  $('#loader').classList.remove('active');
}

function setProgressLabel(label) {
  state.analysisQueue.label = label;
  $('#analysisProgressKpi').textContent = label;
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

function getRoutePage() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/roles/new') return { page: 'create-role' };
  const roleMatch = path.match(/^\/roles\/(\d+)$/);
  if (roleMatch) return { page: 'overview', roleId: parseInt(roleMatch[1], 10) };
  if (path === '/' || path === '/roles') return { page: 'overview' };
  if (path === '/upload') return { page: 'upload' };
  return { page: 'overview' };
}

function navigate(path, replace = false) {
  if (replace) window.history.replaceState({}, '', path);
  else window.history.pushState({}, '', path);
  renderRoute();
}

function showPage(page) {
  ['view-overview', 'view-upload', 'view-create-role'].forEach((id) => {
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

function currentRole() {
  return state.roles.find((role) => role.id === state.selectedRoleId) || null;
}

function renderRolePicker() {
  const select = $('#rolePicker');
  const current = state.selectedRoleId ? String(state.selectedRoleId) : '';
  select.innerHTML = ['<option value="">— selecione uma vaga —</option>']
    .concat(state.roles.map((role) => {
      const count = Number(role.resume_count || 0);
      return `<option value="${role.id}">${escapeHtml(role.title)} · ${count} candidato${count === 1 ? '' : 's'}</option>`;
    }))
    .join('');
  select.value = current;
}

function renderRoleSummary() {
  const role = currentRole();
  $('#activeRoleName').textContent = role?.title || 'Selecione uma vaga';
  $('#activeRoleDescription').textContent = role?.description || 'Use o dropdown da sidebar para trocar entre vagas.';
  $('#roleMetaHint').textContent = role ? `Criada em ${formatDate(role.created_at)}` : 'Nenhuma vaga selecionada';
}

function updateHeaderStats() {
  const role = currentRole();
  const resumes = state.overview.resumes;
  const analyses = state.overview.analyses;

  $('#kpiRoleCount').textContent = state.roles.length;
  $('#kpiTotal').textContent = resumes.length;
  $('#kpiAnalyses').textContent = analyses.length;
  $('#overviewCandidates').textContent = resumes.length;
  $('#overviewAnalyzed').textContent = analyses.length;
  $('#overviewBest').textContent = analyses[0]?.score !== undefined ? `${analyses[0].score}/100` : '—';
  $('#analysisProgressKpi').textContent = state.analysisQueue.active
    ? `${state.analysisQueue.label}`
    : 'Pronto';

  if (state.page === 'create-role') {
    $('#viewTitle').textContent = 'Nova vaga';
    $('#viewSubtitle').textContent = 'Descreva o cargo, as competências esperadas e os requisitos do candidato';
    return;
  }

  if (state.page === 'upload') {
    $('#viewTitle').textContent = 'Upload de currículos';
    $('#viewSubtitle').textContent = 'Envie PDFs para a vaga selecionada e acompanhe a análise automática';
    return;
  }

  if (role) {
    $('#viewTitle').textContent = role.title;
    $('#viewSubtitle').textContent = 'Resumo da vaga, melhores candidatos e upload automático de análises';
    return;
  }

  $('#viewTitle').textContent = 'Overview da vaga';
  $('#viewSubtitle').textContent = 'Veja a vaga, os melhores candidatos e o progresso da análise';
}

function renderOverview() {
  renderRoleSummary();
  updateHeaderStats();

  const bestContainer = $('#bestCandidatesList');
  const topCandidates = state.overview.analyses.slice(0, 5);
  if (!topCandidates.length) {
    bestContainer.innerHTML = '<div class="empty">Nenhum candidato analisado ainda.</div>';
  } else {
    bestContainer.innerHTML = topCandidates.map((item, index) => `
      <div class="compact-item">
        <div class="compact-rank">${index + 1}</div>
        <div class="compact-main">
          <strong>${escapeHtml(item.candidate_name || item.original_name || 'Candidato')}</strong>
          <p>${escapeHtml(item.role_title || '')} · ${formatDate(item.created_at)}</p>
        </div>
        <div class="compact-score" style="color:${scoreColor(item.score)}">${item.score}/100</div>
      </div>
    `).join('');
  }

  const resumeContainer = $('#resumeList');
  if (!state.overview.resumes.length) {
    resumeContainer.innerHTML = '<div class="empty">Nenhum currículo enviado ainda.</div>';
  } else {
    resumeContainer.innerHTML = state.overview.resumes.map((item) => `
      <div class="resume-item">
        <div class="resume-icon">${escapeHtml(initials(item.candidate_name || item.original_name))}</div>
        <div class="resume-info">
          <h4>${escapeHtml(item.candidate_name || item.original_name)}</h4>
          <p>${escapeHtml(item.original_name)} · ${escapeHtml(item.role_title || '')} · ${formatDate(item.created_at)}</p>
        </div>
        ${item.best_score ? `<span class="resume-score" style="background:${scoreColor(item.best_score)}22; color:${scoreColor(item.best_score)}">${item.best_score}/100</span>` : '<span class="resume-score" style="background:var(--bg-3); color:var(--text-3)">não analisado</span>'}
        <button class="icon-btn danger" data-delete-resume="${item.id}" title="Excluir">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-2 14a2 2 0 01-2 2H9a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
          </svg>
        </button>
      </div>
    `).join('');

    resumeContainer.querySelectorAll('[data-delete-resume]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.deleteResume, 10);
        if (!confirm('Excluir este currículo? As análises associadas também serão removidas.')) return;
        await api(`/resumes/${id}`, { method: 'DELETE' });
        await loadOverview();
        toast('Currículo removido', 'success');
      });
    });
  }
}

function renderRoleListIntoSidebar() {
  renderRolePicker();
  renderRoleSummary();
  updateHeaderStats();
}

async function loadRoles() {
  state.roles = await api('/roles');
  if (!state.selectedRoleId || !state.roles.some((role) => role.id === state.selectedRoleId)) {
    state.selectedRoleId = state.roles[0]?.id || null;
  }
  renderRoleListIntoSidebar();
}

async function loadOverview() {
  const role = currentRole();
  if (!role) {
    state.overview = { resumes: [], analyses: [], bestCandidates: [] };
    renderOverview();
    return;
  }

  const resumes = await api(`/resumes?roleId=${role.id}`);
  const analyses = await api(`/analysis/history?limit=100&roleId=${role.id}`);
  state.overview = {
    resumes,
    analyses: analyses.sort((a, b) => (b.score || 0) - (a.score || 0)),
    bestCandidates: [],
  };
  renderOverview();
}

async function loadAll() {
  await loadRoles();
  await loadOverview();
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
    await loadAll();
    navigate(`/roles/${role.id}`);
    toast('Vaga criada com sucesso!', 'success');
  } finally {
    hideLoader();
    $('#createRoleBtn').disabled = false;
  }
}

async function analyzeResume(resumeId, position, total) {
  setProgressLabel(`Analisando ${position}/${total}`);
  const result = await api(`/analysis/${resumeId}`, { method: 'POST', body: {} });
  return result;
}

async function processUploadedAnalyses(uploadResult) {
  const successItems = (uploadResult.items || []).filter((item) => item.ok);
  const total = successItems.length;
  if (!total) return;

  state.analysisQueue.active = true;
  state.analysisQueue.total = total;
  state.analysisQueue.completed = 0;
  setProgressLabel(`Analisando 0/${total}`);

  for (let i = 0; i < successItems.length; i += 1) {
    const item = successItems[i];
    await analyzeResume(item.id, i + 1, total);
    state.analysisQueue.completed = i + 1;
    await loadOverview();
  }

  state.analysisQueue.active = false;
  setProgressLabel('Pronto');
  await loadOverview();
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

  setLoader('Enviando currículos', `Processando ${files.length} arquivo${files.length === 1 ? '' : 's'}...`);
  setProgressLabel(`Enviando ${files.length} arquivo${files.length === 1 ? '' : 's'}`);

  try {
    const fd = new FormData();
    files.forEach((file) => fd.append('resumes', file));
    fd.append('roleId', String(role.id));
    const result = await api('/resumes', { method: 'POST', body: fd });

    const successCount = result.successCount || 0;
    const errorCount = result.errorCount || 0;
    $('#uploadStatus').className = 'upload-status success';
    $('#uploadStatus').innerHTML = `
      ✓ <strong>${successCount}</strong> currículo${successCount === 1 ? '' : 's'} enviado${successCount === 1 ? '' : 's'} para <strong>${escapeHtml(result.role?.title || role.title)}</strong>.
      ${errorCount ? `<br>⚠ ${errorCount} arquivo${errorCount === 1 ? '' : 's'} falharam.` : ''}
    `;

    await loadOverview();
    await processUploadedAnalyses(result);
    toast('Upload concluído e análises iniciadas.', 'success');
  } catch (err) {
    $('#uploadStatus').className = 'upload-status error';
    $('#uploadStatus').textContent = `✗ ${err.message}`;
    toast(err.message, 'error');
  } finally {
    hideLoader();
    setProgressLabel('Pronto');
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
  $('#openUploadBtn').addEventListener('click', () => navigate('/upload'));

  fileInput.addEventListener('change', (event) => {
    const files = Array.from(event.target.files || []);
    uploadFiles(files);
    fileInput.value = '';
  });
}

function bindSidebarControls() {
  $('#rolePicker').addEventListener('change', (event) => {
    const value = parseInt(event.target.value, 10);
    state.selectedRoleId = Number.isInteger(value) ? value : null;
    if (state.selectedRoleId) {
      navigate(`/roles/${state.selectedRoleId}`);
    } else {
      navigate('/roles/new');
    }
  });

  $('#openCreateRoleBtn').addEventListener('click', () => navigate('/roles/new'));
  $('#openRolesBtn').addEventListener('click', () => navigate('/roles'));
  $('#createRoleBtn').addEventListener('click', createRole);
  $('#refreshOverviewBtn').addEventListener('click', loadOverview);
  $('#refreshResumesBtn').addEventListener('click', loadOverview);
}

function bindNavigation() {
  $$('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => navigate(`/${btn.dataset.page === 'create-role' ? 'roles/new' : btn.dataset.page === 'upload' ? 'upload' : 'roles'}`));
  });

  window.addEventListener('popstate', renderRoute);
}

function renderRoute() {
  const route = getRoutePage();
  if (route.page === 'create-role') {
    showPage('create-role');
  } else if (route.page === 'upload') {
    showPage('upload');
  } else {
    showPage('overview');
  }

  if (route.roleId) state.selectedRoleId = route.roleId;

  renderRolePicker();
  renderRoleSummary();
  updateHeaderStats();
  loadOverview().catch(() => {});
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
  await loadAll();
  renderRoute();
})();
