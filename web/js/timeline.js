/* DayBuilder — timeline.js
   Graduated hour column, color-coded blocks, 15-min snap, pointer drag-to-move,
   locked blocks, split/snap around locked blocks */

const Timeline = (() => {
  let blocks = [];
  let history = [];
  let historyIdx = -1;
  let container = null;
  let onChangeCallback = null;
  let onSlotAddCallback = null;
  let viewingDate = null;
  let nowInterval = null;

  const PX_PER_MIN = 1.8;
  const SNAP = 15;
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

  function snapTo(min) { return Math.round(min / SNAP) * SNAP; }

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
    track.dataset.minTime = minTime;

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

    // Blocks
    sorted.forEach(b => track.appendChild(createBlockEl(b, minTime)));

    // Gaps
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1], cur = sorted[i];
      const prevEnd = isMarker(prev) ? prev.start : prev.end;
      if (prevEnd && cur.start && prevEnd < cur.start) track.appendChild(createGap(prevEnd, cur.start, minTime));
    }

    // Accept palette drops
    track.addEventListener('dragover', (e) => {
      if (e.dataTransfer.types.includes('application/x-palette-type')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    });
    track.addEventListener('drop', (e) => {
      const type = e.dataTransfer.getData('application/x-palette-type');
      if (!type) return;
      e.preventDefault();
      const memo = e.dataTransfer.getData('application/x-palette-memo') || null;
      const trackRect = track.getBoundingClientRect();
      const relY = e.clientY - trackRect.top;
      const rawMin = minTime + relY / PX_PER_MIN;
      const snapped = snapTo(rawMin);
      const start = minToTime(snapped);
      const end = minToTime(snapped + 15);
      addBlock({ id: crypto.randomUUID(), type, start, end, memo, device: null, qty: null });
    });

    wrapper.appendChild(gutter);
    wrapper.appendChild(track);
    container.appendChild(wrapper);
    updateNowLine();
  }

  function isMarker(b) { return b.type === 'clock_in' || b.type === 'clock_out'; }

  function createBlockEl(block, minTime) {
    const el = document.createElement('div');
    el.className = 'tl-block';
    if (block.locked) el.classList.add('tl-locked');
    el.dataset.id = block.id;
    const color = TYPE_COLORS[block.type] || '#3498db';
    const label = TYPE_LABELS[block.type] || block.type;
    const startMin = timeToMin(block.start) || 0;
    const endMin = timeToMin(block.end) || (startMin + 15);
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
    const lockIcon = block.locked ? '<span class="tl-lock-icon">🔒</span>' : '';

    el.innerHTML = `
      <div class="tl-block-header">
        <span class="tl-block-label">${lockIcon}${label}${device}${qty}</span>
        <span class="tl-block-time">${fmtTime(block.start)} – ${fmtTime(block.end)}</span>
      </div>
      ${memo ? `<div class="tl-block-memo">${memo}</div>` : ''}
      ${!block.locked ? `<div class="tl-handle tl-handle-top" data-edge="top"><span class="tl-handle-bar"></span></div>
      <div class="tl-handle tl-handle-bottom" data-edge="bottom"><span class="tl-handle-bar"></span></div>` : ''}
    `;

    // Pointer interactions (click vs drag)
    let pDown = null;
    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.tl-handle')) return;
      pDown = { x: e.clientX, y: e.clientY };
      if (!block.locked) el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!pDown || block.locked) return;
      const dy = Math.abs(e.clientY - pDown.y);
      if (dy > 5 && !el.classList.contains('tl-dragging')) {
        el.classList.add('tl-dragging');
        startDragMove(e, block, pDown.y);
        pDown = null;
      }
    });
    el.addEventListener('pointerup', (e) => {
      if (!pDown) return;
      const dx = Math.abs(e.clientX - pDown.x), dy = Math.abs(e.clientY - pDown.y);
      if (dx < 5 && dy < 5) showPopover(block, el);
      pDown = null;
    });

    // Resize handles (only if not locked)
    if (!block.locked) {
      el.querySelectorAll('.tl-handle').forEach(h => {
        h.addEventListener('pointerdown', (e) => startResize(e, block, h.dataset.edge));
        h.addEventListener('dblclick', (e) => { e.stopPropagation(); fillToAdjacent(block, h.dataset.edge); });
      });
    }

    return el;
  }

  // --- Double-click handle: fill to adjacent block edge ---
  function fillToAdjacent(block, edge) {
    const sorted = [...blocks].filter(b => !isMarker(b)).sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    const idx = sorted.findIndex(b => b.id === block.id);
    if (idx < 0) return;

    if (edge === 'top') {
      // Fill up to previous block's end (or day start)
      const prev = sorted[idx - 1];
      const target = prev ? timeToMin(prev.end) : DAY_START;
      block.start = minToTime(target);
    } else {
      // Fill down to next block's start (or day end)
      const next = sorted[idx + 1];
      const target = next ? timeToMin(next.start) : DAY_END;
      block.end = minToTime(target);
    }
    pushHistory(); render(); notify();
  }

  // --- Pointer-based drag-to-move ---
  function startDragMove(e, block, startY) {
    const origStart = timeToMin(block.start);
    const dur = timeToMin(block.end) - origStart;
    const track = container.querySelector('.tl-track');
    const minTime = parseInt(track.dataset.minTime);

    const ghost = document.createElement('div');
    ghost.className = 'tl-drag-ghost';
    ghost.style.height = (dur * PX_PER_MIN) + 'px';
    ghost.textContent = (TYPE_LABELS[block.type] || block.type) + ' (' + dur + 'm)';
    track.appendChild(ghost);

    function positionGhost(clientY) {
      const trackRect = track.getBoundingClientRect();
      const relY = clientY - trackRect.top;
      const rawMin = minTime + relY / PX_PER_MIN;
      const snapped = snapTo(rawMin);
      ghost.style.top = ((snapped - minTime) * PX_PER_MIN) + 'px';
      ghost.dataset.snapped = snapped;
    }
    positionGhost(e.clientY);

    function onMove(ev) { positionGhost(ev.clientY); }
    function onUp() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      const newStart = parseInt(ghost.dataset.snapped);
      ghost.remove();
      if (!isNaN(newStart) && newStart !== origStart) {
        applyMoveWithLockLogic(block, newStart, dur);
      }
      // Remove dragging class from all blocks
      container.querySelectorAll('.tl-dragging').forEach(el => el.classList.remove('tl-dragging'));
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  // --- Lock-aware move logic ---
  function applyMoveWithLockLogic(block, newStart, dur) {
    const newEnd = newStart + dur;
    const lockedBlocks = blocks.filter(b => b.locked && b.id !== block.id && !isMarker(b));

    // Check collision with any locked block
    for (const lb of lockedBlocks) {
      const ls = timeToMin(lb.start), le = timeToMin(lb.end);
      if (newStart < le && newEnd > ls) {
        // Collision! Snap to nearest side of locked block
        const snapBefore = ls - dur; // place entirely before locked
        const snapAfter = le;        // place entirely after locked
        const distBefore = Math.abs(newStart - snapBefore);
        const distAfter = Math.abs(newStart - snapAfter);

        if (dur > (ls - snapTo(0)) && dur > (snapTo(1440) - le)) {
          // Block is too long to fit on either side — split it
          splitAroundLocked(block, lb);
          return;
        }

        const finalStart = distBefore <= distAfter ? snapTo(snapBefore) : snapTo(snapAfter);
        block.start = minToTime(finalStart);
        block.end = minToTime(finalStart + dur);
        pushHistory(); render(); notify();
        return;
      }
    }

    // No collision — just move
    block.start = minToTime(newStart);
    block.end = minToTime(newEnd);
    pushHistory(); render(); notify();
  }

  function splitAroundLocked(block, lockedBlock) {
    const ls = timeToMin(lockedBlock.start), le = timeToMin(lockedBlock.end);
    const bs = timeToMin(block.start), be = timeToMin(block.end);
    const idx = blocks.findIndex(b => b.id === block.id);
    if (idx < 0) return;

    const b1 = { ...block, id: crypto.randomUUID(), start: block.start, end: minToTime(ls) };
    const b2 = { ...block, id: crypto.randomUUID(), start: minToTime(le), end: block.end, qty: null };
    blocks.splice(idx, 1, b1, b2);
    pushHistory(); render(); notify();
  }

  // --- Resize (lock-aware) ---
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
      const rawMin = timeToMin(origTime) + dy / PX_PER_MIN;
      const clamped = Math.max(0, Math.min(1439, snapTo(rawMin)));
      const newTime = minToTime(clamped);

      if (edge === 'top') {
        // Don't resize into a locked block
        const lockedAbove = blocks.filter(b => b.locked && b.id !== block.id && !isMarker(b) && timeToMin(b.end) > clamped && timeToMin(b.start) < timeToMin(block.end));
        if (lockedAbove.length) {
          const nearest = Math.max(...lockedAbove.map(b => timeToMin(b.end)));
          block.start = minToTime(Math.max(clamped, nearest));
        } else {
          block.start = newTime;
          // Push non-locked neighbors
          if (blockIdx > 0 && !isMarker(sorted[blockIdx - 1]) && !sorted[blockIdx - 1].locked && sorted[blockIdx - 1].end && timeToMin(sorted[blockIdx - 1].end) > clamped) {
            sorted[blockIdx - 1].end = newTime;
            updateBlock(sorted[blockIdx - 1], false);
          }
        }
      } else {
        // Don't resize into a locked block
        const lockedBelow = blocks.filter(b => b.locked && b.id !== block.id && !isMarker(b) && timeToMin(b.start) < clamped && timeToMin(b.end) > timeToMin(block.start));
        if (lockedBelow.length) {
          const nearest = Math.min(...lockedBelow.map(b => timeToMin(b.start)));
          block.end = minToTime(Math.min(clamped, nearest));
        } else {
          block.end = newTime;
          // Push non-locked neighbors
          if (blockIdx < sorted.length - 1 && !isMarker(sorted[blockIdx + 1]) && !sorted[blockIdx + 1].locked && sorted[blockIdx + 1].start && timeToMin(sorted[blockIdx + 1].start) < clamped) {
            const d = timeToMin(sorted[blockIdx + 1].end) - timeToMin(sorted[blockIdx + 1].start);
            sorted[blockIdx + 1].start = newTime;
            sorted[blockIdx + 1].end = minToTime(clamped + d);
            updateBlock(sorted[blockIdx + 1], false);
          }
        }
      }
      tip.textContent = fmtTime(edge === 'top' ? block.start : block.end);
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

  // --- Lock toggle ---
  function toggleLock(blockId) {
    const b = blocks.find(b => b.id === blockId);
    if (b) { b.locked = !b.locked; pushHistory(); render(); notify(); }
  }

  // --- Add / Delete / Split ---
  function addBlock(block) {
    if (!block.id) block.id = crypto.randomUUID();
    if (block.type === 'clock_in' || block.type === 'clock_out') {
      blocks = blocks.filter(b => b.type !== block.type);
      blocks.push(block);
      pushHistory(); render(); notify();
      return;
    }
    // Deflect around locked blocks
    const start = timeToMin(block.start), end = timeToMin(block.end);
    const dur = end - start;
    for (const lb of blocks.filter(b => b.locked && !isMarker(b))) {
      const ls = timeToMin(lb.start), le = timeToMin(lb.end);
      if (start < le && end > ls) {
        // Collision — snap to nearest side
        const snapBefore = snapTo(ls - dur);
        const snapAfter = snapTo(le);
        const distBefore = Math.abs(start - snapBefore);
        const distAfter = Math.abs(start - snapAfter);
        const finalStart = distBefore <= distAfter ? snapBefore : snapAfter;
        block.start = minToTime(finalStart);
        block.end = minToTime(finalStart + dur);
        break;
      }
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

  // --- Popover ---
  function showPopover(block, anchorEl) {
    closePopover();
    const pop = document.createElement('div');
    pop.className = 'tl-popover';
    pop.style.position = 'fixed';
    pop.style.visibility = 'hidden';
    document.body.appendChild(pop);

    const isM = isMarker(block);
    const midTime = (!isM && block.start && block.end) ? minToTime(Math.round((timeToMin(block.start) + timeToMin(block.end)) / 2 / SNAP) * SNAP) : '';
    const lockLabel = block.locked ? '🔓 Unlock' : '🔒 Lock';
    pop.innerHTML = `
      <div class="pop-arrow"></div>
      <label>Type<select class="pop-type">${Object.entries(TYPE_LABELS).map(([k,v]) => `<option value="${k}" ${k===block.type?'selected':''}>${v}</option>`).join('')}</select></label>
      ${!isM ? `<label>Device<input class="pop-device" value="${block.device||''}"></label><label>Qty<input class="pop-qty" type="number" value="${block.qty||''}"></label>` : ''}
      <label>Start<input class="pop-start" type="time" value="${block.start||''}" step="900"></label>
      ${!isM ? `<label>End<input class="pop-end" type="time" value="${block.end||''}" step="900"></label>` : ''}
      <label>Memo<input class="pop-memo" list="pop-memo-list" value="${block.memo||''}"><datalist id="pop-memo-list"></datalist></label>
      ${!isM && block.start && block.end ? `<div class="pop-split"><label>Split at<input class="pop-split-time" type="time" value="${midTime}" step="900"></label><button class="pop-split-btn">✂ Split</button></div>` : ''}
      <div class="pop-actions">
        ${!isM ? `<button class="pop-lock">${lockLabel}</button>` : ''}
        <button class="pop-save">Save</button>
        <button class="pop-delete">Delete</button>
        <button class="pop-close">✕</button>
      </div>
    `;
    // Position
    const rect = anchorEl.getBoundingClientRect();
    const popW = pop.offsetWidth || 240;
    const popH = pop.offsetHeight || 300;
    let left = rect.right + 10;
    let top = rect.top;
    if (left + popW > window.innerWidth) left = rect.left - popW - 10;
    if (left < 0) left = 8;
    if (top + popH > window.innerHeight) top = window.innerHeight - popH - 8;
    if (top < 0) top = 8;
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
    pop.style.visibility = 'visible';

    // Load memo recents into datalist
    fetch(`/api/recents/${block.type}`).then(r => r.json()).then(items => {
      const dl = pop.querySelector('#pop-memo-list');
      if (dl) dl.innerHTML = items.map(m => `<option value="${m}">`).join('');
    }).catch(() => {});

    // Re-fetch when type changes
    pop.querySelector('.pop-type').addEventListener('change', (e) => {
      fetch(`/api/recents/${e.target.value}`).then(r => r.json()).then(items => {
        const dl = pop.querySelector('#pop-memo-list');
        if (dl) dl.innerHTML = items.map(m => `<option value="${m}">`).join('');
      }).catch(() => {});
    });

    pop.querySelector('.pop-save').onclick = () => { block.type = pop.querySelector('.pop-type').value; block.device = pop.querySelector('.pop-device')?.value || null; block.qty = parseInt(pop.querySelector('.pop-qty')?.value) || null; block.start = pop.querySelector('.pop-start').value || null; block.end = pop.querySelector('.pop-end')?.value || null; block.memo = pop.querySelector('.pop-memo').value || null; updateBlock(block, true); closePopover(); };
    pop.querySelector('.pop-delete').onclick = () => { deleteBlock(block.id); closePopover(); };
    pop.querySelector('.pop-close').onclick = closePopover;
    const lockBtn = pop.querySelector('.pop-lock');
    if (lockBtn) lockBtn.onclick = () => { toggleLock(block.id); closePopover(); };
    const splitBtn = pop.querySelector('.pop-split-btn');
    if (splitBtn) {
      splitBtn.onclick = () => {
        const splitTime = pop.querySelector('.pop-split-time').value;
        if (!splitTime || splitTime <= block.start || splitTime >= block.end) return;
        splitBlock(block, splitTime);
        closePopover();
      };
    }
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

  // --- Now Line ---
  function setDate(iso) {
    viewingDate = iso;
    updateNowLine();
    clearInterval(nowInterval);
    nowInterval = setInterval(updateNowLine, 60000);
  }

  function updateNowLine() {
    const line = container && container.querySelector('.tl-now-line');
    const today = new Date().toISOString().slice(0, 10);
    if (viewingDate !== today) { if (line) line.remove(); return; }
    const track = container && container.querySelector('.tl-track');
    if (!track) return;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const minTime = parseInt(track.dataset.minTime);
    if (isNaN(minTime) || nowMin < minTime) { if (line) line.remove(); return; }
    const top = (nowMin - minTime) * PX_PER_MIN;
    const timeStr = fmtTime(minToTime(nowMin));
    if (line) { line.style.top = top + 'px'; line.dataset.time = timeStr; return; }
    const el = document.createElement('div');
    el.className = 'tl-now-line';
    el.style.top = top + 'px';
    el.dataset.time = timeStr;
    el.title = 'Click to start a block now';
    el.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const snapped = snapTo(nowMin);
      const t = minToTime(snapped);
      const tEnd = minToTime(snapped + 15);
      addBlock({ id: crypto.randomUUID(), type: 'asset_processing', start: t, end: tEnd, memo: null, device: null, qty: null });
    });
    track.appendChild(el);
  }

  return { init, setBlocks, getBlocks, addBlock, deleteBlock, toggleLock, undo, redo, render, onSlotAdd, setDate };
})();
