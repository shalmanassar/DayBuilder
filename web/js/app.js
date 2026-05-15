/* DayBuilder — app.js (Phase 2: wired to Timeline + API) */
(async function () {
  const today = new Date().toISOString().slice(0, 10);
  const dateTitle = document.getElementById('dateTitle');
  const banner = document.getElementById('offlineBanner');
  const timelineEl = document.getElementById('timeline');
  const btnAdd = document.getElementById('btnAdd');

  // Format header date
  const d = new Date(today + 'T12:00:00');
  dateTitle.textContent = '\u2600 ' + d.toLocaleDateString('en-US', {
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

  // Auto-save debounce
  let saveTimer = null;
  function autoSave(blocks) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      fetch('/api/day/' + today, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks })
      });
    }, 500);
  }

  // Init timeline
  Timeline.init(timelineEl, autoSave);

  // Load today's draft
  try {
    const res = await fetch('/api/day/' + today);
    const draft = await res.json();
    if (draft.blocks && draft.blocks.length > 0) {
      Timeline.setBlocks(draft.blocks);
    }
  } catch (e) { /* no draft yet */ }

  // Add button — creates a new block with defaults
  btnAdd.addEventListener('click', () => {
    const existing = Timeline.getBlocks();
    const lastEnd = existing.length > 0 ? existing[existing.length - 1].end : '07:00';
    Timeline.addBlock({
      id: crypto.randomUUID(),
      type: 'asset_processing',
      device: null,
      qty: null,
      start: lastEnd || '07:00',
      end: addMin(lastEnd || '07:00', 60),
      memo: null
    });
  });

  function addMin(time, mins) {
    const [h, m] = time.split(':').map(Number);
    const total = h * 60 + m + mins;
    return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }
})();
