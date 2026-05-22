/* DayBuilder — app.js (v3.1: 3-column layout, palette drag, live report) */
(async function () {
  let currentDate = new Date().toISOString().slice(0, 10);
  const dateTitle = document.getElementById('dateTitle');
  const banner = document.getElementById('offlineBanner');
  const timelineEl = document.getElementById('timeline');
  const btnPost = document.getElementById('btnPost');
  const btnReport = document.getElementById('btnReport');
  const btnOpenTarget = document.getElementById('btnOpenTarget');
  const btnSettings = document.getElementById('btnSettings');
  const btnPrev = document.getElementById('btnPrev');
  const btnNext = document.getElementById('btnNext');
  const btnToday = document.getElementById('btnToday');
  const datePicker = document.getElementById('datePicker');
  const validationContainer = document.getElementById('validationContainer');
  const liveReportBody = document.getElementById('liveReportBody');

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

  // Config + schedule
  let schedule = { default_start: '08:00', default_end: '16:30', break_minutes: 15, lunch_minutes: 30 };
  try {
    const cfgRes = await fetch('/api/config');
    const cfgData = await cfgRes.json();
    const userId = cfgData.user && cfgData.user.user_id;
    if (userId) document.getElementById('titleBarUser').textContent = 'USER: ' + userId;
    if (cfgData.user && cfgData.user.schedule) schedule = { ...schedule, ...cfgData.user.schedule };
  } catch (e) { /* ignore */ }

  function generateDayTemplate() {
    const s = schedule;
    return [
      { id: crypto.randomUUID(), type: 'clock_in', start: s.default_start, end: null },
      { id: crypto.randomUUID(), type: 'break', start: '10:30', end: addMin('10:30', s.break_minutes), memo: 'Break 1' },
      { id: crypto.randomUUID(), type: 'lunch', start: '12:00', end: addMin('12:00', s.lunch_minutes), memo: 'Lunch', locked: true },
      { id: crypto.randomUUID(), type: 'break', start: '14:30', end: addMin('14:30', s.break_minutes), memo: 'Break 2' },
      { id: crypto.randomUUID(), type: 'clock_out', start: s.default_end, end: null }
    ];
  }
  function addMin(time, mins) {
    const [h, m] = time.split(':').map(Number);
    const t = h * 60 + m + mins;
    return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;
  }

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
    return '\u2600 ' + d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
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
    Timeline.setDate(iso);
    const today = new Date().toISOString().slice(0, 10);
    dateTitle.classList.toggle('date-today', iso === today);
    try {
      const res = await fetch('/api/day/' + iso);
      const draft = await res.json();
      let dayBlocks = draft.blocks || [];
      if (dayBlocks.length === 0) dayBlocks = generateDayTemplate();
      Timeline.setBlocks(dayBlocks);
      Post.showValidation(dayBlocks, validationContainer);
      showReconstructedBanner(draft.reconstructed);
    } catch (e) {
      Timeline.setBlocks(generateDayTemplate());
      showReconstructedBanner(false);
    }
    updateLiveReport(Timeline.getBlocks());
  }

  btnPrev.addEventListener('click', () => loadDate(shiftDate(currentDate, -1)));
  btnNext.addEventListener('click', () => loadDate(shiftDate(currentDate, 1)));
  btnToday.addEventListener('click', () => loadDate(new Date().toISOString().slice(0, 10)));
  datePicker.addEventListener('change', () => { if (datePicker.value) loadDate(datePicker.value); });

  // --- Auto-save + live report ---
  let saveTimer = null;
  let reportTimer = null;
  function autoSave(blocks) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      fetch('/api/day/' + currentDate, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks })
      });
      Post.showValidation(blocks, validationContainer);
    }, 500);
    // Debounce live report update
    clearTimeout(reportTimer);
    reportTimer = setTimeout(() => updateLiveReport(blocks), 300);
  }

  // --- Live Report ---
  async function updateLiveReport(blocks) {
    if (!blocks || blocks.length === 0) {
      liveReportBody.innerHTML = '<div class="lr-empty">Add blocks to see stats</div>';
      return;
    }
    try {
      const res = await fetch('/api/rates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks })
      });
      const data = await res.json();
      renderLiveReport(data);
    } catch (e) {
      liveReportBody.innerHTML = '<div class="lr-empty">Unable to load</div>';
    }
  }

  function renderLiveReport(data) {
    const t = data.totals || {};
    const devices = data.devices || [];
    const color = t.adjusted_pct >= 100 ? 'var(--success)' : t.adjusted_pct >= 75 ? 'var(--warning)' : 'var(--danger)';

    let devHtml = devices.map(d =>
      `<div class="lr-row"><span>${d.display} x${d.qty}</span><span class="lr-val">${d.quota_hrs}h</span></div>`
    ).join('');

    liveReportBody.innerHTML = `
      <div class="lr-pct" style="color:${color}">${t.adjusted_pct || 0}%</div>
      <div class="lr-subtitle">Adjusted Goal</div>
      <div class="lr-section">
        <h4>Production</h4>
        <div class="lr-row"><span>Produced</span><span class="lr-val">${t.total_quota_hours || 0}h</span></div>
        <div class="lr-row"><span>Target</span><span class="lr-val">${t.adjusted_prod_hours || 0}h</span></div>
        <div class="lr-row"><span>Available</span><span class="lr-val">${t.available_prod_hours || 0}h</span></div>
      </div>
      ${devHtml ? `<div class="lr-section"><h4>Devices</h4>${devHtml}</div>` : ''}
      <div class="lr-section">
        <h4>Time</h4>
        <div class="lr-row"><span>Shift</span><span class="lr-val">${t.actual_in || '?'} → ${t.actual_out || '?'}</span></div>
        <div class="lr-row"><span>Break</span><span class="lr-val">${t.actual_break_mins || 0}m</span></div>
        <div class="lr-row"><span>Lunch</span><span class="lr-val">${t.actual_lunch_mins || 0}m</span></div>
        <div class="lr-row"><span>Non-prod</span><span class="lr-val">${t.non_asset_hours || 0}h</span></div>
      </div>
    `;
  }

  // --- Palette drag-to-timeline + recents loading ---
  const paletteRecents = document.getElementById('paletteRecents');
  let selectedPaletteType = null;

  document.querySelectorAll('.palette-item').forEach(item => {
    item.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('application/x-palette-type', item.dataset.type);
      e.dataTransfer.setData('application/x-palette-memo', '');
      e.dataTransfer.effectAllowed = 'copy';
    });
    item.addEventListener('click', () => {
      document.querySelectorAll('.palette-item').forEach(i => i.classList.remove('palette-active'));
      item.classList.add('palette-active');
      selectedPaletteType = item.dataset.type;
      loadRecents(item.dataset.type);
    });
  });

  async function loadRecents(type) {
    paletteRecents.innerHTML = '<div class="lr-empty">Loading...</div>';
    try {
      const recents = await fetch(`/api/recents/${type}`).then(r => r.json());
      if (recents.length === 0) {
        paletteRecents.innerHTML = '<div class="lr-empty">No saved descriptions</div>';
        return;
      }
      paletteRecents.innerHTML = '';
      recents.forEach(memo => {
        const el = document.createElement('div');
        el.className = 'palette-recent-item';
        el.draggable = true;
        el.textContent = memo;
        el.title = `Drag to timeline: ${type} — ${memo}`;
        el.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('application/x-palette-type', type);
          e.dataTransfer.setData('application/x-palette-memo', memo);
          e.dataTransfer.effectAllowed = 'copy';
        });
        paletteRecents.appendChild(el);
      });
    } catch (e) {
      paletteRecents.innerHTML = '<div class="lr-empty">Unable to load</div>';
    }
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
    } catch (e) {}

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
      el.addEventListener('click', () => loadDate(el.dataset.date));
    });
    document.getElementById('calPrev').addEventListener('click', () => { calMonth--; if (calMonth < 1) { calMonth = 12; calYear--; } renderCalendar(); });
    document.getElementById('calNext').addEventListener('click', () => { calMonth++; if (calMonth > 12) { calMonth = 1; calYear++; } renderCalendar(); });
  }

  // Init timeline
  Timeline.init(timelineEl, autoSave);
  await loadDate(currentDate);

  // Open-slot click-to-add (double-click gaps)
  Timeline.onSlotAdd((start, end) => {
    Guided.open((block) => {
      block.start = block.start || start;
      block.end = block.end || end;
      Timeline.addBlock(block);
    }, { start, end });
  });

  // Save button
  const btnSave = document.getElementById('btnSave');
  btnSave.addEventListener('click', async () => {
    const blocks = Timeline.getBlocks();
    await fetch(`/api/day/${currentDate}`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({blocks})
    });
    await fetch('/api/save', {method: 'POST'});
    btnSave.textContent = '✓ Saved';
    setTimeout(() => { btnSave.textContent = 'Save'; }, 2000);
  });

  // Post button
  Post.bindPostButton(btnPost, btnOpenTarget, () => Timeline.getBlocks(), () => currentDate);

  // Report button
  btnReport.addEventListener('click', () => { Report.show(Timeline.getBlocks()); });

  // Weekly report button — opens week-at-a-glance
  document.getElementById('btnWeekReport').addEventListener('click', () => { showWeekGlance(currentDate); });

  // --- Week at a Glance ---
  async function showWeekGlance(dateIso) {
    const res = await fetch('/api/rates/week', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ date: dateIso })
    });
    const data = await res.json();
    const dayNames = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
    const t = data.totals || {};
    const adjColor = t.adjusted_pct >= 100 ? 'var(--success)' : t.adjusted_pct >= 75 ? 'var(--warning)' : 'var(--danger)';

    const overlay = document.createElement('div');
    overlay.className = 'settings-overlay';
    overlay.innerHTML = `<div class="week-glance-modal">
      <div class="wg-header">
        <h2>Week of ${data.week_of}</h2>
        <div class="wg-summary">
          <span class="wg-pct" style="color:${adjColor}">${t.adjusted_pct || 0}%</span>
          <span class="wg-label">${t.total_quota_hours || 0}h of ${t.adjusted_prod_hours || 0}h</span>
        </div>
        <div class="wg-actions">
          <button class="wg-report-btn">📄 Full Report</button>
          <button class="wg-close-btn">✕</button>
        </div>
      </div>
      <div class="wg-days">${data.days.map((day, i) => {
        const r = day.report ? day.report.totals : null;
        const pct = r ? r.adjusted_pct : 0;
        const c = pct >= 100 ? 'var(--success)' : pct >= 75 ? 'var(--warning)' : 'var(--danger)';
        const blocks = day.blocks || [];
        return `<div class="wg-day">
          <div class="wg-day-header">
            <span class="wg-day-name">${dayNames[i]}</span>
            <span class="wg-day-pct" style="color:${r ? c : 'var(--text-muted)'}">${r ? pct + '%' : '—'}</span>
          </div>
          <div class="wg-mini-timeline" data-day="${day.date}">${renderMiniTimeline(blocks)}</div>
          <div class="wg-day-stats">${r ? `${r.total_quota_hours}h prod · ${r.available_prod_hours}h avail` : 'No data'}</div>
        </div>`;
      }).join('')}</div>
    </div>`;

    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    overlay.querySelector('.wg-close-btn').onclick = () => overlay.remove();
    overlay.querySelector('.wg-report-btn').onclick = () => { overlay.remove(); Report.showWeek(dateIso); };

    // Click a day to navigate
    overlay.querySelectorAll('.wg-day').forEach(el => {
      el.addEventListener('dblclick', () => {
        const date = el.querySelector('.wg-mini-timeline').dataset.day;
        overlay.remove();
        loadDate(date);
      });
    });
  }

  function renderMiniTimeline(blocks) {
    if (!blocks || blocks.length === 0) return '<div class="wg-empty">—</div>';
    const TYPE_COLORS = {
      asset_processing: '#3498db', project: '#9b59b6', admin: '#e67e22',
      meeting: '#1abc9c', '5s': '#f1c40f', learning: '#2ecc71',
      break: '#7f8c8d', lunch: '#95a5a6', clock_in: '#27ae60', clock_out: '#e74c3c'
    };
    const minT = 7 * 60, maxT = 17 * 60, range = maxT - minT;
    return blocks.filter(b => b.start && b.end && b.type !== 'clock_in' && b.type !== 'clock_out').map(b => {
      const [sh, sm] = b.start.split(':').map(Number);
      const [eh, em] = b.end.split(':').map(Number);
      const s = sh * 60 + sm, e = eh * 60 + em;
      const left = ((s - minT) / range * 100).toFixed(1);
      const width = (((e - s) / range) * 100).toFixed(1);
      const color = TYPE_COLORS[b.type] || '#3498db';
      return `<div class="wg-block" style="left:${left}%;width:${width}%;background:${color}" title="${b.type}${b.memo ? ': '+b.memo : ''}"></div>`;
    }).join('');
  }

  // Settings button
  btnSettings.addEventListener('click', () => { Settings.open(); });

  // Title bar exit
  document.getElementById('titleBarExit').addEventListener('click', async () => {
    if (!confirm('Exit DayBuilder?')) return;
    await fetch('/api/shutdown', { method: 'POST' });
    window.close();
  });
})();
