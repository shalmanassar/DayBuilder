/* DayBuilder — app.js (Phase 5: date nav, settings, shutdown) */
(async function () {
  let currentDate = new Date().toISOString().slice(0, 10);
  const dateTitle = document.getElementById('dateTitle');
  const banner = document.getElementById('offlineBanner');
  const timelineEl = document.getElementById('timeline');
  const btnAdd = document.getElementById('btnAdd');
  const btnPost = document.getElementById('btnPost');
  const btnReport = document.getElementById('btnReport');
  const btnOpenTarget = document.getElementById('btnOpenTarget');
  const btnClipboard = document.getElementById('btnClipboard');
  const btnSettings = document.getElementById('btnSettings');
  const btnPrev = document.getElementById('btnPrev');
  const btnNext = document.getElementById('btnNext');
  const btnToday = document.getElementById('btnToday');
  const datePicker = document.getElementById('datePicker');
  const validationContainer = document.getElementById('validationContainer');

  // Check status
  let offlineMode = false;
  try {
    const res = await fetch('/api/status');
    const status = await res.json();
    offlineMode = status.offline_mode;
    if (offlineMode) {
      banner.classList.add('visible');
      btnPost.disabled = true;
      btnPost.title = 'Posting disabled in offline mode';
      btnOpenTarget.disabled = true;
    }
  } catch (e) {
    banner.classList.add('visible');
    offlineMode = true;
  }

  // --- Date navigation ---
  function formatTitle(iso) {
    const d = new Date(iso + 'T12:00:00');
    return '\u2600 ' + d.toLocaleDateString('en-US', {
      weekday: 'long', month: 'short', day: 'numeric', year: 'numeric'
    });
  }

  function shiftDate(iso, days) {
    const d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  async function loadDate(iso) {
    currentDate = iso;
    dateTitle.textContent = formatTitle(iso);
    datePicker.value = iso;
    try {
      const res = await fetch('/api/day/' + iso);
      const draft = await res.json();
      Timeline.setBlocks(draft.blocks || []);
      Post.showValidation(draft.blocks || [], validationContainer);
    } catch (e) {
      Timeline.setBlocks([]);
    }
  }

  btnPrev.addEventListener('click', () => loadDate(shiftDate(currentDate, -1)));
  btnNext.addEventListener('click', () => loadDate(shiftDate(currentDate, 1)));
  btnToday.addEventListener('click', () => loadDate(new Date().toISOString().slice(0, 10)));
  datePicker.addEventListener('change', () => { if (datePicker.value) loadDate(datePicker.value); });

  // --- Auto-save ---
  let saveTimer = null;
  function autoSave(blocks) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      fetch('/api/day/' + currentDate, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks })
      });
      Post.showValidation(blocks, validationContainer);
    }, 500);
  }

  // Init timeline
  Timeline.init(timelineEl, autoSave);

  // Load today
  await loadDate(currentDate);

  // Add button
  btnAdd.addEventListener('click', () => {
    Guided.open((block) => { Timeline.addBlock(block); });
  });

  // Post button
  Post.bindPostButton(btnPost, btnOpenTarget, () => Timeline.getBlocks(), () => currentDate);

  // Report button
  btnReport.addEventListener('click', () => { Report.show(Timeline.getBlocks()); });

  // Clipboard
  btnClipboard.addEventListener('click', () => { Report.show(Timeline.getBlocks()); });

  // Settings button
  btnSettings.addEventListener('click', () => { Settings.open(); });
})();
