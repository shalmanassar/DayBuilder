/* DayBuilder — post.js
   Pre-post validation UI + POST button logic */

const Post = (() => {
  let today = new Date().toISOString().slice(0, 10);

  function validate(blocks) {
    const checks = [];
    const types = blocks.map(b => b.type);

    // Hard checks
    checks.push({ label: 'Clock in time set', status: types.includes('clock_in') ? 'pass' : 'fail' });
    checks.push({ label: 'Clock out time set', status: types.includes('clock_out') ? 'pass' : 'fail' });

    const allExplicit = blocks.every(b => b.start && (b.end || ['clock_in','clock_out'].includes(b.type)));
    checks.push({ label: 'All times explicit', status: allExplicit ? 'pass' : 'fail' });

    // Soft checks
    const breaks = blocks.filter(b => b.type === 'break');
    checks.push({ label: '2x breaks (>=15m)', status: breaks.length >= 2 ? 'pass' : 'warn' });

    const lunches = blocks.filter(b => b.type === 'lunch');
    checks.push({ label: '1x lunch (>=30m)', status: lunches.length >= 1 ? 'pass' : 'warn' });

    // Gaps
    const sorted = blocks.filter(b => b.start && b.end).sort((a,b) => a.start.localeCompare(b.start));
    let hasGaps = false;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].start > sorted[i-1].end) { hasGaps = true; break; }
    }
    checks.push({ label: 'No time gaps', status: hasGaps ? 'warn' : 'pass' });

    return checks;
  }

  function canPost(checks) {
    return !checks.some(c => c.status === 'fail');
  }

  function showValidation(blocks, container) {
    const checks = validate(blocks);
    const ok = canPost(checks);

    container.innerHTML = `
      <div class="validation-panel">
        <h3>Pre-Post Checks</h3>
        ${checks.map(c => `
          <div class="val-row val-${c.status}">
            <span class="val-icon">${c.status === 'pass' ? '✓' : c.status === 'fail' ? '✗' : '⚠'}</span>
            ${c.label}
          </div>
        `).join('')}
        ${ok ? '<p class="val-ok">Ready to post</p>' : '<p class="val-blocked">Fix required items before posting</p>'}
      </div>
    `;
    return ok;
  }

  async function doPost(dateIso) {
    const res = await fetch(`/api/post/${dateIso}`, { method: 'POST' });
    return await res.json();
  }

  function bindPostButton(btnPost, btnOpen, getBlocks, getDate) {
    const dateGetter = typeof getDate === 'function' ? getDate : () => getDate || today;

    btnPost.addEventListener('click', async () => {
      const blocks = getBlocks();
      const checks = validate(blocks);

      if (!canPost(checks)) {
        showToast('Cannot post — fix required items first', 'danger');
        return;
      }

      const warnings = checks.filter(c => c.status === 'warn');
      if (warnings.length > 0) {
        const msg = warnings.map(w => w.label).join(', ');
        if (!confirm(`Warnings: ${msg}\n\nPost anyway?`)) return;
      }

      btnPost.disabled = true;
      btnPost.textContent = 'Posting...';

      const result = await doPost(dateGetter());

      if (result.ok) {
        showToast('Posted successfully!', 'success');
      } else {
        showToast(result.error || 'Post failed', 'danger');
      }

      btnPost.disabled = false;
      btnPost.textContent = 'POST TO LOG';
    });

    if (btnOpen) {
      btnOpen.addEventListener('click', async () => {
        await fetch('/api/open-target', { method: 'POST' });
      });
    }
  }

  function showToast(msg, type) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  return { validate, canPost, showValidation, doPost, bindPostButton };
})();
