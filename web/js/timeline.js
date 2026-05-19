/* DayBuilder — timeline.js
   Graduated hour column, color-coded blocks, 5-min snap, drop zones, speech-bubble popover */

const Timeline = (() => {
  let blocks = [];
  let history = [];
  let historyIdx = -1;
  let container = null;
  let onChangeCallback = null;
  let onSlotAddCallback = null;

  const PX_PER_MIN = 1.8;
  const SNAP = 5;
  const DAY_START = 7 * 60;
  const DAY_END = 17 * 60;

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
  function setBlocks(nb) { blocks = JSON.parse(JSON.stringify(nb)); pushHistory(); render(); }
  function getBlocks() { return JSON.parse(JSON.stringify(blocks)); }

  function pushHistory() { history = history.slice(0, historyIdx + 1); history.push(JSON.stringify(blocks)); historyIdx = history.length - 1; }
  function undo() { if (historyIdx > 0) { historyIdx--; blocks = JSON.parse(history[historyIdx]); render(); notify(); } }
  function redo() { if (historyIdx < history.length - 1) { historyIdx++; blocks = JSON.parse(history[historyIdx]); render(); notify(); } }
  function onKeyDown(e) { if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); } if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); } }

  // --- Render ---
  function render() {
    if (!container) return;
    container.innerHTML = '';
    if (blocks.length === 0) { container.innerHTML = '<div class="timeline-empty">No blocks yet. Add an activity to start building your day.</div>'; return; }

    const wrapper = document.createElement('div');
    wrapper.className = 'tl-wrapper';
    const gutter = document.createElement('div');
    gutter.className = 'tl-gutter';
    const track = document.createElement('div');
    track.className = 'tl-track';

    const sorted = [...blocks].sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    let minTime = DAY_START, maxTime = DAY_END;
    sorted.forEach(b => { const s = timeToMin(b.start); const e = timeToMin(b.end) || s; if (s < minTime) minTime = s; if (e > maxTime) maxTime = e; });
    minTime = Math.floor(minTime / 60) * 60;
    maxTime = Math.ceil(maxTime / 60) * 60;
    const totalH = (maxTime - minTime) * PX_PER_MIN;
    track.style.height = totalH + 'px';
    track.style.position = 'relative';

    // Hour gutter + gridlines
    for (let m = minTime; m <= maxTime; m += 60) {
      const hourEl = document.createElement('div');
      hourEl.className = 'tl-hour';
      hourEl.style.top = ((m - minTime) * PX_PER_MIN) + 'px';
      const h = m / 60, ampm = h >= 12 ? 'pm' : 'am', h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      hourEl.textContent = h12 + ' ' + ampm;
      gutter.appendChild(hourEl);
      const line = document.createElement('div');
      line.className = 'tl-gridline';
      line.style.top = ((m - minTime) * PX_PER_MIN) + 'px';
      track.appendChild(line);
    }

    // Drop zones every 15 min
    for (let m = minTime; m < maxTime; m += 15) {
      const dz = document.createElement('div');
      dz.className = 'tl-dropzone';
      dz.style.top = ((m - minTime) * PX_PER_MIN) + 'px';
      dz.style.height = (15 * PX_PER_MIN) + 'px';
      dz.dataset.time = minToTime(m);
      dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('dz-hover'); });
      dz.addEventListener('dragleave', () => dz.classList.remove('dz-hover'));
      dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('dz-hover'); moveBlockToTime(e.dataTransfer.getData('text/plain'), minToTime(m)); });
      track.appendChild(dz);
    }

    // Blocks
    sorted.forEach(b => track.appendChild(createBlockEl(b, minTime)));

    // Gaps
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1], cur = sorted[i];
      const prevEnd = isMarker(prev) ? prev.start : prev.end;
      if (prevEnd && cur.start && prevEnd < cur.start) track.appendChild(createGap(prevEnd, cur.start, minTime));
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
      el.style.borderTopColor = color;
      el.style.zIndex = '10';
      el.innerHTML = `<span class="tl-marker-time">${fmtTime(block.start)}</span><span class="tl-marker-label">${label}</span>`;
      el.addEventListener('click', (e) => { e.stopPropagation(); showPopover(block, el); });
      return el;
    }

    const height = Math.max(24, (endMin - startMin) * PX_PER_MIN);
    el.style.top = top + 'px';
    el.style.height = height + 'px';
    el.style.backgroundColor = color + '22';
    el.style.borderLeftColor = color;

    const device = block.device ? ` · ${block.device}` : '';
    const qty = block.qty ? ` x${block.qty}` : '';
    const memo = block.memo ? ` — ${block.memo}` : '';

    el.innerHTML = `
      <div class="tl-block-header">
        <span class="tl-block-label">${label}${device}${qty}</span>
        <span class="tl-block-time">${fmtTime(block.start)} – ${fmtTime(block.end)}</span>
      </div>
      ${memo ? `<div class="tl-block-memo">${memo}</div>` : ''}
      <div class="tl-handle tl-handle-top" data-edge="top"></div>
      <div class="tl-handle tl-handle-bottom" data-edge="bottom"></div>
    `;

    el.addEventListener('click', (e) => { if (!e.target.classList.contains('tl-handle')) showPopover(block, el); });

    // Drag
    el.setAttribute('draggable', 'true');
    el.addEventListener('dragstart', (e) => { if (e.target.classList.contains('tl-handle')) { e.preventDefault(); return; } e.dataTransfer.setData('text/plain', block.id); el.classList.add('dragging'); });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));

    // Resize
    el.querySelectorAll('.tl-handle').forEach(h => { h.addEventListener('pointerdown', (e) => startResize(e, block, h.dataset.edge)); });

    return el;
  }

  // --- Resize ---
  function startResize(e, block, edge) {
    e.preventDefault(); e.stopPropagation();
    const startY = e.clientY;
    const origTime = edge === 'top' ? block.start : block.end;
    const tip = document.createElement('div');
    tip.className = 'tl-resize-tip';
    tip.textContent = fmtTime(origTime);
    tip.style.left = e.clientX + 12 + 'px';
    tip.style.top = e.clientY - 10 + 'px';
    document.body.appendChild(tip);

    const sorted = [...blocks].sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    const blockIdx = sorted.findIndex(b => b.id === block.id);

    function onMove(ev) {
      const dy = ev.clientY - startY;
      const clamped = Math.max(0, Math.min(1439, Math.round((timeToMin(origTime) + Math.round(dy / PX_PER_MIN / SNAP) * SNAP) / SNAP) * SNAP));
      const newTime = minToTime(clamped);
      if (edge === 'top') {
        block.start = newTime;
        if (blockIdx > 0 && !isMarker(sorted[blockIdx - 1]) && sorted[blockIdx - 1].end && timeToMin(sorted[blockIdx - 1].end) > clamped) { sorted[blockIdx - 1].end = newTime; updateBlock(sorted[blockIdx - 1], false); }
      } else {
        block.end = newTime;
        if (blockIdx < sorted.length - 1 && !isMarker(sorted[blockIdx + 1]) && sorted[blockIdx + 1].start && timeToMin(sorted[blockIdx + 1].start) < clamped) { const d = timeToMin(sorted[blockIdx + 1].end) - timeToMin(sorted[blockIdx + 1].start); sorted[blockIdx + 1].start = newTime; sorted[blockIdx + 1].end = minToTime(clamped + d); updateBlock(sorted[blockIdx + 1], false); }
      }
      tip.textContent = fmtTime(newTime);
      tip.style.left = ev.clientX + 12 + 'px';
      tip.style.top = ev.clientY - 10 + 'px';
      updateBlock(block, false);
    }

    function onUp() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      tip.remove();
      render(); pushHistory(); notify();
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  // --- Move / Reorder ---
  function moveBlockToTime(blockId, newStart) {
    const idx = blocks.findIndex(b => b.id === blockId);
    if (idx < 0) return;
    const block = blocks[idx];
    const dur = timeToMin(block.end) - timeToMin(block.start);
    block.start = newStart;
    block.end = dur > 0 ? minToTime(timeToMin(newStart) + dur) : null;
    pushHistory(); render(); notify();
  }

  function addBlock(block) {
    if (!block.id) block.id = crypto.randomUUID();
    // Replace existing clock_in/clock_out instead of duplicating
    if (block.type === 'clock_in' || block.type === 'clock_out') {
      blocks = blocks.filter(b => b.type !== block.type);
    }
    blocks.push(block);
    pushHistory(); render(); notify();
  }
  function deleteBlock(id) { blocks = blocks.filter(b => b.id !== id); pushHistory(); render(); notify(); }

  function splitBlock(block, splitTime) {
    const idx = blocks.findIndex(b => b.id === block.id);
    if (idx < 0) return;
    const b1 = { ...block, id: crypto.randomUUID(), end: splitTime };
    const b2 = { ...block, id: crypto.randomUUID(), start: splitTime, qty: null };
    blocks.splice(idx, 1, b1, b2);
    pushHistory(); render(); notify();
  }

  // --- Popover (speech bubble, anchored to block) ---
  function showPopover(block, anchorEl) {
    closePopover();
    const pop = document.createElement('div');
    pop.className = 'tl-popover';
    // Position as speech bubble to the right of the block
    const rect = anchorEl.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    pop.style.position = 'fixed';
    pop.style.left = (rect.right + 10) + 'px';
    pop.style.top = rect.top + 'px';

    const isM = isMarker(block);
    const midTime = (!isM && block.start && block.end) ? minToTime(Math.round((timeToMin(block.start) + timeToMin(block.end)) / 2 / SNAP) * SNAP) : '';
    pop.innerHTML = `
      <div class="pop-arrow"></div>
      <label>Type<select class="pop-type">${Object.entries(TYPE_LABELS).map(([k,v]) => `<option value="${k}" ${k===block.type?'selected':''}>${v}</option>`).join('')}</select></label>
      ${!isM ? `<label>Device<input class="pop-device" value="${block.device||''}"></label><label>Qty<input class="pop-qty" type="number" value="${block.qty||''}"></label>` : ''}
      <label>Start<input class="pop-start" type="time" value="${block.start||''}" step="300"></label>
      ${!isM ? `<label>End<input class="pop-end" type="time" value="${block.end||''}" step="300"></label>` : ''}
      <label>Memo<input class="pop-memo" value="${block.memo||''}"></label>
      ${!isM && block.start && block.end ? `<div class="pop-split"><label>Split at<input class="pop-split-time" type="time" value="${midTime}" step="300"></label><button class="pop-split-btn">✂ Split</button></div>` : ''}
      <div class="pop-actions"><button class="pop-save">Save</button><button class="pop-delete">Delete</button><button class="pop-close">✕</button></div>
    `;
    pop.querySelector('.pop-save').onclick = () => { block.type = pop.querySelector('.pop-type').value; block.device = pop.querySelector('.pop-device')?.value || null; block.qty = parseInt(pop.querySelector('.pop-qty')?.value) || null; block.start = pop.querySelector('.pop-start').value || null; block.end = pop.querySelector('.pop-end')?.value || null; block.memo = pop.querySelector('.pop-memo').value || null; updateBlock(block, true); closePopover(); };
    pop.querySelector('.pop-delete').onclick = () => { deleteBlock(block.id); closePopover(); };
    pop.querySelector('.pop-close').onclick = closePopover;
    const splitBtn = pop.querySelector('.pop-split-btn');
    if (splitBtn) {
      splitBtn.onclick = () => {
        const splitTime = pop.querySelector('.pop-split-time').value;
        if (!splitTime || splitTime <= block.start || splitTime >= block.end) return;
        splitBlock(block, splitTime);
        closePopover();
      };
    }
    document.body.appendChild(pop);
    // Close on outside click or Escape
    setTimeout(() => { document.addEventListener('click', outsideClose); document.addEventListener('keydown', popKeyHandler); }, 0);
  }

  function outsideClose(e) { if (!e.target.closest('.tl-popover')) closePopover(); }
  function popKeyHandler(e) { if (e.key === 'Escape') closePopover(); }
  function closePopover() { document.removeEventListener('click', outsideClose); document.removeEventListener('keydown', popKeyHandler); const p = document.querySelector('.tl-popover'); if (p) p.remove(); }

  function onContextMenu(e) { const el = e.target.closest('.tl-block'); if (!el) return; e.preventDefault(); if (confirm('Delete this block?')) deleteBlock(el.dataset.id); }

  // --- Gaps ---
  function createGap(from, to, minTime) {
    const el = document.createElement('div');
    el.className = 'tl-gap';
    el.style.top = ((timeToMin(from) - minTime) * PX_PER_MIN) + 'px';
    el.style.height = Math.max(18, (timeToMin(to) - timeToMin(from)) * PX_PER_MIN) + 'px';
    el.innerHTML = `<span>${timeToMin(to) - timeToMin(from)}m open</span>`;
    el.title = 'Double-click to add activity';
    el.addEventListener('dblclick', () => { if (onSlotAddCallback) onSlotAddCallback(from, to); });
    return el;
  }

  function onSlotAdd(cb) { onSlotAddCallback = cb; }

  // --- Helpers ---
  function updateBlock(block, save) { const idx = blocks.findIndex(b => b.id === block.id); if (idx >= 0) blocks[idx] = { ...blocks[idx], ...block }; if (save) { pushHistory(); render(); notify(); } }
  function notify() { if (onChangeCallback) onChangeCallback(getBlocks()); }
  function timeToMin(t) { if (!t) return 0; const [h, m] = t.split(':').map(Number); return h * 60 + m; }
  function minToTime(m) { const h = Math.floor(Math.max(0, m) / 60) % 24; const min = ((m % 60) + 60) % 60; return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`; }
  function fmtTime(t) { if (!t) return '?'; const [h, m] = t.split(':').map(Number); const ampm = h >= 12 ? 'pm' : 'am'; const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h; return `${h12}:${String(m).padStart(2,'0')} ${ampm}`; }

  return { init, setBlocks, getBlocks, addBlock, deleteBlock, undo, redo, render, onSlotAdd };
})();
