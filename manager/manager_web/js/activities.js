/* Activity/path governance UI — table with edit/hide, add modal */

async function renderActivities() {
  const c = document.getElementById('content');
  let activities;
  try { activities = await APP.fetchJSON('/api/activities'); } catch (e) {
    c.innerHTML = `<div class="card"><p class="text-muted">Error: ${e.message}</p></div>`;
    return;
  }

  const visible = (activities || []).filter(a => !a.hidden);
  const rows = visible.map(a => {
    const counts = (a.counts_toward || []).join(', ') || '—';
    return `<tr>
      <td>${a.id}</td><td>${a.display || ''}</td><td class="text-muted">${counts}</td>
      <td>
        <button class="btn btn-sm" onclick="editActivity('${a.id}')">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="hideActivity('${a.id}')">Hide</button>
      </td>
    </tr>`;
  }).join('');

  c.innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center" class="mb-1">
        <h2>Asset Paths / Activities</h2>
        <button class="btn btn-primary" onclick="showAddActivityModal()">+ Add Path</button>
      </div>
      <table class="table">
        <thead><tr><th>ID</th><th>Display</th><th>Counts Toward</th><th>Actions</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

async function editActivity(pathId) {
  let activities;
  try { activities = await APP.fetchJSON('/api/activities'); } catch { return; }
  const activity = (activities || []).find(a => a.id === pathId);
  if (!activity) return;

  const c = document.getElementById('content');
  c.innerHTML = `
    <div class="card">
      <h2 class="mb-1">Edit: ${activity.id}</h2>
      <div class="form-group"><label>Display Name</label><input class="form-input" id="act-display" value="${activity.display || ''}"></div>
      <div class="form-group"><label>Counts Toward (comma-separated device IDs)</label><input class="form-input" id="act-counts" value="${(activity.counts_toward || []).join(', ')}"></div>
      <button class="btn btn-primary" id="act-save">Save</button>
      <button class="btn" onclick="renderActivities()">Cancel</button>
    </div>`;

  document.getElementById('act-save').addEventListener('click', async () => {
    const updates = {
      display: document.getElementById('act-display').value,
      counts_toward: document.getElementById('act-counts').value.split(',').map(s => s.trim()).filter(Boolean)
    };
    await APP.fetchJSON(`/api/activities/${pathId}`, { method: 'PUT', body: JSON.stringify(updates) });
    renderActivities();
  });
}

function showAddActivityModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header"><h3>Add Asset Path</h3><button class="btn btn-sm" onclick="this.closest('.modal-overlay').remove()">✕</button></div>
      <div class="form-group"><label>ID</label><input class="form-input" id="add-act-id"></div>
      <div class="form-group"><label>Display Name</label><input class="form-input" id="add-act-display"></div>
      <div class="form-group"><label>Counts Toward (comma-separated)</label><input class="form-input" id="add-act-counts"></div>
      <button class="btn btn-primary" id="add-act-save">Save</button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.getElementById('add-act-save').addEventListener('click', async () => {
    const activity = {
      id: document.getElementById('add-act-id').value,
      display: document.getElementById('add-act-display').value,
      counts_toward: document.getElementById('add-act-counts').value.split(',').map(s => s.trim()).filter(Boolean)
    };
    if (!activity.id) return;
    await APP.fetchJSON('/api/activities', { method: 'POST', body: JSON.stringify(activity) });
    overlay.remove();
    renderActivities();
  });
}

async function hideActivity(pathId) {
  if (!confirm(`Hide path "${pathId}"? Data is preserved.`)) return;
  await APP.fetchJSON(`/api/activities/${pathId}`, { method: 'DELETE' });
  renderActivities();
}
