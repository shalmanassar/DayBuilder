/* Device governance UI — table with edit/hide, add modal, quota editing */

async function renderDevices() {
  const c = document.getElementById('content');
  let data;
  try { data = await APP.fetchJSON('/api/devices'); } catch (e) {
    c.innerHTML = `<div class="card"><p class="text-muted">Error: ${e.message}</p></div>`;
    return;
  }

  const devices = (data.device_types || []).filter(d => !d.hidden);
  const quotas = data.quotas || {};

  const rows = devices.map(d => {
    const q = quotas[d.id] || {};
    const qStr = Object.entries(q).map(([k, v]) => `${k}:${v}`).join(', ') || '—';
    return `<tr>
      <td>${d.id}</td><td>${d.display || ''}</td><td>${d.row || ''}</td>
      <td>${d.workbook_label || ''}</td><td class="text-muted" style="font-size:.8rem">${qStr}</td>
      <td>
        <button class="btn btn-sm" onclick="editDevice('${d.id}')">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="hideDevice('${d.id}')">Hide</button>
      </td>
    </tr>`;
  }).join('');

  c.innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center" class="mb-1">
        <h2>Device Types</h2>
        <button class="btn btn-primary" onclick="showAddDeviceModal()">+ Add Device</button>
      </div>
      <table class="table">
        <thead><tr><th>ID</th><th>Display</th><th>Row</th><th>WB Label</th><th>Quotas</th><th>Actions</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

async function editDevice(deviceId) {
  let data;
  try { data = await APP.fetchJSON('/api/devices'); } catch { return; }
  const device = (data.device_types || []).find(d => d.id === deviceId);
  if (!device) return;
  const quotas = (data.quotas || {})[deviceId] || {};

  const c = document.getElementById('content');
  c.innerHTML = `
    <div class="card">
      <h2 class="mb-1">Edit Device: ${device.id}</h2>
      <div class="form-group"><label>Display Name</label><input class="form-input" id="dev-display" value="${device.display || ''}"></div>
      <div class="form-group"><label>Workbook Row</label><input class="form-input" type="number" id="dev-row" value="${device.row || ''}"></div>
      <div class="form-group"><label>Workbook Label</label><input class="form-input" id="dev-wblabel" value="${device.workbook_label || ''}"></div>
      <div class="form-group"><label>Quotas (JSON: {"path_id": number})</label><textarea class="form-input" id="dev-quotas" rows="3">${JSON.stringify(quotas, null, 2)}</textarea></div>
      <button class="btn btn-primary" id="dev-save">Save</button>
      <button class="btn" onclick="renderDevices()">Cancel</button>
    </div>`;

  document.getElementById('dev-save').addEventListener('click', async () => {
    const updates = {
      display: document.getElementById('dev-display').value,
      row: parseInt(document.getElementById('dev-row').value) || null,
      workbook_label: document.getElementById('dev-wblabel').value
    };
    try {
      const q = JSON.parse(document.getElementById('dev-quotas').value);
      updates.quotas = q;
    } catch {}
    await APP.fetchJSON(`/api/devices/${deviceId}`, { method: 'PUT', body: JSON.stringify(updates) });
    renderDevices();
  });
}

function showAddDeviceModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header"><h3>Add Device</h3><button class="btn btn-sm" onclick="this.closest('.modal-overlay').remove()">✕</button></div>
      <div class="form-group"><label>ID (system name)</label><input class="form-input" id="add-dev-id"></div>
      <div class="form-group"><label>Display Name</label><input class="form-input" id="add-dev-display"></div>
      <div class="form-group"><label>Workbook Row</label><input class="form-input" type="number" id="add-dev-row"></div>
      <div class="form-group"><label>Workbook Label</label><input class="form-input" id="add-dev-wblabel"></div>
      <button class="btn btn-primary" id="add-dev-save">Save</button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.getElementById('add-dev-save').addEventListener('click', async () => {
    const device = {
      id: document.getElementById('add-dev-id').value,
      display: document.getElementById('add-dev-display').value,
      row: parseInt(document.getElementById('add-dev-row').value) || null,
      workbook_label: document.getElementById('add-dev-wblabel').value
    };
    if (!device.id) return;
    await APP.fetchJSON('/api/devices', { method: 'POST', body: JSON.stringify(device) });
    overlay.remove();
    renderDevices();
  });
}

async function hideDevice(deviceId) {
  if (!confirm(`Hide device "${deviceId}"? It won't appear in lists but data is preserved.`)) return;
  await APP.fetchJSON(`/api/devices/${deviceId}`, { method: 'DELETE' });
  renderDevices();
}
