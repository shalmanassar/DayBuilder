/* DayBuilder — guided.js
   Guided entry modal: step-by-step flow for adding activities */

const Guided = (() => {
  let modal = null;
  let state = {};
  let config = null;
  let onComplete = null;

  async function loadConfig() {
    if (config) return config;
    const res = await fetch('/api/config');
    config = (await res.json()).shared;
    return config;
  }

  let prefill = null;

  function open(callback, pf) {
    onComplete = callback;
    state = {};
    prefill = pf || null;
    showStep('type');
  }

  function close() {
    if (modal) { modal.remove(); modal = null; }
    document.removeEventListener('keydown', modalKeyHandler);
  }

  function modalKeyHandler(e) {
    if (e.key === 'Escape') { close(); }
    if (e.key === 'Enter') {
      const btn = modal && modal.querySelector('.guided-done, .guided-next, .guided-btn.guided-done');
      if (btn) btn.click();
    }
  }

  function showStep(step) {
    close();
    modal = document.createElement('div');
    modal.className = 'guided-overlay';
    modal.innerHTML = '<div class="guided-modal"><div class="guided-content"></div></div>';
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    document.addEventListener('keydown', modalKeyHandler);
    document.body.appendChild(modal);
    const content = modal.querySelector('.guided-content');

    switch (step) {
      case 'type': renderTypeStep(content); break;
      case 'clocktime': renderClockTimeStep(content); break;
      case 'path': renderPathStep(content); break;
      case 'device': renderDeviceStep(content); break;
      case 'qty': renderQtyStep(content); break;
      case 'time': renderTimeStep(content); break;
      case 'memo': renderMemoStep(content); break;
      case 'recents': renderRecentsStep(content); break;
    }
  }

  // Step 1: What kind of work?
  function renderTypeStep(el) {
    el.innerHTML = `<h2>What kind of work?</h2><div class="guided-grid"></div>`;
    const grid = el.querySelector('.guided-grid');
    const types = [
      { id: 'asset_processing', label: 'Asset Processing', icon: '🔧' },
      { id: 'project', label: 'Project', icon: '📁' },
      { id: 'admin', label: 'Admin', icon: '📋' },
      { id: 'meeting', label: 'Meeting', icon: '👥' },
      { id: '5s', label: '5S', icon: '🧹' },
      { id: 'learning', label: 'Learning', icon: '📚' },
      { id: 'break', label: 'Break', icon: '☕' },
      { id: 'lunch', label: 'Lunch', icon: '🍔' },
      { id: 'clock_in', label: 'Clock In', icon: '▶' },
      { id: 'clock_out', label: 'Clock Out', icon: '⏹' },
    ];
    types.forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'guided-btn';
      btn.innerHTML = `<span class="guided-icon">${t.icon}</span>${t.label}`;
      btn.onclick = () => {
        state.type = t.id;
        // Route based on type
        if (['break', 'lunch', '5s', 'clock_in', 'clock_out'].includes(t.id)) {
          quickAdd(t.id);
        } else if (t.id === 'asset_processing') {
          showStep('path');
        } else {
          // project, admin, meeting, learning
          showStep('recents');
        }
      };
      grid.appendChild(btn);
    });
  }

  // Step 2 (Asset Processing): Which path?
  // Clock time picker step
  function renderClockTimeStep(el) {
    const label = state.type === 'clock_in' ? 'Clock In' : 'Clock Out';
    el.innerHTML = `
      <h2>${label} Time</h2>
      <input type="time" class="guided-memo-input" id="clockTimeInput" step="60" autofocus>
      <button class="guided-btn guided-done" style="margin-top:1rem">Set ${label} ✓</button>
      <button class="guided-back">← Back</button>
    `;
    el.querySelector('.guided-back').onclick = () => showStep('type');
    el.querySelector('.guided-done').onclick = () => {
      const val = document.getElementById('clockTimeInput').value;
      if (!val) return;
      state.start = val;
      state.end = null;
      state.memo = null;
      finish();
    };
  }


  async function renderPathStep(el) {
    await loadConfig();
    el.innerHTML = `<h2>Which path?</h2><div class="guided-grid"></div><button class="guided-back">← Back</button>`;
    el.querySelector('.guided-back').onclick = () => showStep('type');
    const grid = el.querySelector('.guided-grid');
    config.asset_paths.forEach(p => {
      const btn = document.createElement('button');
      btn.className = 'guided-btn';
      btn.textContent = p.display;
      btn.onclick = () => { state.subtype = p.id; showStep('device'); };
      grid.appendChild(btn);
    });
  }

  // Step 3: Which device?
  async function renderDeviceStep(el) {
    await loadConfig();
    el.innerHTML = `<h2>Which device?</h2><div class="guided-grid"></div><button class="guided-back">← Back</button>`;
    el.querySelector('.guided-back').onclick = () => showStep('path');
    const grid = el.querySelector('.guided-grid');
    config.device_types.forEach(d => {
      const btn = document.createElement('button');
      btn.className = 'guided-btn';
      btn.textContent = d.display;
      btn.onclick = () => { state.device = d.id; showStep('qty'); };
      grid.appendChild(btn);
    });
  }

  // Step 4: How many?
  function renderQtyStep(el) {
    el.innerHTML = `<h2>How many?</h2><div class="guided-numpad"></div><div class="guided-qty-display">0</div><button class="guided-back">← Back</button>`;
    el.querySelector('.guided-back').onclick = () => showStep('device');
    const display = el.querySelector('.guided-qty-display');
    const pad = el.querySelector('.guided-numpad');
    let val = '';

    [1,2,3,4,5,6,7,8,9,'C',0,'✓'].forEach(n => {
      const btn = document.createElement('button');
      btn.className = 'guided-num';
      btn.textContent = n;
      btn.onclick = () => {
        if (n === 'C') { val = ''; display.textContent = '0'; }
        else if (n === '✓') { state.qty = parseInt(val) || 1; showStep('time'); }
        else { val += n; display.textContent = val; }
      };
      pad.appendChild(btn);
    });
  }

  // Step 5: Time
  function renderTimeStep(el) {
    const blocks = Timeline.getBlocks();
    const lastEnd = blocks.length > 0 ? blocks[blocks.length - 1].end : '07:00';
    const pfStart = (prefill && prefill.start) || lastEnd;
    const pfEnd = (prefill && prefill.end) || addMin(pfStart, 60);

    el.innerHTML = `
      <h2>Time</h2>
      <div class="guided-time-options">
        <label><input type="radio" name="tmode" value="duration" ${prefill ? '' : 'checked'}> About how long?</label>
        <div class="time-duration" ${prefill ? 'style="display:none"' : ''}>
          <input type="number" class="dur-h" value="1" min="0" max="12" style="width:3rem"> h
          <input type="number" class="dur-m" value="0" min="0" max="55" step="5" style="width:3rem"> m
        </div>
        <label><input type="radio" name="tmode" value="range" ${prefill ? 'checked' : ''}> Started at / ended at</label>
        <div class="time-range" ${prefill ? '' : 'style="display:none"'}>
          <input type="time" class="t-start" value="${pfStart}"> → <input type="time" class="t-end" value="${pfEnd}">
        </div>
        <label><input type="radio" name="tmode" value="after"> Place after previous block</label>
      </div>
      <button class="guided-btn guided-next">Next →</button>
      <button class="guided-back">← Back</button>
    `;
    el.querySelector('.guided-back').onclick = () => showStep('qty');

    // Toggle visibility
    el.querySelectorAll('input[name="tmode"]').forEach(r => {
      r.onchange = () => {
        el.querySelector('.time-duration').style.display = r.value === 'duration' ? '' : 'none';
        el.querySelector('.time-range').style.display = r.value === 'range' ? '' : 'none';
      };
    });

    el.querySelector('.guided-next').onclick = () => {
      const mode = el.querySelector('input[name="tmode"]:checked').value;
      if (mode === 'duration') {
        const h = parseInt(el.querySelector('.dur-h').value) || 0;
        const m = parseInt(el.querySelector('.dur-m').value) || 0;
        state.start = pfStart;
        state.end = addMin(pfStart, h * 60 + m);
      } else if (mode === 'range') {
        state.start = el.querySelector('.t-start').value;
        state.end = el.querySelector('.t-end').value;
      } else {
        state.start = pfStart;
        state.end = null; // unset until resized
      }
      showStep('memo');
    };
  }

  // Step 6: Memo
  function renderMemoStep(el) {
    el.innerHTML = `
      <h2>Memo <small>(optional)</small></h2>
      <input type="text" class="guided-memo-input" placeholder="Notes about this block..." autofocus>
      <button class="guided-btn guided-done">Done ✓</button>
      <button class="guided-back">← Back</button>
    `;
    el.querySelector('.guided-back').onclick = () => showStep('time');
    el.querySelector('.guided-done').onclick = () => {
      state.memo = el.querySelector('.guided-memo-input').value || null;
      finish();
    };
    el.querySelector('.guided-memo-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { state.memo = e.target.value || null; finish(); }
    });
  }

  // Recents step (project/admin/meeting/learning)
  async function renderRecentsStep(el) {
    el.innerHTML = `<h2>${state.type.replace(/_/g,' ')}</h2><div class="guided-recents">Loading...</div><button class="guided-back">← Back</button>`;
    el.querySelector('.guided-back').onclick = () => showStep('type');

    const recents = await fetch(`/api/recents/${state.type}`).then(r => r.json());
    const list = el.querySelector('.guided-recents');
    list.innerHTML = '';

    recents.forEach(item => {
      const btn = document.createElement('button');
      btn.className = 'guided-btn guided-recent';
      btn.textContent = item;
      btn.onclick = () => { state.memo = item; showStep('time'); };
      list.appendChild(btn);
    });

    // + New option
    const newBtn = document.createElement('button');
    newBtn.className = 'guided-btn guided-new';
    newBtn.textContent = '+ New';
    newBtn.onclick = () => showStep('time');
    list.appendChild(newBtn);
  }

  // Quick-add (break/lunch/5s/clock_in/clock_out)
  function quickAdd(type) {
    const blocks = Timeline.getBlocks();
    const lastEnd = blocks.length > 0 ? (blocks[blocks.length - 1].end || blocks[blocks.length - 1].start) : '07:00';
    const durations = { break: 15, lunch: 30, '5s': 30 };

    if (type === 'clock_in' || type === 'clock_out') {
      // Markers: prompt for time
      state.type = type;
      showStep('clocktime');
      return;
    }

    const dur = durations[type] || 15;
    state.start = lastEnd;
    state.end = addMin(lastEnd, dur);
    state.memo = null;
    finish();
  }

  function finish() {
    const block = {
      id: crypto.randomUUID(),
      type: state.type,
      subtype: state.subtype || null,
      device: state.device || null,
      qty: state.qty || null,
      start: state.start,
      end: state.end,
      memo: state.memo || null
    };
    close();
    if (onComplete) onComplete(block);
  }

  function addMin(time, mins) {
    if (!time) return '08:00';
    const [h, m] = time.split(':').map(Number);
    const total = h * 60 + m + mins;
    return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  return { open, close };
})();
