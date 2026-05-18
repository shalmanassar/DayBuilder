/* DayBuilder — report.js
   Report view: rate calculations (qty/hr vs quota), time breakdown, clipboard export */

const Report = (() => {
  async function show(blocks) {
    const res = await fetch('/api/rates', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({blocks})
    });
    const data = await res.json();
    const rates = data.rates || [];
    const workHrs = data.work_hours || 0;
    const nonworkHrs = data.nonwork_hours || 0;

    const overlay = document.createElement('div');
    overlay.className = 'guided-overlay';
    overlay.innerHTML = `<div class="guided-modal report-modal"><div class="report-content"></div></div>`;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);

    const clockIn = blocks.find(b => b.type === 'clock_in');
    const clockOut = blocks.find(b => b.type === 'clock_out');

    // Rate rows
    let rateRows = '';
    if (rates.length === 0) {
      rateRows = '<tr><td colspan="5" style="color:var(--text-muted)">No device data logged</td></tr>';
    } else {
      rates.forEach(r => {
        const color = r.pct >= 100 ? 'var(--success)' : r.pct >= 75 ? 'var(--warning)' : 'var(--danger)';
        rateRows += `<tr>
          <td>${r.display}</td>
          <td>${r.qty}</td>
          <td>${r.rate}/hr</td>
          <td>${r.quota}/hr</td>
          <td style="color:${color};font-weight:700">${r.pct}%</td>
        </tr>`;
      });
    }

    const content = overlay.querySelector('.report-content');
    content.innerHTML = `
      <h2>Day Report</h2>
      <h3>Rate vs Quota</h3>
      <table class="report-table">
        <tr><th>Device</th><th>Qty</th><th>Rate</th><th>Quota</th><th>%</th></tr>
        ${rateRows}
      </table>
      <h3>Time</h3>
      <table class="report-table">
        <tr><td>Production</td><td>${workHrs}h</td></tr>
        <tr><td>Breaks/Lunch</td><td>${nonworkHrs}h</td></tr>
        <tr><td>In</td><td>${clockIn ? clockIn.start : '—'}</td></tr>
        <tr><td>Out</td><td>${clockOut ? (clockOut.start || '—') : '—'}</td></tr>
      </table>
      <div class="report-actions">
        <button class="guided-btn report-copy">Copy to Clipboard</button>
        <button class="guided-btn report-close">Close</button>
      </div>
    `;

    // Clipboard text
    const lines = ['=== Day Report ===', '', '-- Rate vs Quota --'];
    rates.forEach(r => lines.push(`  ${r.display}: ${r.qty} units | ${r.rate}/hr | quota ${r.quota}/hr | ${r.pct}%`));
    lines.push('', '-- Time --', `  Production: ${workHrs}h`, `  Breaks/Lunch: ${nonworkHrs}h`);
    lines.push(`  In: ${clockIn ? clockIn.start : '—'} | Out: ${clockOut ? clockOut.start : '—'}`);
    const clipText = lines.join('\n');

    content.querySelector('.report-copy').addEventListener('click', () => {
      navigator.clipboard.writeText(clipText).then(() => {
        content.querySelector('.report-copy').textContent = 'Copied!';
        setTimeout(() => content.querySelector('.report-copy').textContent = 'Copy to Clipboard', 2000);
      });
    });
    content.querySelector('.report-close').addEventListener('click', () => overlay.remove());
  }

  return { show };
})();
