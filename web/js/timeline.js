/* DayBuilder — timeline.js
   Vertical timeline engine: render, edit, resize, reorder, add/delete, undo/redo, gap/overlap */

const Timeline = (() => {
  let blocks = [];
  let history = [];
  let historyIdx = -1;
  let container = null;
  let onChangeCallback = null;

  // Block type colors
  const TYPE_COLORS = {
    asset_processing: '#3498db',
    project: '#9b59b6',
    admin: '#e67e22',
    meeting: '#1abc9c',
    '5s': '#f1c40f',
    learning: '#2ecc71',
    break: '#7f8c8d',
    lunch: '#95a5a6',
    clock_in: '#27ae60',
    clock_out: '#e74c3c'
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

  // --- History (undo/redo) ---
  function pushHistory() {
    history = history.slice(0, historyIdx + 1);
    history.push(JSON.stringify(blocks));
    historyIdx = history.length - 1;
  }

  function undo() {
    if (historyIdx > 0) {
      historyIdx--;
      blocks = JSON.parse(history[historyIdx]);
      render();
      notify();
    }
  }

  function redo() {
    if (historyIdx < history.length - 1) {
      historyIdx++;
      blocks = JSON.parse(history[historyIdx]);
      render();
      notify();
    }
  }

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

    const sorted = [...blocks].sort((a, b) => (a.start || '').localeCompare(b.start || ''));

    // Render gaps/overlaps between blocks
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0) {
        const prev = sorted[i - 1];
        const cur = sorted[i];
        // For clock_in marker, use its start as the "end" for gap detection
        const prevEnd = (prev.type === 'clock_in' || prev.type === 'clock_out') ? prev.start : prev.end;
        const curStart = cur.start;
        // Skip if current is clock_out (gap before clock_out is an open slot)
        if (prevEnd && curStart && cur.type !== 'clock_out') {
          if (prevEnd < curStart) {
            container.appendChild(createGap(prevEnd, curStart));
          } else if (prevEnd > curStart) {
            container.appendChild(createOverlap(prevEnd, curStart));
          }
        }
        // Open slot before clock_out
        if (cur.type === 'clock_out' && prevEnd && cur.start && prevEnd < cur.start) {
          container.appendChild(createGap(prevEnd, cur.start));
        }
      }
      container.appendChild(createBlockEl(sorted[i]));
    }
  }

  function createBlockEl(block) {
    const el = document.createElement('div');
    el.className = 'tl-block';
    el.dataset.id = block.id;
    const color = TYPE_COLORS[block.type] || '#3498db';
    const isMarker = block.type === 'clock_in' || block.type === 'clock_out';

    if (isMarker) {
      el.classList.add('tl-marker');
      if (block.type === 'clock_out') el.classList.add('clock-out');
      const label = block.type === 'clock_in' ? 'CLOCK IN' : 'CLOCK OUT';
      el.innerHTML = `<span class="tl-time">${block.start || '?'}</span><span class="tl-label">${label}</span>`;
      el.addEventListener('click', () => showPopover(block, el));
      return el;
    }

    el.style.borderLeftColor = color;

    const label = block.type ? block.type.replace(/_/g, ' ') : 'block';
    const isAsset = block.type === 'asset_processing';
    const device = block.device ? ` · ${block.device}` : '';
    const qty = block.qty ? ` x${block.qty}` : '';
    const memo = block.memo ? `<div class="tl-memo">${block.memo}</div>` : '';

    // Device/qty: inline for asset blocks, accordion for others
    let deviceHtml = '';
    if (isAsset) {
      deviceHtml = device + qty;
    } else if (block.device || block.qty) {
      const summary = block.device ? `${block.device}${qty}` : qty;
      deviceHtml = `<div class="tl-device-accordion"><span class="acc-toggle"><span class="acc-arrow">▸</span> Device/Qty: ${summary}</span><div class="acc-body">${block.device || '—'} ${qty}</div></div>`;
    }

    el.innerHTML = `
      <div class="tl-handle tl-handle-top" data-edge="top"></div>
      <div class="tl-time">${block.start || '?'} – ${block.end || '?'}</div>
      <div class="tl-label">${label}${isAsset ? device + qty : ''}</div>
      ${!isAsset && deviceHtml ? deviceHtml : ''}
      ${memo}
      <div class="tl-handle tl-handle-bottom" data-edge="bottom"></div>
    `;

    // Accordion toggle
    const acc = el.querySelector('.tl-device-accordion');
    if (acc) acc.addEventListener('click', (e) => { e.stopPropagation(); acc.classList.toggle('open'); });

    // Click to edit
    el.addEventListener('click', (e) => {
      if (!e.target.classList.contains('tl-handle')) showPopover(block, el);
    });

    // Drag to reorder (on body)
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
      e.preventDefault();
      el.classList.remove('drag-over');
      const fromId = e.dataTransfer.getData('text/plain');
      reorder(fromId, block.id);
    });

    // Drag to resize (on handles)
    const handles = el.querySelectorAll('.tl-handle');
    handles.forEach(h => {
      h.addEventListener('pointerdown', (e) => startResize(e, block, h.dataset.edge));
    });

    return el;
  }

  // --- Resize ---
  function startResize(e, block, edge) {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const origTime = edge === 'top' ? block.start : block.end;
    const handle = e.target;
    handle.classList.add('active');

    // Create tooltip
    const tip = document.createElement('div');
    tip.className = 'tl-resize-tip';
    tip.textContent = origTime;
    document.body.appendChild(tip);

    function onMove(ev) {
      const dy = ev.clientY - startY;
      const minutesDelta = Math.round(dy / 3) * 15; // 15-min snap, 3px per 15min
      const rawMin = timeToMin(origTime) + minutesDelta;
      // Snap to nearest 15
      const snapped = Math.round(rawMin / 15) * 15;
      const newTime = minToTime(snapped);
      if (edge === 'top') block.start = newTime;
      else block.end = newTime;
      tip.textContent = newTime;
      tip.style.left = ev.clientX + 12 + 'px';
      tip.style.top = ev.clientY - 10 + 'px';
      updateBlock(block, false);
      render();
    }

    function onUp() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      handle.classList.remove('active');
      tip.remove();
      pushHistory();
      notify();
    }

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  // --- Reorder ---
  function reorder(fromId, toId) {
    if (fromId === toId) return;
    const fromIdx = blocks.findIndex(b => b.id === fromId);
    const toIdx = blocks.findIndex(b => b.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;

    const [moved] = blocks.splice(fromIdx, 1);
    blocks.splice(toIdx, 0, moved);

    // Auto-adjust times based on new order
    for (let i = 0; i < blocks.length; i++) {
      if (i === 0) continue;
      const prev = blocks[i - 1];
      if (prev.end && blocks[i].start !== prev.end) {
        const duration = timeDiff(blocks[i].start, blocks[i].end);
        blocks[i].start = prev.end;
        blocks[i].end = addMinutes(prev.end, duration);
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
    pop.innerHTML = `
      <label>Type<select class="pop-type">
        ${['asset_processing','project','admin','meeting','5s','learning','break','lunch','clock_in','clock_out']
          .map(t => `<option value="${t}" ${t===block.type?'selected':''}>${t.replace(/_/g,' ')}</option>`).join('')}
      </select></label>
      <label>Device<input class="pop-device" value="${block.device||''}"></label>
      <label>Qty<input class="pop-qty" type="number" value="${block.qty||''}"></label>
      <label>Start<input class="pop-start" type="time" value="${block.start||''}"></label>
      <label>End<input class="pop-end" type="time" value="${block.end||''}"></label>
      <label>Memo<input class="pop-memo" value="${block.memo||''}"></label>
      <div class="pop-actions">
        <button class="pop-save">Save</button>
        <button class="pop-delete">Delete</button>
        <button class="pop-close">Cancel</button>
      </div>
    `;

    pop.querySelector('.pop-save').onclick = () => {
      block.type = pop.querySelector('.pop-type').value;
      block.device = pop.querySelector('.pop-device').value || null;
      block.qty = parseInt(pop.querySelector('.pop-qty').value) || null;
      block.start = pop.querySelector('.pop-start').value || null;
      block.end = pop.querySelector('.pop-end').value || null;
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

  // --- Context Menu (right-click delete) ---
  function onContextMenu(e) {
    const blockEl = e.target.closest('.tl-block');
    if (!blockEl) return;
    e.preventDefault();
    const id = blockEl.dataset.id;
    if (confirm('Delete this block?')) deleteBlock(id);
  }

  // --- Gap / Overlap indicators ---
  function createGap(from, to) {
    const el = document.createElement('div');
    el.className = 'tl-gap';
    el.textContent = `Gap: ${from} – ${to} (${timeDiff(from, to)}m unaccounted)`;
    el.title = 'Double-click or right-click to add activity here';
    el.style.cursor = 'pointer';
    el.addEventListener('dblclick', () => { triggerSlotAdd(from, to); });
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); triggerSlotAdd(from, to); });
    return el;
  }

  function triggerSlotAdd(start, end) {
    if (onSlotAddCallback) onSlotAddCallback(start, end);
  }

  let onSlotAddCallback = null;
  function onSlotAdd(cb) { onSlotAddCallback = cb; }

  function createOverlap(prevEnd, curStart) {
    const el = document.createElement('div');
    el.className = 'tl-overlap';
    el.textContent = `Overlap: ${curStart} – ${prevEnd} (${timeDiff(curStart, prevEnd)}m)`;
    return el;
  }

  // --- Helpers ---
  function updateBlock(block, save) {
    const idx = blocks.findIndex(b => b.id === block.id);
    if (idx >= 0) blocks[idx] = { ...blocks[idx], ...block };
    if (save) { pushHistory(); render(); notify(); }
  }

  function notify() { if (onChangeCallback) onChangeCallback(getBlocks()); }

  function timeToMin(t) {
    if (!t) return 0;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }

  function minToTime(m) {
    const h = Math.floor(m / 60) % 24;
    const min = ((m % 60) + 60) % 60;
    return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
  }

  function addMinutes(time, delta) { return minToTime(timeToMin(time) + delta); }
  function timeDiff(a, b) { return timeToMin(b) - timeToMin(a); }

  return { init, setBlocks, getBlocks, addBlock, deleteBlock, undo, redo, render, onSlotAdd };
})();
