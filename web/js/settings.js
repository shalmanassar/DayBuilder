/* DayBuilder — settings.js
   Settings panel: config editing, version display, reset, debug toggle, exit */

const Settings = (() => {
  async function open() {
    const res = await fetch('/api/config');
    const data = await res.json();
    const cfg = data.user || {};
    const version = data.version || {};

    const overlay = document.createElement('div');
    overlay.className = 'settings-overlay';
    overlay.innerHTML = `<div class="settings-modal">
      <h2>⚙ Settings</h2>

      <label>User ID</label>
      <input id="setCfgUserId" value="${cfg.user_id || ''}">

      <label>Target Workbook</label>
      <div style="display:flex;gap:0.5rem">
        <input id="setCfgWorkbook" value="${cfg.target_workbook || ''}" style="flex:1">
        <button id="setBrowseWorkbook" style="white-space:nowrap">Browse…</button>
      </div>

      <label>Target Sheet</label>
      <input id="setCfgSheet" value="${cfg.target_sheet || ''}">

      <label>Sync Target</label>
      <div style="display:flex;gap:0.5rem">
        <input id="setCfgSync" value="${cfg.sync_target || ''}" style="flex:1">
        <button id="setBrowseSync" style="white-space:nowrap">Browse…</button>
      </div>

      <label>Schedule — Start / End</label>
      <div style="display:flex;gap:0.5rem">
        <input type="time" id="setCfgStart" value="${(cfg.schedule||{}).default_start || '07:00'}" style="flex:1">
        <input type="time" id="setCfgEnd" value="${(cfg.schedule||{}).default_end || '16:30'}" style="flex:1">
      </div>

      <div class="settings-toggle">
        <input type="checkbox" id="setCfgDebug" ${cfg.debug ? 'checked' : ''}>
        <label for="setCfgDebug" style="margin:0;color:var(--text-primary)">Debug logging</label>
      </div>

      <div class="settings-version">
        App version: <strong>${version.version || '—'}</strong><br>
        Updated: ${version.updated || '—'}
      </div>

      <div class="settings-reset">
        <button id="setManageMemos">Manage Descriptions</button>
        <button id="setSyncPull">Sync from Share</button>
        <button id="setRefresh">Refresh App</button>
        <button id="setResetSettings">Reset Settings</button>
        <button id="setResetFactory">Factory Reset</button>
      </div>

      <div class="settings-actions">
        <button class="settings-save" id="setSave">Save</button>
        <button class="settings-close" id="setClose">Close</button>
        <button class="settings-exit" id="setExit">Exit App</button>
      </div>
    </div>`;

    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);

    // Save
    document.getElementById('setSave').onclick = async () => {
      const updates = {
        user_id: document.getElementById('setCfgUserId').value.trim(),
        target_workbook: document.getElementById('setCfgWorkbook').value.trim(),
        target_sheet: document.getElementById('setCfgSheet').value.trim(),
        sync_target: document.getElementById('setCfgSync').value.trim() || null,
        debug: document.getElementById('setCfgDebug').checked,
        schedule: {
          default_start: document.getElementById('setCfgStart').value,
          default_end: document.getElementById('setCfgEnd').value
        }
      };
      await fetch('/api/config', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(updates)
      });
      overlay.remove();
    };

    // Close
    document.getElementById('setClose').onclick = () => overlay.remove();

    // Exit
    document.getElementById('setExit').onclick = async () => {
      if (!confirm('Exit DayBuilder? The server will shut down.')) return;
      await fetch('/api/shutdown', { method: 'POST' });
      window.close();
    };

    // Reset buttons
    document.getElementById('setSyncPull').onclick = async () => {
      const res = await fetch('/api/sync/pull', { method: 'POST' });
      const data = await res.json();
      alert(data.msg || data.error || 'Done');
      if (data.ok) location.reload();
    };
    document.getElementById('setRefresh').onclick = async () => {
      const res = await fetch('/api/reset/refresh', { method: 'POST' });
      const data = await res.json();
      if (data.ok) location.reload(); else alert(data.error || 'Failed');
    };
    document.getElementById('setResetSettings').onclick = () => doReset('settings');
    document.getElementById('setResetFactory').onclick = () => doReset('factory');

    // Browse buttons
    document.getElementById('setBrowseWorkbook').onclick = async () => {
      const res = await fetch('/api/browse', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ type: 'file', title: 'Select Target Workbook', filetypes: [['Excel', '*.xlsm *.xlsx'], ['All', '*.*']] }) });
      const data = await res.json();
      if (data.path) document.getElementById('setCfgWorkbook').value = data.path;
    };
    document.getElementById('setBrowseSync').onclick = async () => {
      const res = await fetch('/api/browse', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ type: 'folder', title: 'Select Sync Target Folder' }) });
      const data = await res.json();
      if (data.path) document.getElementById('setCfgSync').value = data.path;
    };

    // Manage Descriptions
    document.getElementById('setManageMemos').onclick = () => { overlay.remove(); openMemoManager(); };
  }

  async function openMemoManager() {
    const res = await fetch('/api/memos');
    const memos = await res.json();
    const types = Object.keys(memos);

    const overlay = document.createElement('div');
    overlay.className = 'settings-overlay';
    overlay.innerHTML = `<div class="settings-modal" style="max-width:500px;max-height:80vh;overflow-y:auto">
      <h2>📝 Manage Saved Descriptions</h2>
      <div style="display:flex;gap:0.5rem;margin-bottom:1rem">
        <select id="memoType" style="flex:1;padding:0.4rem;background:var(--bg-deep);border:1px solid var(--border);color:var(--text-primary);border-radius:4px">
          <option value="">— Select type —</option>
          ${types.map(t => `<option value="${t}">${t.replace(/_/g,' ')}</option>`).join('')}
        </select>
        <input id="memoNew" placeholder="New description..." style="flex:2;padding:0.4rem;background:var(--bg-deep);border:1px solid var(--border);color:var(--text-primary);border-radius:4px">
        <button id="memoAdd" style="padding:0.4rem 0.8rem;background:var(--accent);color:#fff;border:none;border-radius:4px;cursor:pointer">Add</button>
      </div>
      <div id="memoList"></div>
      <div style="margin-top:1rem;text-align:right"><button id="memoClose" style="padding:0.5rem 1.5rem;background:var(--border);color:var(--text-primary);border:none;border-radius:6px;cursor:pointer">Close</button></div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    const listEl = document.getElementById('memoList');
    const typeSelect = document.getElementById('memoType');

    function renderList() {
      const type = typeSelect.value;
      if (!type || !memos[type]) { listEl.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:1rem">Select a type to see descriptions</div>'; return; }
      listEl.innerHTML = memos[type].map(m => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:0.3rem 0.5rem;border-bottom:1px solid var(--border)">
          <span style="font-size:0.85rem">${m}</span>
          <button class="memo-del" data-memo="${m}" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:1rem">✕</button>
        </div>
      `).join('');
      listEl.querySelectorAll('.memo-del').forEach(btn => {
        btn.onclick = async () => {
          await fetch('/api/memos', { method: 'DELETE', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ type, memo: btn.dataset.memo }) });
          memos[type] = memos[type].filter(x => x !== btn.dataset.memo);
          renderList();
        };
      });
    }

    typeSelect.onchange = renderList;
    renderList();

    document.getElementById('memoAdd').onclick = async () => {
      const type = typeSelect.value;
      const memo = document.getElementById('memoNew').value.trim();
      if (!type || !memo) return;
      await fetch('/api/memos', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ type, memo }) });
      if (!memos[type]) memos[type] = [];
      if (!memos[type].includes(memo)) memos[type].push(memo);
      document.getElementById('memoNew').value = '';
      renderList();
    };

    document.getElementById('memoClose').onclick = () => overlay.remove();
  }

  async function doReset(level) {
    const msgs = {
      settings: 'Reset settings? You will need to re-run setup on next launch.',
      factory: 'Factory reset? ALL local data will be deleted. This cannot be undone.'
    };
    if (!confirm(msgs[level])) return;
    const res = await fetch(`/api/reset/${level}`, { method: 'POST' });
    const data = await res.json();
    alert(data.msg || 'Done. Restart the app.');
  }

  return { open };
})();
