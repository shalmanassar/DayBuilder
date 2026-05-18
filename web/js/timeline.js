/* DayBuilder — timeline.js
   Proportional vertical timeline: 1 row = 15min, compact breaks, drag-move, resize-push */

const Timeline = (() => {
  let blocks = [];
  let history = [];
  let historyIdx = -1;
  let container = null;
  let onChangeCallback = null;
  let onSlotAddCallback = null;

  const ROW_H = 38; // px per 15-min row
  const COMPACT_H = 28; // px for compact (break/lunch) rows
  const MARKER_H = 24; // px for clock markers

  const TYPE_COLORS = {
    asset_processing: '#3498db', project: '#9b59b6', admin: '#e67e22',
    meeting: '#1abc9c', '5s': '#f1c40f', learning: '#2ecc71',
    break: '#7f8c8d', lunch: '#95a5a6', clock_in: '#27ae60', clock_out: '#e74c3c'
  };

  const COMPACT_TYPES = ['break', 'lunch'];

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
    container.style.position = 'relative';

    if (blocks.length === 0) {
      container.innerHTML = '<div class="timeline-empty">No blocks yet. Add an activity to start building your day.</div>';
      return;
    }

    const sorted = [...blocks].sort((a, b) => (a.start || '').localeCompare(b.start || ''));

    // Render sequentially with proportional heights
    for (let i = 0; i < sorted.length; i++) {
      // Gap before this block
      if (i > 0) {
        const prev = sorted[i - 1];
        const prevEnd = isMarker(prev) ? prev.start : prev.end;
        const curStart = sorted[i].start;
        if (prevEnd && curStart && prevEnd < curStart) {
          container.appendChild(createGap(prevEnd, curStart));
        } else if (prevEnd && curStart && prevEnd > curStart) {
          container.appendChild(createOverlap(prevEnd, curStart));
        }
      }
      container.appendChild(createBlockEl(sorted[i]));
    }
  }

  function isMarker(b) { return b.type === 'clock_in' || b.type === 'clock_out'; }
  function isCompact(b) { return COMPACT_TYPES.includes(b.type); }

  function blockHeight(block) {
    if (isMarker(block)) return MARKER_H;
    if (!block.start || !block.end) return ROW_H;
    const mins = timeToMin(block.end) - timeToMin(block.start);
    if (isCompact(block)) return COMPACT_H;
    return Math.max(ROW_H, Math.round((mins / 15) * ROW_H));
  }

  function createBlockEl(block) {
    const el = document.createElement('div');
    el.className = 'tl-block';
    el.dataset.id = block.id;
    const color = TYPE_COLORS[block.type] || '#3498db';

    if (isMarker(block)) {
      el.classList.add('tl-marker');
      if (block.type === 'clock_out') el.classList.add('clock-out');
      const label = block.type === 'clock_in' ? 'CLOCK IN' : 'CLOCK OUT';
      el.innerHTML = `<span class="tl-time">${fmtTime(block.start)}</span><span class="tl-label">${label}</span>`;
      el.style.height = MARKER_H + 'px';
      el.addEventListener('click', () => showPopover(block, el));
      return el;
    }

    // Proportional height
    const h = blockHeight(block);
    el.style.height = h + 'px';
    el.style.borderLeftColor = color;

    if (isCompact(block)) {
      // Single-line compact row
      el.classList.add('tl-compact');
      const label = block.type.charAt(0).toUpperCase() + block.type.slice(1);
      const memo = block.memo ? block.memo : '';
      el.innerHTML = `
        <div class="tl-compact-row">
          <span class="tl-label">${label}</span>
          <span class="tl-time">${fmtTime(block.start)} – ${fmtTime(block.end)}</span>
          <span class="tl-memo">${memo}</span>
        </div>
        <div class="tl-handle tl-handle-top" data-edge="top"></div>
        <div class="tl-handle tl-handle-bottom" data-edge="bottom"></div>
      `;
    } else {
      // Full block
      const label = block.type ? block.type.replace(/_/g, ' ') : 'block';
      const isAsset = block.type === 'asset_processing';
      const device = block.device ? ` · ${block.device}` : '';
      const qty = block.qty ? ` x${block.qty}` : '';
      const memo = block.memo ? `<div class="tl-memo">${block.memo}</div>` : '';

      let deviceHtml = '';
      if (!isAsset && (block.device || block.qty)) {
        const summary = block.device ? `${block.device}${qty}` : qty;
        deviceHtml = `<div class="tl-device-accordion"><span class="acc-toggle"><span class="acc-arrow">▸</span> Device/Qty: ${summary}</span><div class="acc-body">${block.device || '—'} ${qty}</div></div>`;
      }

      el.innerHTML = `
        <div class="tl-handle tl-handle-top" data-edge="top"></div>
        <div class="tl-time">${fmtTime(block.start)} – ${fmtTime(block.end)}</div>
        <div class="tl-label">${label}${isAsset ? device + qty : ''}</div>
        ${deviceHtml}
        ${memo}
        <div class="tl-handle tl-handle-bottom" data-edge="bottom"></div>
      `;
    }

    // Accordion toggle
    const acc = el.querySelector('.tl-device-accordion');
    if (acc) acc.addEventListener('click', (e) => { e.stopPropagation(); acc.classList.toggle('open'); });

    // Click to edit
    el.addEventListener('click', (e) => {
      if (!e.target.classList.contains('tl-handle')) showPopover(block, el);
    });

    // Drag to move (visual feedback: ghost follows cursor)
    el.setAttribute('draggable', 'true');
    el.addEventListener('dragstart', (e) => {
      if (e.target.classList.contains('tl-handle')) { e.preventDefault(); return; }
      e.dataTransfer.setData('text/plain', block.id);
      e.dataTransfer.effectAllowed = 'move';
      el.classList.add('dragging');
      // Create drag image
      const ghost = el.cloneNode(true);
      ghost.style.opacity = '0.7';
      ghost.style.position = 'absolute';
      ghost.style.top = '-9999px';
      ghost.style.width = el.offsetWidth + 'px';
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, e.offsetX, e.offsetY);
      setTimeout(() => ghost.remove(), 0);
    });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));
    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drag-over'); });
    el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('drag-over');
      const fromId = e.dataTransfer.getData('text/plain');
      reorder(fromId, block.id);
    });

    // Resize handles
    el.querySelectorAll('.tl-handle').forEach(h => {
      h.addEventListener('pointerdown', (e) => startResize(e, block, h.dataset.edge));
    });

    return el;
  }

  // --- Resize with push ---
  function startResize(e, block, edge) {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const origTime = edge === 'top' ? block.start : block.end;
    const handle = e.target;
    handle.classList.add('active');
    handle.setPointerCapture(e.pointerId);

    const tip = document.createElement('div');
    tip.className = 'tl-resize-tip';
    tip.textContent = origTime;
    document.body.appendChild(tip);

    const sorted = [...blocks].sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    const blockIdx = sorted.findIndex(b => b.id === block.id);

    function onMove(ev) {
      const dy = ev.clientY - startY;
      const minutesDelta = Math.round(dy / (ROW_H / 15)) * 15;
      const rawMin = timeToMin(origTime) + minutesDelta;
      const snapped = Math.round(rawMin / 15) * 15;
      const newTime = minToTime(Math.max(0, Math.min(1439, snapped)));

      if (edge === 'top') {
        block.start = newTime;
        // Push previous block's end
        if (blockIdx > 0) {
          const prev = sorted[blockIdx - 1];
          if (!isMarker(prev) && prev.end && timeToMin(prev.end) > snapped) {
            prev.end = newTime;
            updateBlock(prev, false);
          }
        }
      } else {
        block.end = newTime;
        // Push next block's start
        if (blockIdx < sorted.length - 1) {
          const next = sorted[blockIdx + 1];
          if (!isMarker(next) && next.start && timeToMin(next.start) < snapped) {
            const dur = timeToMin(next.end) - timeToMin(next.start);
            next.start = newTime;
            next.end = minToTime(snapped + dur);
            updateBlock(next, false);
          }
        }
      }

      tip.textContent = newTime;
      tip.style.left = ev.clientX + 12 + 'px';
      tip.style.top = ev.clientY - 10 + 'px';
      updateBlock(block, false);
      render();
    }

    function onUp() {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.classList.remove('active');
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

    // Auto-adjust times: cascade from drop point
    const sorted = [...blocks].sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      if (isMarker(prev) || isMarker(cur)) continue;
      const prevEnd = prev.end;
      if (prevEnd && cur.start && timeToMin(cur.start) < timeToMin(prevEnd)) {
        const dur = timeToMin(cur.end) - timeToMin(cur.start);
        cur.start = prevEnd;
        cur.end = minToTime(timeToMin(prevEnd) + dur);
      }
    }

    pushHistory();
    render();
    notify();
  }

  // --- Add / Delete ---
  function addBlock(block) {
    if (!block.id) block.id = crypto.randomUUID();
    blocks.push(block);
    pushHistory();
    render();
    notify();
  }

  function deleteBlock(id) {
    blocks = blocks.filter(b => b.id !== id);
    pushHistory();
    render();
    notify();
  }

  // --- Edit Popover ---
  function showPopover(block, anchorEl) {
    closePopover();
    const pop = document.createElement('div');
    pop.className = 'tl-popover';
    const isM = isMarker(block);
    pop.innerHTML = `
      <label>Type<select class="pop-type">
        ${['asset_processing','project','admin','meeting','5s','learning','break','lunch','clock_in','clock_out']
          .map(t => `<option value="${t}" ${t===block.type?'selected':''}>${t.replace(/_/g,' ')}</option>`).join('')}
      </select></label>
      ${!isM ? `<label>Device<input class="pop-device" value="${block.device||''}"></label>
      <label>Qty<input class="pop-qty" type="number" value="${block.qty||''}"></label>` : ''}
      <label>Start<input class="pop-start" type="time" value="${block.start||''}"></label>
      ${!isM ? `<label>End<input class="pop-end" type="time" value="${block.end||''}"></label>` : ''}
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
      updateBlock(block, true);
      closePopover();
    };
    pop.querySelector('.pop-delete').onclick = () => { deleteBlock(block.id); closePopover(); };
    pop.querySelector('.pop-close').onclick = closePopover;

    container.appendChild(pop);
  }

  function closePopover() {
    const existing = container.querySelector('.tl-popover');
    if (existing) existing.remove();
  }

  // --- Context Menu ---
  function onContextMenu(e) {
    const blockEl = e.target.closest('.tl-block');
    if (!blockEl) return;
    e.preventDefault();
    const id = blockEl.dataset.id;
    if (confirm('Delete this block?')) deleteBlock(id);
  }

  // --- Gap / Overlap ---
  function createGap(from, to) {
    const mins = timeToMin(to) - timeToMin(from);
    const h = Math.max(COMPACT_H, Math.round((mins / 15) * ROW_H));
    const el = document.createElement('div');
    el.className = 'tl-gap';
    el.style.height = h + 'px';
    el.innerHTML = `<span>${fmtTime(from)} – ${fmtTime(to)}</span> <span class="gap-dur">${mins}m open</span>`;
    el.title = 'Double-click to add activity here';
    el.addEventListener('dblclick', () => triggerSlotAdd(from, to));
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); triggerSlotAdd(from, to); });
    return el;
  }

  function createOverlap(prevEnd, curStart) {
    const el = document.createElement('div');
    el.className = 'tl-overlap';
    el.textContent = `Overlap: ${fmtTime(curStart)} – ${fmtTime(prevEnd)}`;
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
