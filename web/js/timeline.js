/* DayBuilder — timeline.js
   Graduated hour column, color-coded blocks, 5-min snap, resize-push */

const Timeline = (() => {
  let blocks = [];
  let history = [];
  let historyIdx = -1;
  let container = null;
  let onChangeCallback = null;
  let onSlotAddCallback = null;

  const PX_PER_MIN = 1.8; // pixels per minute
  const SNAP = 5; // snap to nearest 5 minutes
  const DAY_START = 7 * 60; // 7:00 AM
  const DAY_END = 17 * 60; // 5:00 PM

  const TYPE_COLORS = {
    asset_processing: '#3498db', project: '#9b59b6', admin: '#e67e22',
    meeting: '#1abc9c', '5s': '#f1c40f', learning: '#2ecc71',
    break: '#7f8c8d', lunch: '#95a5a6', clock_in: '#27ae60', clock_out: '#e74c3c'
  };

  const TYPE_LABELS = {
    asset_processing: 'Asset Processing', project: 'Project', admin: 'Admin',
    meeting: 'Meeting', '5s': '5S', learning: 'Learning',
    break: 'Break', lunch: 'Lunch', clock_in: 'Clock In', clock_out: 'Clock Out'
  };

  function init(el, onChange) {
    container = el;
    onChangeCallback = onChange;
    container.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('keydown', onKeyDown);
  }

  function setBlocks(newBlocks) {
    blocks = JSON.parse(JSON.stringify(newBlocks));
    pushHistory();
    render();
  }

  function getBlocks() { return JSON.parse(JSON.stringify(blocks)); }

  // --- History ---
  function pushHistory() {
    history = history.slice(0, historyIdx + 1);
    history.push(JSON.stringify(blocks));
    historyIdx = history.length - 1;
  }
  function undo() { if (historyIdx > 0) { historyIdx--; blocks = JSON.parse(history[historyIdx]); render(); notify(); } }
  function redo() { if (historyIdx < history.length - 1) { historyIdx++; blocks = JSON.parse(history[historyIdx]); render(); notify(); } }
  function onKeyDown(e) {
    if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
    if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
  }

  // --- Render ---
  function render() {
    if (!container) return;
    container.innerHTML = '';

    if (blocks.length === 0) {
      container.innerHTML = '<div class="timeline-empty">No blocks yet. Add an activity to start building your day.</div>';
      return;
    }

    // Build layout: hour gutter + blocks area
    const wrapper = document.createElement('div');
    wrapper.className = 'tl-wrapper';

    const gutter = document.createElement('div');
    gutter.className = 'tl-gutter';

    const track = document.createElement('div');
    track.className = 'tl-track';

    // Determine time range
    const sorted = [...blocks].sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    let minTime = DAY_START, maxTime = DAY_END;
    sorted.forEach(b => {
      const s = timeToMin(b.start);
      const e = timeToMin(b.end) || s;
      if (s < minTime) minTime = s;
      if (e > maxTime) maxTime = e;
    });
    // Round to hour boundaries
    minTime = Math.floor(minTime / 60) * 60;
    maxTime = Math.ceil(maxTime / 60) * 60;
    const totalMin = maxTime - minTime;
    const totalH = totalMin * PX_PER_MIN;

    track.style.height = totalH + 'px';
    track.style.position = 'relative';

    // Hour gutter lines
    for (let m = minTime; m <= maxTime; m += 60) {
      const hourEl = document.createElement('div');
      hourEl.className = 'tl-hour';
      hourEl.style.top = ((m - minTime) * PX_PER_MIN) + 'px';
      const h = m / 60;
      const ampm = h >= 12 ? 'pm' : 'am';
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      hourEl.textContent = `${h12} ${ampm}`;
      gutter.appendChild(hourEl);

      // Grid line on track
      const line = document.createElement('div');
      line.className = 'tl-gridline';
      line.style.top = ((m - minTime) * PX_PER_MIN) + 'px';
      track.appendChild(line);
    }

    // Render blocks positioned absolutely
    sorted.forEach(b => {
      const el = createBlockEl(b, minTime);
      track.appendChild(el);
    });

    // Render gaps
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      const prevEnd = isMarker(prev) ? prev.start : prev.end;
      if (prevEnd && cur.start && prevEnd < cur.start) {
        const gapEl = createGap(prevEnd, cur.start, minTime);
        track.appendChild(gapEl);
      }
    }

    wrapper.appendChild(gutter);
    wrapper.appendChild(track);
    container.appendChild(wrapper);
  }

  function isMarker(b) { return b.type === 'clock_in' || b.type === 'clock_out'; }

  function createBlockEl(block, minTime) {
    const el = document.createElement('div');
    el.className = 'tl-block';
    el.dataset.id = block.id;
    const color = TYPE_COLORS[block.type] || '#3498db';
    const label = TYPE_LABELS[block.type] || block.type;
    const startMin = timeToMin(block.start) || 0;
    const endMin = timeToMin(block.end) || startMin;

    const top = (startMin - minTime) * PX_PER_MIN;

    if (isMarker(block)) {
      el.classList.add('tl-marker');
      el.style.top = top + 'px';
      el.style.borderColor = color;
      el.innerHTML = `<span class="tl-marker-time">${fmtTime(block.start)}</span><span class="tl-marker-label">${label}</span>`;
      el.addEventListener('click', () => showPopover(block, el));
      return el;
    }

    const height = Math.max(20, (endMin - startMin) * PX_PER_MIN);
    el.style.top = top + 'px';
    el.style.height = height + 'px';
    el.style.backgroundColor = color + '22';
    el.style.borderLeftColor = color;

    const memo = block.memo ? ` — ${block.memo}` : '';
    const device = block.device ? ` · ${block.device}` : '';
    const qty = block.qty ? ` x${block.qty}` : '';

    el.innerHTML = `
      <div class="tl-block-header">
        <span class="tl-block-label">${label}${device}${qty}</span>
        <span class="tl-block-time">${fmtTime(block.start)} – ${fmtTime(block.end)}</span>
      </div>
      ${memo ? `<div class="tl-block-memo">${memo}</div>` : ''}
      <div class="tl-handle tl-handle-top" data-edge="top"></div>
      <div class="tl-handle tl-handle-bottom" data-edge="bottom"></div>
    `;

    el.addEventListener('click', (e) => {
      if (!e.target.classList.contains('tl-handle')) showPopover(block, el);
    });

    // Drag
    el.setAttribute('draggable', 'true');
    el.addEventListener('dragstart', (e) => {
      if (e.target.classList.contains('tl-handle')) { e.preventDefault(); return; }
      e.dataTransfer.setData('text/plain', block.id);
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));
    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drag-over'); });
    el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
    el.addEventListener('drop', (e) => {
      e.preventDefault(); el.classList.remove('drag-over');
      reorder(e.dataTransfer.getData('text/plain'), block.id);
    });

    // Resize handles
    el.querySelectorAll('.tl-handle').forEach(h => {
      h.addEventListener('pointerdown', (e) => startResize(e, block, h.dataset.edge));
    });

    return el;
  }

  // --- Resize (5-min snap, tooltip follows cursor, removed on pointerup) ---
  function startResize(e, block, edge) {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const origTime = edge === 'top' ? block.start : block.end;
    const handle = e.target;
    handle.setPointerCapture(e.pointerId);

    const tip = document.createElement('div');
    tip.className = 'tl-resize-tip';
    tip.textContent = fmtTime(origTime);
    document.body.appendChild(tip);
    tip.style.left = e.clientX + 12 + 'px';
    tip.style.top = e.clientY - 10 + 'px';

    const sorted = [...blocks].sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    const blockIdx = sorted.findIndex(b => b.id === block.id);

    function onMove(ev) {
      const dy = ev.clientY - startY;
      const minutesDelta = Math.round(dy / PX_PER_MIN / SNAP) * SNAP;
      const rawMin = timeToMin(origTime) + minutesDelta;
      const snapped = Math.round(rawMin / SNAP) * SNAP;
      const clamped = Math.max(0, Math.min(1439, snapped));
      const newTime = minToTime(clamped);

      if (edge === 'top') {
        block.start = newTime;
        if (blockIdx > 0) {
          const prev = sorted[blockIdx - 1];
          if (!isMarker(prev) && prev.end && timeToMin(prev.end) > clamped) {
            prev.end = newTime;
            updateBlock(prev, false);
          }
        }
      } else {
        block.end = newTime;
        if (blockIdx < sorted.length - 1) {
          const next = sorted[blockIdx + 1];
          if (!isMarker(next) && next.start && timeToMin(next.start) < clamped) {
            const dur = timeToMin(next.end) - timeToMin(next.start);
            next.start = newTime;
            next.end = minToTime(clamped + dur);
            updateBlock(next, false);
          }
        }
      }

      tip.textContent = fmtTime(newTime);
      tip.style.left = ev.clientX + 12 + 'px';
      tip.style.top = ev.clientY - 10 + 'px';
      updateBlock(block, false);
      render();
    }

    function onUp() {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      tip.remove();
      pushHistory();
      notify();
    }

    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
  }

  // --- Reorder ---
  function reorder(fromId, toId) {
    if (fromId === toId) return;
    const fromIdx = blocks.findIndex(b => b.id === fromId);
    const toIdx = blocks.findIndex(b => b.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = blocks.splice(fromIdx, 1);
    blocks.splice(toIdx, 0, moved);
    pushHistory(); render(); notify();
  }

  // --- Add / Delete ---
  function addBlock(block) {
    if (!block.id) block.id = crypto.randomUUID();
    blocks.push(block);
    pushHistory(); render(); notify();
  }

  function deleteBlock(id) {
    blocks = blocks.filter(b => b.id !== id);
    pushHistory(); render(); notify();
  }

  // --- Popover ---
  function showPopover(block, anchorEl) {
    closePopover();
    const pop = document.createElement('div');
    pop.className = 'tl-popover';
    const isM = isMarker(block);
    pop.innerHTML = `
      <label>Type<select class="pop-type">
        ${Object.entries(TYPE_LABELS).map(([k,v]) => `<option value="${k}" ${k===block.type?'selected':''}>${v}</option>`).join('')}
      </select></label>
      ${!isM ? `<label>Device<input class="pop-device" value="${block.device||''}"></label>
      <label>Qty<input class="pop-qty" type="number" value="${block.qty||''}"></label>` : ''}
      <label>Start<input class="pop-start" type="time" value="${block.start||''}" step="300"></label>
      ${!isM ? `<label>End<input class="pop-end" type="time" value="${block.end||''}" step="300"></label>` : ''}
      <label>Memo<input class="pop-memo" value="${block.memo||''}"></label>
      <div class="pop-actions">
        <button class="pop-save">Save</button>
        <button class="pop-delete">Delete</button>
        <button class="pop-close">Cancel</button>
      </div>
    `;
    pop.querySelector('.pop-save').onclick = () => {
      block.type = pop.querySelector('.pop-type').value;
      block.device = pop.querySelector('.pop-device')?.value || null;
      block.qty = parseInt(pop.querySelector('.pop-qty')?.value) || null;
      block.start = pop.querySelector('.pop-start').value || null;
      block.end = pop.querySelector('.pop-end')?.value || null;
      block.memo = pop.querySelector('.pop-memo').value || null;
      updateBlock(block, true); closePopover();
    };
    pop.querySelector('.pop-delete').onclick = () => { deleteBlock(block.id); closePopover(); };
    pop.querySelector('.pop-close').onclick = closePopover;
    container.appendChild(pop);
  }

  function closePopover() {
    const p = container.querySelector('.tl-popover');
    if (p) p.remove();
  }

  // --- Context menu ---
  function onContextMenu(e) {
    const blockEl = e.target.closest('.tl-block');
    if (!blockEl) return;
    e.preventDefault();
    if (confirm('Delete this block?')) deleteBlock(blockEl.dataset.id);
  }

  // --- Gaps ---
  function createGap(from, to, minTime) {
    const el = document.createElement('div');
    el.className = 'tl-gap';
    const top = (timeToMin(from) - minTime) * PX_PER_MIN;
    const height = Math.max(18, (timeToMin(to) - timeToMin(from)) * PX_PER_MIN);
    el.style.top = top + 'px';
    el.style.height = height + 'px';
    const mins = timeToMin(to) - timeToMin(from);
    el.innerHTML = `<span>${mins}m open</span>`;
    el.title = 'Double-click to add activity';
    el.addEventListener('dblclick', () => triggerSlotAdd(from, to));
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); triggerSlotAdd(from, to); });
    return el;
  }

  function triggerSlotAdd(start, end) { if (onSlotAddCallback) onSlotAddCallback(start, end); }
  function onSlotAdd(cb) { onSlotAddCallback = cb; }

  // --- Helpers ---
  function updateBlock(block, save) {
    const idx = blocks.findIndex(b => b.id === block.id);
    if (idx >= 0) blocks[idx] = { ...blocks[idx], ...block };
    if (save) { pushHistory(); render(); notify(); }
  }
  function notify() { if (onChangeCallback) onChangeCallback(getBlocks()); }
  function timeToMin(t) { if (!t) return 0; const [h, m] = t.split(':').map(Number); return h * 60 + m; }
  function minToTime(m) { const h = Math.floor(Math.max(0, m) / 60) % 24; const min = ((m % 60) + 60) % 60; return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`; }
  function fmtTime(t) {
    if (!t) return '?';
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'pm' : 'am';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
  }

  return { init, setBlocks, getBlocks, addBlock, deleteBlock, undo, redo, render, onSlotAdd };
})();
