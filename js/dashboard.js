function renderDashboard() {
  setTopbarActions(`
    <button class="btn btn-ghost btn-sm" onclick="printSiteReport()">🖨 Print Report</button>
  `);
  const p = getProject();
  updateChecklistNavBadge();
  const switches = p.devices.filter(d => d.deviceType === 'Switch');
  const rackMounted = p.devices.filter(d => d.rackId);
  const totalPorts = p.devices.reduce((a, s) => a + (parseInt(s.ports) || 0), 0);
  const assignedPorts = p.devices.reduce((a, s) => a + Object.keys(s.portAssignments || {}).length, 0);
  const typeCounts = {};
  p.devices.forEach(d => { typeCounts[d.deviceType||'Misc.'] = (typeCounts[d.deviceType||'Misc.']||0)+1; });
  const recentDevs = p.devices.slice(-10).reverse();

  // EOL Alert
  const now = new Date(); const in90 = new Date(now); in90.setDate(in90.getDate()+90);
  const eolDevs = p.devices.filter(d => d.eolDate && new Date(d.eolDate) <= in90);
  // Checklist progress
  const cl = p.checklist||[];
  const clDone = cl.filter(i=>i.done).length;
  const clPct = cl.length>0 ? Math.round(clDone/cl.length*100) : 0;
  // Vendors (global)
  // Time log
  const timeLog = p.timeLog||[];
  const totalMins = timeLog.reduce((s,e)=>{
    if(!e.startTime||!e.endTime) return s;
    const [sh,sm]=(e.startTime||'00:00').split(':').map(Number);
    const [eh,em]=(e.endTime||'00:00').split(':').map(Number);
    return s + Math.max(0,(eh*60+em)-(sh*60+sm));
  },0);
  const totalHrs = (totalMins/60).toFixed(1);
  const activeTimer = state.activeTimer;

  document.getElementById('view-area').innerHTML = `
    <div style="display:flex;gap:20px;height:calc(100vh - 130px)">
      <!-- Left column -->
      <div style="flex:1;min-width:0;overflow-y:auto;padding-right:4px">
        <div class="stats-row" style="margin-bottom:16px">
          <div class="stat-card"><div class="sv accent">${p.devices.length}</div><div class="sl">Total Devices</div></div>
          <div class="stat-card"><div class="sv accent">${switches.length}</div><div class="sl">Switches</div></div>
          <div class="stat-card"><div class="sv green">${p.racks.length}</div><div class="sl">Racks</div></div>
          <div class="stat-card"><div class="sv">${rackMounted.length}</div><div class="sl">Rack-Assigned</div></div>
          <div class="stat-card"><div class="sv">${totalPorts > 0 ? assignedPorts+'/'+totalPorts : '—'}</div><div class="sl">Ports Used</div></div>
          <div class="stat-card" onclick="setView('checklist')" style="cursor:pointer" title="Go to Checklist"><div class="sv ${clPct===100?'green':'amber'}">${clPct}%</div><div class="sl">Checklist</div></div>
        </div>

        ${eolDevs.length > 0 ? `
        <div style="background:#ff445518;border:1px solid #ff445544;border-radius:7px;padding:12px 16px;margin-bottom:16px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            <span style="font-size:16px">⚠</span>
            <div style="font-size:13px;font-weight:600;color:var(--red)">EOL Alert — ${eolDevs.length} device${eolDevs.length!==1?'s':''} at/near end of life</div>
          </div>
          ${eolDevs.slice(0,5).map(d=>{
            const eol=new Date(d.eolDate); const past=eol<now;
            return `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px;cursor:pointer" onclick="editDevice('${d.id}')">
              <span style="color:${past?'var(--red)':'var(--amber)'}">${past?'⚠ PAST EOL':'⏱ EOL soon'}</span>
              <span style="font-weight:600">${esc(d.name)}</span>
              <span style="color:var(--text3);font-family:var(--mono)">${esc(d.eolDate)}</span>
            </div>`;
          }).join('')}
          ${eolDevs.length>5?`<div style="font-size:11px;color:var(--text3);margin-top:4px">+${eolDevs.length-5} more</div>`:''}
        </div>` : ''}

        ${p.company||p.location||p.contactMgmt||p.contactIT ? `
        <div style="background:var(--card);border:1px solid var(--border);border-radius:7px;padding:12px 16px;margin-bottom:16px;display:flex;flex-wrap:wrap;gap:12px 24px">
          ${p.company?`<div><div style="font-size:10px;color:var(--text3);font-family:var(--mono);text-transform:uppercase;margin-bottom:2px">Company</div><div style="font-size:13px">${esc(p.company)}</div></div>`:''}
          ${p.location?`<div><div style="font-size:10px;color:var(--text3);font-family:var(--mono);text-transform:uppercase;margin-bottom:2px">Location</div><div style="font-size:13px">${esc(p.location)}</div></div>`:''}
          ${p.contactMgmt?`<div><div style="font-size:10px;color:var(--text3);font-family:var(--mono);text-transform:uppercase;margin-bottom:2px">Management Contact</div><div style="font-size:13px">${esc(p.contactMgmt)}</div></div>`:''}
          ${p.contactIT?`<div><div style="font-size:10px;color:var(--text3);font-family:var(--mono);text-transform:uppercase;margin-bottom:2px">IT Contact</div><div style="font-size:13px">${esc(p.contactIT)}</div></div>`:''}
        </div>` : ''}

        <div style="display:flex;gap:16px;flex-wrap:wrap">
          <div style="flex:1;min-width:240px">
            <div style="font-size:12px;color:var(--text2);font-family:var(--mono);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Recent Devices <span style="color:var(--text3)">(click to edit)</span></div>
            ${recentDevs.length === 0 ? `<div style="color:var(--text3);font-size:13px;padding:16px 0">No devices yet. <span style="color:var(--accent);cursor:pointer" onclick="setView('devices')">Add devices →</span></div>` :
              recentDevs.map(d => `
                <div onclick="editDevice('${d.id}')" style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--card);border:1px solid var(--border);border-radius:5px;margin-bottom:5px;cursor:pointer;transition:all .14s" onmouseover="this.style.borderColor='${dtColor(d.deviceType||'Misc.')}'" onmouseout="this.style.borderColor='var(--border)'">
                  <span style="width:10px;height:10px;border-radius:50%;background:${dtColor(d.deviceType||'Misc.')};flex-shrink:0"></span>
                  <div style="flex:1;min-width:0">
                    <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(d.name)}</div>
                    <div style="font-size:11px;color:var(--text2);font-family:var(--mono)">${esc(d.ip || '—')}</div>
                  </div>
                  ${dtBadge(d.deviceType||'Misc.')}
                </div>`).join('')}
            <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:5px">
              ${DEVICE_TYPES.filter(t=>typeCounts[t]).map(t =>
                `<div style="display:flex;align-items:center;gap:4px;background:${dtColor(t)}11;border:1px solid ${dtColor(t)}33;border-radius:5px;padding:3px 8px;font-size:11px;font-family:var(--mono);color:${dtColor(t)}">
                  <span style="width:6px;height:6px;border-radius:50%;background:${dtColor(t)}"></span>${esc(t)} ${typeCounts[t]}
                </div>`).join('')}
            </div>
          </div>
          <div style="flex:1;min-width:240px">
            <div style="font-size:12px;color:var(--text2);font-family:var(--mono);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Racks <span style="color:var(--text3)">(click to view)</span></div>
            ${p.racks.length === 0 ? `<div style="color:var(--text3);font-size:13px;padding:16px 0">No racks yet. <span style="color:var(--accent);cursor:pointer" onclick="setView('racks')">Create a rack →</span></div>` :
              p.racks.map(r => {
                const rackDevs = p.devices.filter(d => d.rackId === r.id);
                const used = rackDevs.reduce((sum, d) => sum + Math.max(1, d.deviceUHeight || 1), 0);
                const pct = Math.min(100, Math.round(used / (r.uHeight || 42) * 100));
                return `
                <div onclick="viewRackFromDash('${r.id}')" style="padding:10px 14px;background:var(--card);border:1px solid var(--border);border-radius:5px;margin-bottom:7px;cursor:pointer;transition:all .14s" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                    <div>
                      <div style="font-size:13px;font-weight:600">${esc(r.name)}</div>
                      <div style="font-size:11px;color:var(--text2);font-family:var(--mono)">${esc(r.location || '—')} · ${r.uHeight}U</div>
                    </div>
                    <div style="font-size:12px;color:var(--text2)">${used}/${r.uHeight}U</div>
                  </div>
                  <div style="height:4px;background:var(--panel);border-radius:2px;margin-bottom:5px">
                    <div style="height:4px;background:var(--accent);border-radius:2px;width:${pct}%"></div>
                  </div>
                  <div style="display:flex;flex-wrap:wrap;gap:3px">
                    ${rackDevs.slice(0,6).map(d => `<span style="font-size:10px;padding:1px 5px;border-radius:3px;background:${dtColor(d.deviceType||'Misc.')}22;color:${dtColor(d.deviceType||'Misc.')};font-family:var(--mono)">${esc(d.name)}</span>`).join('')}
                    ${rackDevs.length > 6 ? `<span style="font-size:10px;color:var(--text3)">+${rackDevs.length-6} more</span>` : ''}
                  </div>
                </div>`;
              }).join('')}
          </div>
        </div>

        <!-- Time Log -->
        <div style="margin-top:20px;background:var(--card);border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-bottom:20px">
          <div style="padding:10px 14px;background:var(--panel);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px">
            <div style="display:flex;align-items:center;gap:10px">
              <div style="font-size:13px;font-weight:600">⏱ Time Log</div>
              <span style="font-size:11px;color:var(--text2);font-family:var(--mono)">${totalHrs} hrs total</span>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              ${activeTimer ? `<button class="btn btn-sm" style="background:rgba(255,170,0,.15);border-color:rgba(255,170,0,.4);color:var(--amber)" onclick="stopTimer()">⏹ Stop Timer</button>` : `<button class="btn btn-ghost btn-sm" onclick="startTimer()">▶ Start Timer</button>`}
              <button class="btn btn-ghost btn-sm" onclick="addTimeEntry()">+ Add Entry</button>
            </div>
          </div>
          ${timeLog.length===0&&!activeTimer ? `<div style="padding:16px;color:var(--text3);font-size:12px">No time entries yet.</div>` : `
          <table style="font-size:12px">
            <thead><tr><th>Date</th><th>Tech</th><th>Duration</th><th>Notes</th><th></th></tr></thead>
            <tbody>
              ${activeTimer?`<tr style="background:rgba(255,170,0,.05)">
                <td class="mono">${activeTimer.date}</td>
                <td>${esc(activeTimer.tech||'')}</td>
                <td><span class="timer-running" style="color:var(--amber)" id="timer-elapsed">Running...</span></td>
                <td style="color:var(--text3)">In progress</td>
                <td></td>
              </tr>`:''}
              ${timeLog.slice().reverse().slice(0,8).map(e=>{
                const [sh,sm]=(e.startTime||'00:00').split(':').map(Number);
                const [eh,em]=(e.endTime||'00:00').split(':').map(Number);
                const mins=Math.max(0,(eh*60+em)-(sh*60+sm));
                const dur=mins>=60?`${Math.floor(mins/60)}h ${mins%60}m`:`${mins}m`;
                return `<tr>
                  <td class="mono">${esc(e.date||'')}</td>
                  <td>${esc(e.tech||'')}</td>
                  <td class="mono">${dur}</td>
                  <td style="color:var(--text2)">${esc(e.notes||'')}</td>
                  <td><div class="td-actions">
                    <button class="btn btn-ghost btn-sm btn-icon" onclick="editTimeEntry('${e.id}')">✎</button>
                    <button class="btn btn-danger btn-sm btn-icon" onclick="deleteTimeEntry('${e.id}')">✕</button>
                  </div></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>`}
        </div>
      </div>

      <!-- Right column: Site Notes -->
      <div style="width:340px;min-width:280px;display:flex;flex-direction:column;background:var(--card);border:1px solid var(--border);border-radius:8px;overflow:hidden">
        <div style="padding:12px 14px;border-bottom:1px solid var(--border);background:var(--panel);display:flex;align-items:center;justify-content:space-between">
          <div style="font-size:13px;font-weight:600">📝 Site Notes</div>
          <div style="font-size:11px;color:var(--text3);font-family:var(--mono)">${(p.siteNotes||[]).length} note${(p.siteNotes||[]).length!==1?'s':''}</div>
        </div>
        <div id="notes-feed" style="flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column-reverse;gap:8px">
          ${(p.siteNotes||[]).length === 0 ? `<div style="text-align:center;color:var(--text3);font-size:12px;padding:20px">No notes yet. Add one below.</div>` :
            (p.siteNotes||[]).slice().reverse().map(n => `
              <div style="background:var(--card2);border:1px solid var(--border2);border-radius:7px;padding:10px 12px;position:relative">
                <div style="font-size:10px;color:var(--text3);font-family:var(--mono);margin-bottom:5px">${fmtTs(n.ts)}</div>
                <div style="font-size:13px;white-space:pre-wrap;word-break:break-word">${esc(n.text)}</div>
                <button onclick="deleteNote('${n.id}')" title="Delete note" style="position:absolute;top:6px;right:6px;background:rgba(255,68,85,.1);border:none;color:var(--red);cursor:pointer;width:18px;height:18px;border-radius:3px;font-size:11px;display:flex;align-items:center;justify-content:center;line-height:1">✕</button>
              </div>`).join('')}
        </div>
        <div style="padding:10px;border-top:1px solid var(--border)">
          <textarea id="note-input" placeholder="Add a site note..." style="width:100%;background:var(--panel);border:1px solid var(--border);border-radius:5px;padding:8px 10px;color:var(--text);font-size:13px;font-family:var(--font);resize:none;outline:none;height:70px;transition:border-color .15s" onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border)'" onkeydown="if((e=event).ctrlKey&&e.key==='Enter')addNote()"></textarea>
          <div style="display:flex;justify-content:flex-end;margin-top:6px">
            <button class="btn btn-primary btn-sm" onclick="addNote()">Add Note</button>
          </div>
        </div>
      </div>
    </div>`;
  // Start elapsed timer display if active
  if (activeTimer) updateTimerDisplay();
}

function viewRackFromDash(rackId) {
  sessionStorage.setItem('netrack_focus_rack', rackId);
  setView('racks');
}

function addNote() {
  const ta = document.getElementById('note-input');
  const text = ta?.value?.trim();
  if (!text) return;
  const p = getProject();
  if (!p.siteNotes) p.siteNotes = [];
  const note = { id: genId(), ts: new Date().toISOString(), text };
  p.siteNotes.unshift(note);
  logChange(`Site note added: "${text}"`);
  save();
  ta.value = '';
  renderDashboard();
}

function deleteNote(noteId) {
  openModal(`
    <h3>Delete Note?</h3>
    <p style="color:var(--text2);margin-bottom:16px">This will permanently remove this note from the dashboard. It will remain in the Change Log.</p>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-danger" onclick="confirmDeleteNote('${noteId}')">Delete Note</button>
    </div>`);
}

function confirmDeleteNote(noteId) {
  const p = getProject();
  const note = (p.siteNotes||[]).find(n => n.id === noteId);
  if (note) logChange(`Site note deleted: "${note.text.slice(0,60)}${note.text.length>60?'…':''}"`);
  p.siteNotes = (p.siteNotes||[]).filter(n => n.id !== noteId);
  save();
  closeModal();
  renderDashboard();
}
