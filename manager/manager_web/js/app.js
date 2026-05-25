const API = '';

async function fetchJSON(url, opts = {}) {
  opts.headers = { 'Content-Type': 'application/json', ...opts.headers };
  const res = await fetch(API + url, opts);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

function navigate(view) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.view === view));
  const c = document.getElementById('content');
  switch (view) {
    case 'dashboard': default: renderDashboard(); break;
    case 'employees': renderEmployees(); break;
    case 'reports': renderReports(); break;
    case 'settings': renderSettings(); break;
    case 'devices': renderDevices(); break;
    case 'activities': renderActivities(); break;
  }
}

async function loadConfig() {
  try { window.APP_CONFIG = await fetchJSON('/api/config'); } catch { window.APP_CONFIG = {}; }
}

async function loadStatus() {
  try {
    const s = await fetchJSON('/api/status');
    document.getElementById('import-status').textContent = s.last_import || '—';
  } catch { /* ignore */ }
  const cfg = window.APP_CONFIG || {};
  document.getElementById('manager-name').textContent = cfg.manager_name || '';
}

function renderSettings() {
  const cfg = window.APP_CONFIG || {};
  document.getElementById('content').innerHTML = `
    <div class="card">
      <h2 class="mb-1">Settings</h2>
      <div class="form-group"><label>RMAJobLogger Path</label><input class="form-input" id="cfg-rma" value="${cfg.rma_job_logger_path || ''}"></div>
      <div class="form-group"><label>Manager Name</label><input class="form-input" id="cfg-name" value="${cfg.manager_name || ''}"></div>
      <div class="form-group"><label>Manager ID</label><input class="form-input" id="cfg-id" value="${cfg.manager_id || ''}"></div>
      <p class="text-muted" style="margin-bottom:12px">Employee workbook paths are configured per-employee in the Employees tab.</p>
      <button class="btn btn-primary" onclick="saveSettings()">Save</button>
    </div>`;
}

async function saveSettings() {
  const data = {
    rma_job_logger_path: document.getElementById('cfg-rma').value,
    manager_name: document.getElementById('cfg-name').value,
    manager_id: document.getElementById('cfg-id').value
  };
  await fetchJSON('/api/config', { method: 'POST', body: JSON.stringify(data) });
  await loadConfig();
}

document.getElementById('btn-close').addEventListener('click', async () => {
  if (confirm('Shutdown DayBuilder Manager?')) {
    try { await fetchJSON('/api/shutdown', { method: 'POST' }); } catch { /* expected */ }
    window.close();
  }
});

document.querySelectorAll('.nav-item').forEach(el => el.addEventListener('click', () => navigate(el.dataset.view)));

document.addEventListener('DOMContentLoaded', async () => {
  await loadConfig();
  await loadStatus();
  navigate('dashboard');
});

window.APP = { fetchJSON, loadConfig, loadStatus };
