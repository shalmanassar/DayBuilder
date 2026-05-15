/* DayBuilder — app.js (Phase 1 shell) */
(async function () {
  const today = new Date().toISOString().slice(0, 10);
  const dateTitle = document.getElementById('dateTitle');
  const banner = document.getElementById('offlineBanner');

  // Format header date
  const d = new Date(today + 'T12:00:00');
  dateTitle.textContent = '☀ ' + d.toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric', year: 'numeric'
  });

  // Check status
  try {
    const res = await fetch('/api/status');
    const status = await res.json();
    if (status.offline_mode) banner.classList.add('visible');
  } catch (e) {
    banner.classList.add('visible');
  }

  // Load today's draft
  try {
    const res = await fetch('/api/day/' + today);
    const draft = await res.json();
    if (draft.blocks && draft.blocks.length > 0) {
      document.querySelector('.timeline').innerHTML = draft.blocks.map(b =>
        `<div class="block" style="padding:.75rem;margin:.5rem 0;background:var(--bg-surface);border-radius:6px;border-left:3px solid var(--accent);">
          <strong>${b.type || 'block'}</strong> ${b.device ? '· ' + b.device : ''} ${b.qty ? 'x' + b.qty : ''}<br>
          <small>${b.start || '?'} – ${b.end || '?'} ${b.memo ? '· ' + b.memo : ''}</small>
        </div>`
      ).join('');
    }
  } catch (e) { /* no draft yet */ }
})();
