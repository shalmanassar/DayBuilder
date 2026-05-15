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

  // Populate title bar username
  let schedule = { default_start: '08:00', default_end: '16:30', break_minutes: 15, lunch_minutes: 30 };
  try {
    const cfgRes = await fetch('/api/config');
    const cfgData = await cfgRes.json();
    const userId = cfgData.user && cfgData.user.user_id;
    if (userId) document.getElementById('titleBarUser').textContent = 'USER: ' + userId;
    if (cfgData.user && cfgData.user.schedule) schedule = { ...schedule, ...cfgData.user.schedule };
  } catch (e) { /* ignore */ }

  // Generate default day template from schedule
  function generateDayTemplate() {
    const s = schedule;
    return [
      { id: crypto.randomUUID(), type: 'clock_in', start: s.default_start, end: null },
      { id: crypto.randomUUID(), type: 'break', start: '10:30', end: addMin('10:30', s.break_minutes), memo: 'Break 1' },
      { id: crypto.randomUUID(), type: 'lunch', start: '12:00', end: addMin('12:00', s.lunch_minutes), memo: 'Lunch' },
      { id: crypto.randomUUID(), type: 'break', start: '14:30', end: addMin('14:30', s.break_minutes), memo: 'Break 2' },
      { id: crypto.randomUUID(), type: 'clock_out', start: s.default_end, end: null }
    ];
  }
  function addMin(time, mins) {
    const [h, m] = time.split(':').map(Number);
    const t = h * 60 + m + mins;
    return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;
  }

  // Reconstructed data indicator
  function showReconstructedBanner(show) {
    let el = document.getElementById('reconstructedBanner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'reconstructedBanner';
      el.className = 'reconstructed-banner';
      el.textContent = '⚠ Reconstructed from legacy data';
      timelineEl.parentNode.insertBefore(el, timelineEl);
    }
    el.style.display = show ? 'block' : 'none';
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
    // Highlight if viewing today
    const today = new Date().toISOString().slice(0, 10);
    dateTitle.classList.toggle('date-today', iso === today);
    try {
      const res = await fetch('/api/day/' + iso);
      const draft = await res.json();
      let dayBlocks = draft.blocks || [];
      // Auto-populate empty days with default template
      if (dayBlocks.length === 0) dayBlocks = generateDayTemplate();
      Timeline.setBlocks(dayBlocks);
      Post.showValidation(dayBlocks, validationContainer);
      // Show reconstructed banner if from legacy data
      showReconstructedBanner(draft.reconstructed);
    } catch (e) {
      const tmpl = generateDayTemplate();
      Timeline.setBlocks(tmpl);
      showReconstructedBanner(false);
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

  // --- Calendar mini-map ---
  const calToggle = document.getElementById('calendarToggle');
  const calAccordion = document.getElementById('calendarAccordion');
  const calBody = document.getElementById('calendarBody');
  let calYear = parseInt(currentDate.slice(0, 4));
  let calMonth = parseInt(currentDate.slice(5, 7));

  calToggle.addEventListener('click', () => {
    calAccordion.classList.toggle('open');
    calToggle.textContent = calAccordion.classList.contains('open') ? '▾ Calendar' : '▸ Calendar';
    if (calAccordion.classList.contains('open')) renderCalendar();
  });

  async function renderCalendar() {
    let days = {};
    try {
      const res = await fetch(`/api/calendar/${calYear}/${calMonth}`);
      const data = await res.json();
      days = data.days || {};
    } catch (e) { /* offline */ }

    const todayIso = new Date().toISOString().slice(0, 10);
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const firstDay = new Date(calYear, calMonth - 1, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth, 0).getDate();

    let html = `<div class="cal-header"><button id="calPrev">◀</button><span>${monthNames[calMonth-1]} ${calYear}</span><button id="calNext">▶</button></div>`;
    html += '<div class="cal-grid">';
    ['Su','Mo','Tu','We','Th','Fr','Sa'].forEach(d => html += `<span class="cal-dow">${d}</span>`);
    for (let i = 0; i < firstDay; i++) html += '<span class="cal-day empty"></span>';
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${calYear}-${String(calMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const dow = new Date(calYear, calMonth - 1, d).getDay();
      let cls = 'cal-day';
      if (dow === 0 || dow === 6) cls += ' weekend';
      if (iso === todayIso) cls += ' today';
      const st = days[iso];
      if (st) cls += ` st-${st}`;
      html += `<span class="${cls}" data-date="${iso}">${d}</span>`;
    }
    html += '</div>';
    calBody.innerHTML = html;

    calBody.querySelectorAll('.cal-day:not(.empty)').forEach(el => {
      el.addEventListener('click', () => { loadDate(el.dataset.date); });
    });
    document.getElementById('calPrev').addEventListener('click', () => { calMonth--; if (calMonth < 1) { calMonth = 12; calYear--; } renderCalendar(); });
    document.getElementById('calNext').addEventListener('click', () => { calMonth++; if (calMonth > 12) { calMonth = 1; calYear++; } renderCalendar(); });
  }

  // Init timeline
  Timeline.init(timelineEl, autoSave);

  // Load today
  await loadDate(currentDate);

  // Add button
  btnAdd.addEventListener('click', () => {
    Guided.open((block) => { Timeline.addBlock(block); });
  });

  // Open-slot click-to-add (double-click/right-click on gaps)
  Timeline.onSlotAdd((start, end) => {
    Guided.open((block) => {
      block.start = block.start || start;
      block.end = block.end || end;
      Timeline.addBlock(block);
    }, { start, end });
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
