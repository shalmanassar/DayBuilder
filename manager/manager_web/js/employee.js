async function renderEmployees() {
  const c = document.getElementById('content');
  let employees = [];
  try { employees = await APP.fetchJSON('/api/employees'); } catch { }
  c.innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center" class="mb-1">
        <h2>Employees</h2>
        <button class="btn btn-primary" onclick="showAddEmployeeModal()">+ Add Employee</button>
      </div>
      <table class="table">
        <thead><tr><th>Name</th><th>User ID</th><th>Workbook</th><th>Participant</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${employees.map(e => `
          <tr>
            <td>${e.display_name}</td>
            <td>${e.user_id}</td>
            <td class="text-muted" style="font-size:.8rem;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${e.target_workbook || ''}">${e.target_workbook ? e.target_workbook.split('\\\\').pop().split('/').pop() : '—'}</td>
            <td>${e.participant ? '<span class="badge badge-success">Yes</span>' : '<span class="badge badge-warning">No</span>'}</td>
            <td>${e.active !== false ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-danger">Inactive</span>'}</td>
            <td>
              <button class="btn btn-sm" onclick="renderEmployeeDetail('${e.user_id}')">Edit</button>
              <button class="btn btn-sm btn-danger" onclick="deactivateEmployee('${e.user_id}')">Deactivate</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

async function browseForWorkbook(inputId) {
  const res = await APP.fetchJSON('/api/browse', {
    method: 'POST',
    body: JSON.stringify({ type: 'file', title: 'Select employee workbook (.xlsm)' })
  });
  if (res.path) document.getElementById(inputId).value = res.path;
}

async function renderEmployeeDetail(userId) {
  let emp = {};
  try { emp = await APP.fetchJSON(`/api/employees/${userId}`); } catch { return; }
  const sched = emp.schedule || {};
  document.getElementById('content').innerHTML = `
    <div class="card">
      <h2 class="mb-1">Edit: ${emp.display_name}</h2>
      <div class="form-group"><label>Display Name</label><input class="form-input" id="ed-name" value="${emp.display_name || ''}"></div>
      <div class="form-group">
        <label>Target Workbook</label>
        <div style="display:flex;gap:8px">
          <input class="form-input" id="ed-wb" value="${emp.target_workbook || ''}" style="flex:1;margin:0">
          <button class="btn" onclick="browseForWorkbook('ed-wb')">Browse</button>
        </div>
      </div>
      <div class="form-group"><label>Target Sheet</label><input class="form-input" id="ed-sheet" value="${emp.target_sheet || ''}"></div>
      <div class="form-group"><label><input type="checkbox" id="ed-participant" ${emp.participant ? 'checked' : ''}> DayBuilder Participant</label></div>
      <div class="form-group"><label>Schedule Start</label><input class="form-input" type="time" id="ed-sched-start" value="${sched.default_start || '08:00'}"></div>
      <div class="form-group"><label>Schedule End</label><input class="form-input" type="time" id="ed-sched-end" value="${sched.default_end || '16:30'}"></div>
      <button class="btn btn-primary" id="ed-save">Save</button>
      <button class="btn" onclick="renderEmployees()">Cancel</button>
    </div>`;
  document.getElementById('ed-save').addEventListener('click', async () => {
    await saveEmployee({
      user_id: userId,
      display_name: document.getElementById('ed-name').value,
      target_workbook: document.getElementById('ed-wb').value,
      target_sheet: document.getElementById('ed-sheet').value,
      participant: document.getElementById('ed-participant').checked,
      schedule: {
        default_start: document.getElementById('ed-sched-start').value,
        default_end: document.getElementById('ed-sched-end').value
      }
    });
  });
}

function showAddEmployeeModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header"><h3>Add Employee</h3><button class="btn btn-sm" onclick="this.closest('.modal-overlay').remove()">✕</button></div>
      <div class="form-group"><label>User ID</label><input class="form-input" id="add-uid" placeholder="e.g. jsmith"></div>
      <div class="form-group"><label>Display Name</label><input class="form-input" id="add-name" placeholder="e.g. John"></div>
      <div class="form-group">
        <label>Target Workbook</label>
        <div style="display:flex;gap:8px">
          <input class="form-input" id="add-wb" placeholder="Path to .xlsm file" style="flex:1;margin:0">
          <button class="btn" onclick="browseForWorkbook('add-wb')">Browse</button>
        </div>
      </div>
      <div class="form-group"><label>Target Sheet</label><input class="form-input" id="add-sheet" placeholder="Sheet name (usually employee name)"></div>
      <div class="form-group"><label><input type="checkbox" id="add-participant"> DayBuilder Participant</label></div>
      <button class="btn btn-primary" id="add-save">Save</button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.getElementById('add-save').addEventListener('click', async () => {
    await saveEmployee({
      user_id: document.getElementById('add-uid').value,
      display_name: document.getElementById('add-name').value,
      target_workbook: document.getElementById('add-wb').value,
      target_sheet: document.getElementById('add-sheet').value,
      participant: document.getElementById('add-participant').checked,
      active: true,
      schedule: { default_start: '08:00', default_end: '16:30', break_count: 2, break_minutes: 15, lunch_minutes: 30 }
    }, true);
    overlay.remove();
  });
}

async function saveEmployee(data, isNew) {
  const method = isNew ? 'POST' : 'PUT';
  const url = isNew ? '/api/employees' : `/api/employees/${data.user_id}`;
  await APP.fetchJSON(url, { method, body: JSON.stringify(data) });
  renderEmployees();
}

async function deactivateEmployee(userId) {
  if (!confirm(`Deactivate employee ${userId}?`)) return;
  await APP.fetchJSON(`/api/employees/${userId}`, { method: 'DELETE' });
  renderEmployees();
}
