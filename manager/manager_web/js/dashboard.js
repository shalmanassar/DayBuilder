/* Dashboard view — team overview with employee cards + device breakdown */

let _dashDate = new Date().toISOString().slice(0, 10);

async function renderDashboard() {
  const c = document.getElementById('content');
  c.innerHTML = '<div class="card"><p class="text-muted">Loading dashboard...</p></div>';

  let data;
  try { data = await APP.fetchJSON(`/api/dashboard?date=${_dashDate}`); } catch (e) {
    c.innerHTML = `<div class="card"><p class="text-muted">Could not load dashboard: ${e.message}</p></div>`;
    return;
  }

  const dateInput = `<input type="date" class="form-input" style="width:auto;display:inline-block" value="${_dashDate}" id="dash-date">`;
  const empCards = data.employees.map(e => {
    const pctClass = e.production_pct >= 100 ? 'badge-success' : e.production_pct >= 70 ? 'badge-warning' : 'badge-danger';
    const status = e.has_data ? `<span class="badge ${pctClass}">${e.production_pct}%</span>` : '<span class="badge badge-danger">No data</span>';
    const devList = Object.entries(e.devices || {}).map(([d, q]) => `<span class="text-muted" style="margin-right:8px">${d}: ${q}</span>`).join('');
    return `<div class="emp-card" onclick="renderEmployeeReport('${e.user_id}')">
      <div class="emp-card-header"><strong>${e.display_name}</strong> ${status}</div>
      <div class="emp-card-body"><span>Total: ${e.total_qty}</span><div style="margin-top:4px;font-size:.8rem">${devList}</div></div>
    </div>`;
  }).join('');

  const devRows = data.team_devices.map(d => `<tr><td>${d.display}</td><td>${d.qty}</td></tr>`).join('');

  c.innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center" class="mb-1">
        <h2>Team Dashboard</h2>
        <div>${dateInput} <button class="btn btn-primary btn-sm" id="dash-import">Import Now</button></div>
      </div>
      <p class="text-muted mb-1">Date: ${data.date} | Team Total: <strong>${data.team_total_qty}</strong> units</p>
    </div>
    <div class="emp-grid">${empCards || '<p class="text-muted">No employee data for this date.</p>'}</div>
    <div class="card">
      <h3 class="mb-1">Device Breakdown</h3>
      <table class="table"><thead><tr><th>Device</th><th>Qty</th></tr></thead><tbody>${devRows || '<tr><td colspan="2" class="text-muted">No data</td></tr>'}</tbody></table>
    </div>`;

  document.getElementById('dash-date').addEventListener('change', e => { _dashDate = e.target.value; renderDashboard(); });
  document.getElementById('dash-import').addEventListener('click', async () => {
    document.getElementById('dash-import').disabled = true;
    document.getElementById('dash-import').textContent = 'Importing...';
    try { await APP.fetchJSON('/api/import', { method: 'POST' }); } catch {}
    renderDashboard();
  });
}

async function renderEmployeeReport(userId) {
  const c = document.getElementById('content');
  // Last 30 days
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  let data;
  try { data = await APP.fetchJSON(`/api/report/employee/${userId}?from=${from}&to=${to}`); } catch (e) {
    c.innerHTML = `<div class="card"><p class="text-muted">Error: ${e.message}</p></div>`;
    return;
  }

  const dayRows = data.days.map(d => {
    const devs = Object.entries(d.devices).map(([k, v]) => `${k}:${v}`).join(', ');
    const pctClass = d.production_pct >= 100 ? 'badge-success' : d.production_pct >= 70 ? 'badge-warning' : 'badge-danger';
    return `<tr><td>${d.date}</td><td>${d.total_qty}</td><td><span class="badge ${pctClass}">${d.production_pct}%</span></td><td class="text-muted">${devs}</td></tr>`;
  }).join('');

  c.innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center" class="mb-1">
        <h2>${data.display_name} — Last 30 Days</h2>
        <button class="btn btn-sm" onclick="renderDashboard()">← Back</button>
      </div>
      <table class="table">
        <thead><tr><th>Date</th><th>Total</th><th>Prod %</th><th>Devices</th></tr></thead>
        <tbody>${dayRows || '<tr><td colspan="4" class="text-muted">No data</td></tr>'}</tbody>
      </table>
    </div>`;
}

async function renderReports() {
  const c = document.getElementById('content');
  const today = new Date().toISOString().slice(0, 10);
  c.innerHTML = `
    <div class="card">
      <h2 class="mb-1">Reports</h2>
      <div class="form-group"><label>Report Type</label>
        <select class="form-input" id="rpt-type">
          <option value="weekly">Weekly Summary</option>
          <option value="daily">Daily Detail</option>
        </select>
      </div>
      <div class="form-group"><label>Date</label><input type="date" class="form-input" id="rpt-date" value="${today}"></div>
      <button class="btn btn-primary" id="rpt-go">Generate</button>
      <div id="rpt-output" style="margin-top:16px"></div>
    </div>`;

  document.getElementById('rpt-go').addEventListener('click', async () => {
    const type = document.getElementById('rpt-type').value;
    const dt = document.getElementById('rpt-date').value;
    const out = document.getElementById('rpt-output');
    out.innerHTML = '<p class="text-muted">Loading...</p>';

    try {
      const data = await APP.fetchJSON(`/api/report/${type}/${dt}`);
      if (type === 'weekly') {
        const empRows = data.employee_summaries.map(e => {
          const pct = e.production_pct >= 100 ? 'badge-success' : e.production_pct >= 70 ? 'badge-warning' : 'badge-danger';
          return `<tr><td>${e.display_name}</td><td>${e.total_qty}</td><td><span class="badge ${pct}">${e.production_pct}%</span></td></tr>`;
        }).join('');
        out.innerHTML = `<h3>Week of ${data.week_of}</h3><p class="text-muted mb-1">Team Total: ${data.team_total_qty}</p>
          <table class="table"><thead><tr><th>Employee</th><th>Total</th><th>Prod %</th></tr></thead><tbody>${empRows}</tbody></table>`;
      } else {
        const empRows = data.employees.map(e => {
          const pct = e.production_pct >= 100 ? 'badge-success' : e.production_pct >= 70 ? 'badge-warning' : 'badge-danger';
          return `<tr><td>${e.display_name}</td><td>${e.total_qty}</td><td><span class="badge ${pct}">${e.production_pct}%</span></td></tr>`;
        }).join('');
        out.innerHTML = `<h3>${data.date}</h3><p class="text-muted mb-1">Team Total: ${data.team_total_qty}</p>
          <table class="table"><thead><tr><th>Employee</th><th>Total</th><th>Prod %</th></tr></thead><tbody>${empRows}</tbody></table>`;
      }
    } catch (e) { out.innerHTML = `<p class="text-muted">Error: ${e.message}</p>`; }
  });
}
