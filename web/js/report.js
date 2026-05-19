/* DayBuilder — report.js
   Daily + Weekly reports with print-to-PDF */

const Report = (() => {

  // --- Daily Report ---
  async function show(blocks) {
    const res = await fetch('/api/rates', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({blocks})
    });
    const data = await res.json();
    const html = buildDailyHtml(data);
    const clipText = buildDailyClip(data);
    showOverlay(html, clipText);
  }

  // --- Weekly Report ---
  async function showWeek(dateIso) {
    const res = await fetch('/api/rates/week', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({date: dateIso})
    });
    const data = await res.json();
    const html = buildWeeklyHtml(data);
    const clipText = buildWeeklyClip(data);
    showOverlay(html, clipText);
  }

  // --- Overlay shell with print + copy + close ---
  function showOverlay(contentHtml, clipText) {
    const overlay = document.createElement('div');
    overlay.className = 'guided-overlay';
    overlay.innerHTML = `<div class="guided-modal report-modal"><div class="report-content report-printable">${contentHtml}
      <div class="report-actions no-print">
        <button class="guided-btn report-print">🖨 Print / PDF</button>
        <button class="guided-btn report-copy">Copy to Clipboard</button>
        <button class="guided-btn report-close">Close</button>
      </div>
    </div></div>`;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);

    overlay.querySelector('.report-print').addEventListener('click', () => {
      const printContent = overlay.querySelector('.report-printable').innerHTML;
      const win = window.open('', '_blank');
      win.document.write(`<!DOCTYPE html><html><head><title>DayBuilder Report</title><style>${getPrintCSS()}</style></head><body>${printContent}</body></html>`);
      win.document.close();
      win.print();
    });
    overlay.querySelector('.report-copy').addEventListener('click', () => {
      navigator.clipboard.writeText(clipText).then(() => {
        overlay.querySelector('.report-copy').textContent = 'Copied!';
        setTimeout(() => overlay.querySelector('.report-copy').textContent = 'Copy to Clipboard', 2000);
      });
    });
    overlay.querySelector('.report-close').addEventListener('click', () => overlay.remove());
  }

  // --- Daily HTML ---
  function buildDailyHtml(data) {
    const devices = data.devices || [];
    const offClock = data.off_clock || [];
    const nonAsset = data.non_asset || [];
    const t = data.totals || {};
    const synopsis = data.synopsis || '';
    const adjColor = t.adjusted_pct >= 100 ? '#27ae60' : t.adjusted_pct >= 75 ? '#f39c12' : '#e74c3c';

    let deviceRows = devices.length === 0
      ? '<tr><td colspan="4" style="color:var(--text-muted)">No device data</td></tr>'
      : devices.map(d => `<tr><td>${d.display}</td><td>${d.qty} ÷ ${d.quota}/hr</td><td>${d.quota_hrs}h</td><td>${d.pct_of_day}%</td></tr>`).join('');

    let offClockHtml = offClock.length ? `<h3>Off-Clock</h3><table class="report-table">${offClock.map(o =>
      `<tr><td>${o.label}</td><td>${o.minutes}m <small>(${o.detail})</small></td></tr>`).join('')}</table>` : '';

    let nonAssetHtml = nonAsset.length ? `<h3>Non-Production Time</h3><table class="report-table"><tr><th>Activity</th><th>Time</th><th>Duration</th><th>Detail</th></tr>${nonAsset.map(n =>
      `<tr><td>${n.label}</td><td>${n.start}–${n.end}</td><td>${n.minutes}m</td><td>${n.memo || '—'}</td></tr>`).join('')}</table>
      <p style="font-size:0.85rem;color:var(--text-muted)">${t.non_asset_hours}h non-production → adjusted target: ${t.adjusted_prod_hours}h</p>` : '';

    return `
      <div class="report-header"><h2>Daily Productivity Report</h2><span class="report-user">${getUsername()}</span></div>
      <div class="report-summary" style="text-align:center;margin:0.75rem 0;padding:0.75rem;border:1px solid var(--border);border-radius:6px">
        <div style="font-size:1.8rem;font-weight:700;color:${adjColor}">${t.adjusted_pct}%</div>
        <div style="font-size:0.9rem;font-weight:500">Adjusted Production Goal</div>
        <div style="font-size:0.8rem;color:var(--text-muted)">${t.total_quota_hours}h produced of ${t.adjusted_prod_hours}h required | Full day: ${t.overall_pct}% of ${t.available_prod_hours}h</div>
      </div>
      ${synopsis ? `<p class="report-synopsis" style="font-style:italic;margin:0.5rem 0 1rem;padding:0.5rem 0.75rem;border-left:3px solid var(--border);line-height:1.5;font-size:0.9rem">${synopsis}</p>` : ''}
      <h3>Device Production</h3>
      <table class="report-table"><tr><th>Device</th><th>Calc</th><th>Quota Hrs</th><th>% Day</th></tr>${deviceRows}</table>
      ${nonAssetHtml}${offClockHtml}
      <h3>Time</h3>
      <table class="report-table">
        <tr><td>Shift</td><td>${t.actual_in} → ${t.actual_out}</td></tr>
        <tr><td>Available</td><td>${t.available_prod_hours}h</td></tr>
        <tr><td>Adjusted</td><td>${t.adjusted_prod_hours}h</td></tr>
        <tr><td>Breaks/Lunch</td><td>${t.actual_break_mins}m / ${t.actual_lunch_mins}m</td></tr>
      </table>`;
  }

  // --- Weekly HTML ---
  function buildWeeklyHtml(data) {
    const t = data.totals || {};
    const days = data.days || [];
    const synopses = data.synopses || [];
    const adjColor = t.adjusted_pct >= 100 ? '#27ae60' : t.adjusted_pct >= 75 ? '#f39c12' : '#e74c3c';
    const dayNames = ['Monday','Tuesday','Wednesday','Thursday','Friday'];

    // Device totals
    const devs = Object.values(t.devices || {});
    let deviceRows = devs.length === 0
      ? '<tr><td colspan="4">No device data</td></tr>'
      : devs.map(d => `<tr><td>${d.display}</td><td>${d.qty}</td><td>${d.quota_hrs.toFixed(2)}h</td><td>${d.quota}/hr</td></tr>`).join('');

    // Per-day summary
    let dayRows = days.map((d, i) => {
      if (!d.report) return `<tr><td>${dayNames[i]}</td><td colspan="3" style="color:var(--text-muted)">No data</td></tr>`;
      const r = d.report.totals;
      const c = r.adjusted_pct >= 100 ? '#27ae60' : r.adjusted_pct >= 75 ? '#f39c12' : '#e74c3c';
      return `<tr><td>${dayNames[i]}</td><td>${r.total_quota_hours}h</td><td>${r.adjusted_prod_hours}h</td><td style="color:${c};font-weight:700">${r.adjusted_pct}%</td></tr>`;
    }).join('');

    // Synopses
    let synHtml = synopses.length ? synopses.map(s => {
      const dow = dayNames[new Date(s.date + 'T12:00:00').getDay() - 1] || s.date;
      return `<p><strong>${dow}:</strong> ${s.synopsis}</p>`;
    }).join('') : '<p style="color:var(--text-muted)">No synopses available</p>';

    return `
      <div class="report-header"><h2>Weekly Report — w/o ${data.week_of}</h2><span class="report-user">${getUsername()}</span></div>
      <div class="report-summary" style="text-align:center;margin:0.75rem 0;padding:0.75rem;border:1px solid var(--border);border-radius:6px">
        <div style="font-size:1.8rem;font-weight:700;color:${adjColor}">${t.adjusted_pct}%</div>
        <div style="font-size:0.9rem;font-weight:500">Weekly Adjusted Goal</div>
        <div style="font-size:0.8rem;color:var(--text-muted)">${t.total_quota_hours}h produced of ${t.adjusted_prod_hours}h required | Full: ${t.overall_pct}% of ${t.available_prod_hours}h | Non-prod: ${t.non_asset_hours}h</div>
      </div>
      <div style="font-size:0.9rem;line-height:1.6;margin:0.5rem 0 1rem;padding:0.5rem 0.75rem;border-left:3px solid var(--border)">${synHtml}</div>
      <h3>Per-Day Breakdown</h3>
      <table class="report-table"><tr><th>Day</th><th>Produced</th><th>Target</th><th>Goal %</th></tr>${dayRows}</table>
      <h3>Device Totals</h3>
      <table class="report-table"><tr><th>Device</th><th>Qty</th><th>Quota Hrs</th><th>Quota</th></tr>${deviceRows}</table>`;
  }

  // --- Clipboard builders ---
  function buildDailyClip(data) {
    const t = data.totals || {};
    const lines = [`Adjusted Goal: ${t.adjusted_pct}% (${t.total_quota_hours}h of ${t.adjusted_prod_hours}h)`,
      `Full day: ${t.overall_pct}% of ${t.available_prod_hours}h`, '', '-- Devices --'];
    (data.devices||[]).forEach(d => lines.push(`  ${d.display}: ${d.qty} ÷ ${d.quota}/hr = ${d.quota_hrs}h`));
    if ((data.non_asset||[]).length) { lines.push('','-- Non-Production --'); data.non_asset.forEach(n => lines.push(`  ${n.label}: ${n.start}-${n.end} ${n.minutes}m ${n.memo||''}`)); }
    if (data.synopsis) lines.push('', '-- Synopsis --', data.synopsis);
    return lines.join('\n');
  }

  function buildWeeklyClip(data) {
    const t = data.totals || {};
    const dayNames = ['Mon','Tue','Wed','Thu','Fri'];
    const lines = [`Weekly Report — w/o ${data.week_of}`, `Adjusted Goal: ${t.adjusted_pct}% (${t.total_quota_hours}h of ${t.adjusted_prod_hours}h)`, '', '-- Per Day --'];
    (data.days||[]).forEach((d,i) => {
      if (d.report) lines.push(`  ${dayNames[i]}: ${d.report.totals.adjusted_pct}% (${d.report.totals.total_quota_hours}h)`);
      else lines.push(`  ${dayNames[i]}: No data`);
    });
    lines.push('', '-- Devices --');
    Object.values(t.devices||{}).forEach(d => lines.push(`  ${d.display}: ${d.qty} (${d.quota_hrs.toFixed(2)}h)`));
    if ((data.synopses||[]).length) { lines.push('','-- Synopses --'); data.synopses.forEach(s => lines.push(`${s.date}: ${s.synopsis}`)); }
    return lines.join('\n');
  }

  // --- Username from title bar ---
  function getUsername() {
    const el = document.getElementById('titleBarUser');
    return el ? el.textContent.replace('USER: ', '') : '';
  }

  // --- Print CSS for 8.5x11 ---
  function getPrintCSS() {
    return `
      @page { size: letter; margin: 0.75in; }
      body { font-family: 'Segoe UI', sans-serif; font-size: 11pt; color: #1a1a1a; line-height: 1.4; }
      .report-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.5rem; }
      .report-header h2 { font-size: 16pt; margin: 0; }
      .report-user { font-size: 11pt; font-weight: 600; }
      h3 { font-size: 12pt; margin: 1rem 0 0.3rem; border-bottom: 1px solid #ccc; padding-bottom: 2px; }
      .report-summary { text-align: center; margin: 0.5rem 0; padding: 0.6rem; border: 1px solid #999; border-radius: 6px; }
      .report-summary div:first-child { font-size: 24pt; font-weight: 700; }
      .report-synopsis { font-style: italic; margin: 0.4rem 0 0.8rem; padding: 0.4rem 0.6rem; border-left: 3px solid #999; }
      table { width: 100%; border-collapse: collapse; margin: 0.5rem 0; font-size: 10pt; }
      th, td { padding: 4px 8px; border: 1px solid #ddd; text-align: left; }
      th { background: #f0f0f0; font-weight: 600; }
      p { margin: 0.3rem 0; }
      .no-print, .report-actions { display: none !important; }
    `;
  }

  return { show, showWeek };
})();
