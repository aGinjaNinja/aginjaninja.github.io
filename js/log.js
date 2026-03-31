function renderLog() {
  const p = getProject();
  const log = p.changelog || [];
  setTopbarActions(`<button class="btn btn-ghost btn-sm" onclick="exportLog()">⇧ Export Log</button>`);
  document.getElementById('view-area').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
      <div style="font-size:13px;color:var(--text2)">${log.length} log entr${log.length===1?'y':'ies'}</div>
      <div style="font-size:11px;color:var(--text3);font-family:var(--mono)">Site notes are permanently retained in this log even when deleted from the dashboard</div>
    </div>
    ${log.length === 0 ? `<div class="empty-state"><div class="empty-icon">📋</div><h3>No log entries yet</h3><p>Changes to devices, racks, ports, and notes will appear here.</p></div>` : `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:8px;overflow:hidden">
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>
          <th style="padding:9px 14px;text-align:left;font-size:10px;color:var(--text3);font-family:var(--mono);letter-spacing:1px;text-transform:uppercase;background:var(--panel);border-bottom:1px solid var(--border);white-space:nowrap;width:180px">DATE &amp; TIME</th>
          <th style="padding:9px 14px;text-align:left;font-size:10px;color:var(--text3);font-family:var(--mono);letter-spacing:1px;text-transform:uppercase;background:var(--panel);border-bottom:1px solid var(--border)">EVENT</th>
        </tr></thead>
        <tbody>
          ${log.map((entry, i) => `
            <tr style="${i>0?'border-top:1px solid var(--border)':''}">
              <td style="padding:8px 14px;font-family:var(--mono);font-size:11px;color:var(--text3);white-space:nowrap;vertical-align:top">${fmtTs(entry.ts)}</td>
              <td style="padding:8px 14px;font-size:13px;color:var(--text)">${esc(entry.msg)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`}`;
}

function exportLog() {
  const p = getProject();
  const log = p.changelog || [];
  const lines = [`Van Nice Site Manager — Change Log`, `Project: ${p.name}`, `Exported: ${new Date().toLocaleString()}`, ``, `${'─'.repeat(80)}`];
  log.forEach(e => lines.push(`[${fmtTs(e.ts)}]  ${e.msg}`));
  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${p.name.replace(/\s+/g,'_')}_changelog_${new Date().toISOString().slice(0,10)}.txt`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
  toast('Log exported', 'success');
}

