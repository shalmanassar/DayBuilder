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

  // Add button — opens guided entry modal
  btnAdd.addEventListener('click', () => {
    Guided.open((block) => {
      Timeline.addBlock(block);
    });
  });

})();
