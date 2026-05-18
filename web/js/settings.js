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
      <input id="setCfgWorkbook" value="${cfg.target_workbook || ''}" readonly>

      <label>Target Sheet</label>
      <input id="setCfgSheet" value="${cfg.target_sheet || ''}">

      <label>Sync Target</label>
      <input id="setCfgSync" value="${cfg.sync_target || ''}">

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
      document.body.innerHTML = '<div style="text-align:center;padding:4rem;color:#8ab4c7"><h1>DayBuilder closed</h1><p>You can close this tab.</p></div>';
    };

    // Reset buttons
    document.getElementById('setRefresh').onclick = async () => {
      const res = await fetch('/api/reset/refresh', { method: 'POST' });
      const data = await res.json();
      if (data.ok) location.reload(); else alert(data.error || 'Failed');
    };
    document.getElementById('setResetSettings').onclick = () => doReset('settings');
    document.getElementById('setResetFactory').onclick = () => doReset('factory');
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
