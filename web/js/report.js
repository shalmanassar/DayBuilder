/* DayBuilder — report.js
   Report view: productivity summary, time breakdown, clipboard export */

const Report = (() => {
  let config = null;

  async function loadConfig() {
    if (config) return config;
    const res = await fetch('/api/config');
    config = (await res.json()).shared;
    return config;
  }

  async function show(blocks) {
    await loadConfig();
    const overlay = document.createElement('div');
    overlay.className = 'guided-overlay';
    overlay.innerHTML = `<div class="guided-modal report-modal"><div class="report-content"></div></div>`;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);

    const content = overlay.querySelector('.report-content');
    const report = buildReport(blocks);
    content.innerHTML = report.html;

    content.querySelector('.report-copy').addEventListener('click', () => {
      navigator.clipboard.writeText(report.text).then(() => {
        content.querySelector('.report-copy').textContent = 'Copied!';
        setTimeout(() => content.querySelector('.report-copy').textContent = 'Copy to Clipboard', 2000);
      });
    });

    content.querySelector('.report-close').addEventListener('click', () => overlay.remove());
  }

  function buildReport(blocks) {
    // Productivity
    const deviceCounts = {};
    blocks.forEach(b => {
      if (b.device && b.qty) {
        deviceCounts[b.device] = (deviceCounts[b.device] || 0) + b.qty;
      }
    });

    // Time breakdown
    let workMins = 0, breakMins = 0, adminMins = 0;
    blocks.forEach(b => {
      const dur = duration(b);
      if (['break', 'lunch'].includes(b.type)) breakMins += dur;
      else if (['admin', 'meeting', '5s', 'learning'].includes(b.type)) adminMins += dur;
      else if (!['clock_in', 'clock_out'].includes(b.type)) workMins += dur;
    });

    const clockIn = blocks.find(b => b.type === 'clock_in');
    const clockOut = blocks.find(b => b.type === 'clock_out');
    const totalMins = (clockIn && clockOut) ? timeDiff(clockIn.start, clockOut.end || clockOut.start) : 0;

    // Build HTML
    const prodRows = Object.entries(deviceCounts)
      .map(([dev, qty]) => `<tr><td>${dev}</td><td>${qty}</td></tr>`).join('');

    const html = `
      <h2>Day Report</h2>
      <h3>Productivity</h3>
      <table class="report-table">
        <tr><th>Device</th><th>Qty</th></tr>
        ${prodRows || '<tr><td colspan="2">No devices logged</td></tr>'}
      </table>
      <h3>Time Breakdown</h3>
      <table class="report-table">
        <tr><td>Total</td><td>${fmtHrs(totalMins)}</td></tr>
        <tr><td>Production</td><td>${fmtHrs(workMins)}</td></tr>
        <tr><td>Admin/Meetings</td><td>${fmtHrs(adminMins)}</td></tr>
        <tr><td>Breaks/Lunch</td><td>${fmtHrs(breakMins)}</td></tr>
      </table>
      <h3>Schedule</h3>
      <p>In: ${clockIn ? clockIn.start : '—'} | Out: ${clockOut ? (clockOut.end || clockOut.start) : '—'}</p>
      <div class="report-actions">
        <button class="guided-btn report-copy">Copy to Clipboard</button>
        <button class="guided-btn report-close">Close</button>
      </div>
    `;

    // Plain text for clipboard
    const lines = ['=== Day Report ===', '', '-- Productivity --'];
    Object.entries(deviceCounts).forEach(([dev, qty]) => lines.push(`  ${dev}: ${qty}`));
    lines.push('', '-- Time --');
    lines.push(`  Total: ${fmtHrs(totalMins)}`);
    lines.push(`  Production: ${fmtHrs(workMins)}`);
    lines.push(`  Admin/Meetings: ${fmtHrs(adminMins)}`);
    lines.push(`  Breaks/Lunch: ${fmtHrs(breakMins)}`);
    lines.push('', `  In: ${clockIn ? clockIn.start : '—'} | Out: ${clockOut ? (clockOut.end || clockOut.start) : '—'}`);

    return { html, text: lines.join('\n') };
  }

  function duration(b) {
    if (!b.start || !b.end) return 0;
    return timeDiff(b.start, b.end);
  }

  function timeDiff(a, b) {
    const [ah, am] = a.split(':').map(Number);
    const [bh, bm] = b.split(':').map(Number);
    return (bh * 60 + bm) - (ah * 60 + am);
  }

  function fmtHrs(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
  }

  return { show };
})();
