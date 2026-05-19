/* DayBuilder — report.js
   Quota-hours productivity report, off-clock adjustments, non-asset breakdown */

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

    const overlay = document.createElement('div');
    overlay.className = 'guided-overlay';
    overlay.innerHTML = `<div class="guided-modal report-modal"><div class="report-content"></div></div>`;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);

    // Overall color
    const oColor = t.overall_pct >= 100 ? 'var(--success)' : t.overall_pct >= 75 ? 'var(--warning)' : 'var(--danger)';

    // Device rows
    let deviceRows = '';
    if (devices.length === 0) {
      deviceRows = '<tr><td colspan="4" style="color:var(--text-muted)">No device data logged</td></tr>';
    } else {
      devices.forEach(d => {
        const c = d.pct_of_day >= 50 ? 'var(--success)' : d.pct_of_day >= 25 ? 'var(--warning)' : 'var(--text-primary)';
        deviceRows += `<tr><td>${d.display}</td><td>${d.qty} ÷ ${d.quota}/hr</td><td>${d.quota_hrs}h</td><td style="color:${c}">${d.pct_of_day}%</td></tr>`;
      });
    }

    // Off-clock rows
    let offClockRows = '';
    if (offClock.length === 0) {
      offClockRows = '<tr><td colspan="2" style="color:var(--success)">None — on schedule ✓</td></tr>';
    } else {
      offClock.forEach(o => {
        offClockRows += `<tr><td>${o.label}</td><td>${o.minutes}m <small style="color:var(--text-muted)">(${o.detail})</small></td></tr>`;
      });
    }

    // Non-asset rows
    let nonAssetRows = '';
    if (nonAsset.length === 0) {
      nonAssetRows = '<tr><td colspan="3" style="color:var(--text-muted)">None</td></tr>';
    } else {
      nonAsset.forEach(n => {
        nonAssetRows += `<tr><td>${n.label}</td><td>${n.hours}h</td><td>${n.pct_of_day}%</td></tr>`;
      });
    }

    const content = overlay.querySelector('.report-content');
    content.innerHTML = `
      <h2>Productivity Report</h2>

      <div class="report-summary" style="text-align:center;margin:1rem 0;padding:1rem;background:var(--bg-deep);border-radius:8px">
        <div style="font-size:2rem;font-weight:700;color:${oColor}">${t.overall_pct}%</div>
        <div style="color:var(--text-muted)">Daily Production Goal</div>
        <div style="font-size:0.85rem;color:var(--text-muted);margin-top:0.3rem">${t.total_quota_hours}h produced of ${t.available_prod_hours}h available</div>
      </div>

      <h3>Device Production (Quota-Hours)</h3>
      <table class="report-table">
        <tr><th>Device</th><th>Calculation</th><th>Quota Hrs</th><th>% of Day</th></tr>
        ${deviceRows}
      </table>

      <h3>Off-Clock Adjustments</h3>
      <table class="report-table">
        ${offClockRows}
      </table>
      ${t.off_clock_excess_mins > 0 ? `<p style="color:var(--warning);font-size:0.85rem">⚠ ${t.off_clock_excess_mins}m off-clock reduced available production from ${t.scheduled_prod_hours}h to ${t.available_prod_hours}h</p>` : ''}

      <h3>Non-Asset Time</h3>
      <table class="report-table">
        <tr><th>Activity</th><th>Hours</th><th>% of Day</th></tr>
        ${nonAssetRows}
      </table>
      ${t.non_asset_hours > 0 ? `<p style="font-size:0.85rem;color:var(--text-muted)">${t.non_asset_hours}h (${t.non_asset_pct}%) in non-asset activities</p>` : ''}

      <h3>Time Summary</h3>
      <table class="report-table">
        <tr><td>Shift</td><td>${t.actual_in} → ${t.actual_out}</td></tr>
        <tr><td>Scheduled Production</td><td>${t.scheduled_prod_hours}h</td></tr>
        <tr><td>Available Production</td><td>${t.available_prod_hours}h</td></tr>
        <tr><td>Breaks</td><td>${t.actual_break_mins}m</td></tr>
        <tr><td>Lunch</td><td>${t.actual_lunch_mins}m</td></tr>
      </table>

      <div class="report-actions">
        <button class="guided-btn report-copy">Copy to Clipboard</button>
        <button class="guided-btn report-close">Close</button>
      </div>
    `;

    // Clipboard
    const lines = [
      '=== Productivity Report ===', '',
      `Daily Goal: ${t.overall_pct}% (${t.total_quota_hours}h of ${t.available_prod_hours}h available)`, '',
      '-- Device Production --'
    ];
    devices.forEach(d => lines.push(`  ${d.display}: ${d.qty} ÷ ${d.quota}/hr = ${d.quota_hrs}h (${d.pct_of_day}% of day)`));
    if (offClock.length) {
      lines.push('', '-- Off-Clock --');
      offClock.forEach(o => lines.push(`  ${o.label}: ${o.minutes}m (${o.detail})`));
    }
    if (nonAsset.length) {
      lines.push('', '-- Non-Asset Time --');
      nonAsset.forEach(n => lines.push(`  ${n.label}: ${n.hours}h (${n.pct_of_day}%)`));
    }
    lines.push('', '-- Time --', `  Shift: ${t.actual_in} → ${t.actual_out}`,
      `  Available: ${t.available_prod_hours}h | Breaks: ${t.actual_break_mins}m | Lunch: ${t.actual_lunch_mins}m`);
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
