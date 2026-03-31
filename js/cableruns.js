const CABLE_TYPES = ['Cat5e','Cat6','Cat6A','Fiber SM','Fiber MM','Coax','Other'];

function renderCableRuns() {
  const p = getProject();
  if (!p.cableRuns) p.cableRuns=[];
  const runs = p.cableRuns;
  const filterType = state.cableTypeFilter||'all';
  const filterRoom = (state.cableRoomFilter||'').toLowerCase();

  setTopbarActions(`<button class="btn btn-primary btn-sm" onclick="addCableRun()">+ Add Cable Run</button>`);

  // Filtered runs
  let filtered = runs.filter(r=>{
    if(filterType!=='all' && r.type!==filterType) return false;
    if(filterRoom && !(r.fromRoom||'').toLowerCase().includes(filterRoom) && !(r.toRoom||'').toLowerCase().includes(filterRoom) && !(r.label||'').toLowerCase().includes(filterRoom) && !(r.notes||'').toLowerCase().includes(filterRoom)) return false;
    return true;
  });

  // Stats
  const byType={};
  runs.forEach(r=>{ byType[r.type||'Other']=(byType[r.type||'Other']||0)+1; });

  document.getElementById('view-area').innerHTML = `
    <div style="margin-bottom:14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <div class="search-box" style="max-width:200px">
        <span style="color:var(--text3)">⌕</span>
        <input placeholder="Search runs..." value="${esc(state.cableRoomFilter||'')}" oninput="state.cableRoomFilter=this.value;renderCableRuns()">
      </div>
      <div class="filter-tabs">
        <div class="filter-tab ${filterType==='all'?'active':''}" onclick="state.cableTypeFilter='all';renderCableRuns()">All (${runs.length})</div>
        ${CABLE_TYPES.filter(t=>byType[t]).map(t=>`<div class="filter-tab ${filterType===t?'active':''}" onclick="state.cableTypeFilter='${t}';renderCableRuns()">${esc(t)} (${byType[t]||0})</div>`).join('')}
      </div>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
      <div class="stat-card"><div class="sv">${runs.length}</div><div class="sl">Total Runs</div></div>
      ${Object.entries(byType).map(([t,c])=>`<div class="stat-card"><div class="sv accent" style="font-size:18px">${c}</div><div class="sl">${esc(t)}</div></div>`).join('')}
      <div class="stat-card"><div class="sv green">${runs.filter(r=>r.verified).length}</div><div class="sl">Verified</div></div>
    </div>
    ${filtered.length===0 ? `<div class="empty-state"><div class="empty-icon">⇄</div><h3>No cable runs yet</h3><p>Add cable runs to track physical connections between rooms and patch panels.</p></div>` : `
    <div class="devices-table-scroll">
      <table>
        <thead><tr>
          <th>Label</th><th>From</th><th>To</th><th>Type</th><th>Length</th><th>Color</th><th>Verified</th><th>Notes</th><th></th>
        </tr></thead>
        <tbody>
          ${filtered.map(r=>`<tr>
            <td style="font-weight:600;font-family:var(--mono)">${esc(r.label||'—')}</td>
            <td>${esc(r.fromRoom||'—')}${r.fromPort?`<span style="color:var(--text3)"> P${esc(r.fromPort)}</span>`:''}</td>
            <td>${esc(r.toRoom||'—')}${r.toPort?`<span style="color:var(--text3)"> P${esc(r.toPort)}</span>`:''}</td>
            <td><span class="cable-type-badge">${esc(r.type||'—')}</span></td>
            <td class="mono">${esc(r.length||'—')}</td>
            <td>${r.color?`<span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${esc(r.color)};border:1px solid rgba(255,255,255,.2);vertical-align:middle"></span>`:''}</td>
            <td><input type="checkbox" ${r.verified?'checked':''} onchange="toggleCableVerified('${r.id}',this.checked)" title="Mark verified"></td>
            <td style="color:var(--text2);font-size:12px">${esc(r.notes||'')}</td>
            <td><div class="td-actions">
              <button class="btn btn-ghost btn-sm btn-icon" onclick="editCableRun('${r.id}')">✎</button>
              <button class="btn btn-danger btn-sm btn-icon" onclick="deleteCableRun('${r.id}')">✕</button>
            </div></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`}`;
}

function toggleCableVerified(id, val) {
  const p=getProject();
  const r=(p.cableRuns||[]).find(x=>x.id===id);
  if(r){r.verified=val;logChange(`Cable run ${r.label||id}: verified=${val}`);save();}
}

function addCableRun() { openCableRunModal(null); }
function editCableRun(id) { openCableRunModal(id); }

function openCableRunModal(id) {
  const p=getProject();
  const r=id?(p.cableRuns||[]).find(x=>x.id===id):null;
  const typeOpts=CABLE_TYPES.map(t=>`<option value="${t}" ${(r?.type||'Cat6')===t?'selected':''}>${t}</option>`).join('');
  openModal(`
    <h3>${id?'Edit':'Add'} Cable Run</h3>
    <div class="form-row-inline">
      <div class="form-row" style="flex:1"><label>Label</label>
        <input class="form-control" id="cr-label" value="${esc(r?.label||'')}" placeholder="e.g. CR-001"></div>
      <div class="form-row"><label>Type</label>
        <select class="form-control" id="cr-type">${typeOpts}</select></div>
    </div>
    <div class="form-row-inline">
      <div class="form-row"><label>From Room</label>
        <input class="form-control" id="cr-fromroom" value="${esc(r?.fromRoom||'')}" placeholder="IDF-1"></div>
      <div class="form-row"><label>From Port</label>
        <input class="form-control" id="cr-fromport" value="${esc(r?.fromPort||'')}" placeholder="P12"></div>
    </div>
    <div class="form-row-inline">
      <div class="form-row"><label>To Room</label>
        <input class="form-control" id="cr-toroom" value="${esc(r?.toRoom||'')}" placeholder="MDF"></div>
      <div class="form-row"><label>To Port</label>
        <input class="form-control" id="cr-toport" value="${esc(r?.toPort||'')}" placeholder="P24"></div>
    </div>
    <div class="form-row-inline">
      <div class="form-row"><label>Length (ft/m)</label>
        <input class="form-control" id="cr-length" value="${esc(r?.length||'')}" placeholder="100ft"></div>
      <div class="form-row"><label>Color</label>
        <input type="color" class="form-control" id="cr-color" value="${r?.color||'#4488ff'}" style="height:38px;padding:4px"></div>
    </div>
    <div class="form-row"><label>Notes</label>
      <textarea class="form-control" id="cr-notes" rows="2">${esc(r?.notes||'')}</textarea></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveCableRun('${id||''}')">Save</button>
    </div>`, '540px');
  setTimeout(()=>document.getElementById('cr-label')?.focus(),50);
}

function saveCableRun(id) {
  const p=getProject();
  const data={
    label: document.getElementById('cr-label')?.value?.trim()||'',
    type: document.getElementById('cr-type')?.value||'Cat6',
    fromRoom: document.getElementById('cr-fromroom')?.value?.trim()||'',
    fromPort: document.getElementById('cr-fromport')?.value?.trim()||'',
    toRoom: document.getElementById('cr-toroom')?.value?.trim()||'',
    toPort: document.getElementById('cr-toport')?.value?.trim()||'',
    length: document.getElementById('cr-length')?.value?.trim()||'',
    color: document.getElementById('cr-color')?.value||'',
    notes: document.getElementById('cr-notes')?.value?.trim()||'',
    verified: id ? ((p.cableRuns||[]).find(x=>x.id===id)?.verified||false) : false,
  };
  if(!p.cableRuns) p.cableRuns=[];
  if(id){
    const idx=p.cableRuns.findIndex(x=>x.id===id);
    if(idx>=0){Object.assign(p.cableRuns[idx],data);logChange(`Cable run updated: ${data.label||id}`);}
  } else {
    p.cableRuns.push({id:genId(),...data});
    logChange(`Cable run added: ${data.label||'(unlabeled)'} ${data.fromRoom}→${data.toRoom}`);
  }
  save(); closeModal(); renderCableRuns(); toast(id?'Cable run updated':'Cable run added','success');
}

function deleteCableRun(id) {
  if(!confirm('Delete this cable run?')) return;
  const p=getProject();
  const r=(p.cableRuns||[]).find(x=>x.id===id);
  if(r) logChange(`Cable run deleted: ${r.label||id}`);
  p.cableRuns=(p.cableRuns||[]).filter(x=>x.id!==id);
  save(); renderCableRuns(); toast('Deleted');
}
