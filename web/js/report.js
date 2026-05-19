/* DayBuilder — report.js
   Quota-hours productivity report with adjusted goal, detailed non-asset, synopsis */

const Report = (() => {
  async function show(blocks) {
    const res = await fetch('/api/rates', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({blocks})
    });
    const data = await res.json();
    const devices = data.devices || [];
    const offClock = data.off_clock || [];
    const nonAsset = data.non_asset || [];
    const t = data.totals || {};
    const synopsis = data.synopsis || '';

    const overlay = document.createElement('div');
    overlay.className = 'guided-overlay';
    overlay.innerHTML = `<div class="guided-modal report-modal"><div class="report-content"></div></div>`;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);

    // Adjusted goal is primary
    const adjColor = t.adjusted_pct >= 100 ? 'var(--success)' : t.adjusted_pct >= 75 ? 'var(--warning)' : 'var(--danger)';

    // Device rows
    let deviceRows = '';
    if (devices.length === 0) {
      deviceRows = '<tr><td colspan="4" style="color:var(--text-muted)">No device data logged</td></tr>';
    } else {
      devices.forEach(d => {
        deviceRows += `<tr><td>${d.display}</td><td>${d.qty} ÷ ${d.quota}/hr</td><td>${d.quota_hrs}h</td><td>${d.pct_of_day}%</td></tr>`;
      });
    }

    // Off-clock rows
    let offClockHtml = '';
    if (offClock.length > 0) {
      offClockHtml = `<h3>Off-Clock Adjustments</h3><table class="report-table">${offClock.map(o =>
        `<tr><td>${o.label}</td><td>${o.minutes}m <small style="color:var(--text-muted)">(${o.detail})</small></td></tr>`
      ).join('')}</table>`;
      if (t.off_clock_excess_mins > 0)
        offClockHtml += `<p style="color:var(--warning);font-size:0.85rem">⚠ ${t.off_clock_excess_mins}m reduced available from ${t.scheduled_prod_hours}h to ${t.available_prod_hours}h</p>`;
    }

    // Non-asset detail rows
    let nonAssetHtml = '';
    if (nonAsset.length > 0) {
      nonAssetHtml = `<h3>Non-Production Time</h3><table class="report-table"><tr><th>Activity</th><th>Time</th><th>Duration</th><th>Detail</th></tr>${nonAsset.map(n =>
        `<tr><td>${n.label}</td><td>${n.start}–${n.end}</td><td>${n.minutes}m</td><td>${n.memo || '—'}</td></tr>`
      ).join('')}</table>
      <p style="font-size:0.85rem;color:var(--text-muted)">${t.non_asset_hours}h non-production (${t.non_asset_pct}% of available) → adjusted goal: ${t.adjusted_prod_hours}h</p>`;
    }

    const content = overlay.querySelector('.report-content');
    content.innerHTML = `
      <h2>Productivity Report</h2>

      <div class="report-summary" style="text-align:center;margin:1rem 0;padding:1rem;background:var(--bg-deep);border-radius:8px">
        <div style="font-size:2.2rem;font-weight:700;color:${adjColor}">${t.adjusted_pct}%</div>
        <div style="color:var(--text-primary);font-weight:600">Adjusted Production Goal</div>
        <div style="font-size:0.85rem;color:var(--text-muted);margin-top:0.3rem">${t.total_quota_hours}h produced of ${t.adjusted_prod_hours}h required (after ${t.non_asset_hours}h non-production deducted)</div>
        <div style="font-size:0.8rem;color:var(--text-muted);margin-top:0.2rem">Full day: ${t.overall_pct}% of ${t.available_prod_hours}h available</div>
      </div>

      <h3>Device Production</h3>
      <table class="report-table">
        <tr><th>Device</th><th>Calculation</th><th>Quota Hrs</th><th>% of Day</th></tr>
        ${deviceRows}
      </table>

      ${nonAssetHtml}
      ${offClockHtml}

      <h3>Time Summary</h3>
      <table class="report-table">
        <tr><td>Shift</td><td>${t.actual_in} → ${t.actual_out}</td></tr>
        <tr><td>Available Production</td><td>${t.available_prod_hours}h</td></tr>
        <tr><td>Adjusted (after non-prod)</td><td>${t.adjusted_prod_hours}h</td></tr>
        <tr><td>Breaks</td><td>${t.actual_break_mins}m</td></tr>
        <tr><td>Lunch</td><td>${t.actual_lunch_mins}m</td></tr>
      </table>

      ${synopsis ? `<h3>Synopsis</h3><p class="report-synopsis" style="font-style:italic;color:var(--text-primary);background:var(--bg-deep);padding:0.75rem;border-radius:6px;line-height:1.5">${synopsis}</p>` : ''}

      <div class="report-actions">
        <button class="guided-btn report-copy">Copy to Clipboard</button>
        <button class="guided-btn report-close">Close</button>
      </div>
    `;

    // Clipboard
    const lines = [
      `Daily Goal: ${t.adjusted_pct}% adjusted (${t.total_quota_hours}h of ${t.adjusted_prod_hours}h after non-prod deducted)`,
      `Full day: ${t.overall_pct}% of ${t.available_prod_hours}h available`, '',
      '-- Device Production --'
    ];
    devices.forEach(d => lines.push(`  ${d.display}: ${d.qty} ÷ ${d.quota}/hr = ${d.quota_hrs}h (${d.pct_of_day}%)`));
    if (nonAsset.length) {
      lines.push('', '-- Non-Production --');
      nonAsset.forEach(n => lines.push(`  ${n.label}: ${n.start}-${n.end} (${n.minutes}m) ${n.memo || ''}`));
    }
    if (offClock.length) {
      lines.push('', '-- Off-Clock --');
      offClock.forEach(o => lines.push(`  ${o.label}: ${o.minutes}m (${o.detail})`));
    }
    lines.push('', '-- Time --', `  Shift: ${t.actual_in} → ${t.actual_out} | Available: ${t.available_prod_hours}h | Adjusted: ${t.adjusted_prod_hours}h`);
    if (synopsis) lines.push('', '-- Synopsis --', synopsis);
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
