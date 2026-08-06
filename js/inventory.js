// ═══════════════════════════════════════════
//  INVENTORY — device list, editor, patch
//  panels, file importers + review modal
// ═══════════════════════════════════════════

function _devicesAddSheet() {
  openModal(`
    <h3>Add to Inventory</h3>
    <div class="sheet-item" onclick="closeModal();addDevice()"><span class="si-ico">◈</span><div>Add Device<div class="si-sub">Switch, AP, camera, server…</div></div></div>
    <div class="sheet-item" onclick="closeModal();addPatchPanel()"><span class="si-ico" style="color:var(--amber)">⊟</span><div>Add Patch Panel</div></div>
    <div class="sheet-sep"></div>
    <div class="sheet-item" onclick="closeModal();importAngryIP()"><span class="si-ico">⊛</span><div>Import network scan<div class="si-sub">HyperNetworkScanner / Angry IP CSV — with filters</div></div></div>
    <div class="sheet-item" onclick="closeModal();importArpTable()"><span class="si-ico">⌗</span><div>Paste ARP table</div></div>
    <div class="sheet-item" onclick="closeModal();importScanCSV()"><span class="si-ico">⇩</span><div>Import CSV file<div class="si-sub">Auto-detects scanner exports — or map columns yourself</div></div></div>
  `);
}

function renderDevices(preserveSearch) {
  if (!state.selectedDeviceIds) state.selectedDeviceIds = new Set();
  const va = document.getElementById('view-area');
  const savedScroll = va ? va.scrollTop : 0;
  const selectMode = !!state.deviceSelectMode;
  setTopbarActions(`
    <button class="btn btn-ghost btn-sm" onclick="toggleSelectMode()">${selectMode ? '✕ Cancel' : '☑ Select'}</button>`);
  setFab(`<button class="fab" onclick="_devicesAddSheet()" title="Add">＋</button>`);

  const p = getProject();
  const filter = state.deviceFilter || 'all';
  const search = (state.deviceSearch || '').toLowerCase();

  const allNonPP = p.devices.filter(d => d.deviceType !== 'Patch Panel');
  const allPP    = p.devices.filter(d => d.deviceType === 'Patch Panel');

  const statusFilter = state.deviceStatusFilter || 'all';
  let devs = allNonPP.filter(d => {
    if (filter !== 'all' && d.deviceType !== filter) return false;
    if (statusFilter !== 'all' && (d.status||'') !== statusFilter) return false;
    if (search && !d.name.toLowerCase().includes(search) && !(d.ip||'').includes(search) && !(d.model||'').toLowerCase().includes(search) && !(d.mac||'').toLowerCase().includes(search) && !(d.deviceType||'').toLowerCase().includes(search) && !(d.manufacturer||'').toLowerCase().includes(search) && !(d.notes||'').toLowerCase().includes(search)) return false;
    return true;
  });
  // Name sort (stable, human-friendly)
  devs = [...devs].sort((a, b) => (a.name||'').localeCompare(b.name||'', undefined, { numeric: true }));

  const visibleIds = new Set(devs.map(d => d.id));
  state.selectedDeviceIds = new Set([...state.selectedDeviceIds].filter(id => visibleIds.has(id)));
  const selCount = state.selectedDeviceIds.size;

  const typeCounts = {};
  allNonPP.forEach(d => { typeCounts[d.deviceType||'Misc.'] = (typeCounts[d.deviceType||'Misc.']||0)+1; });
  const statusCounts = {};
  allNonPP.forEach(d => { if (d.status) statusCounts[d.status] = (statusCounts[d.status]||0)+1; });

  const typeChips = `
    <div class="chip-row">
      <div class="filter-tab ${filter==='all'?'active':''}" onclick="state.deviceFilter='all';renderDevices()">All (${allNonPP.length})</div>
      ${DEVICE_TYPES.filter(t => t !== 'Patch Panel' && typeCounts[t]).map(t =>
        `<div class="filter-tab ${filter===t?'active':''}" onclick="state.deviceFilter='${t.replace(/'/g,"\\'")}';renderDevices()" style="${filter===t?'border-color:'+dtColor(t)+';color:'+dtColor(t):''}"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${dtColor(t)};margin-right:5px"></span>${esc(t)} (${typeCounts[t]})</div>`
      ).join('')}
    </div>
    ${Object.keys(statusCounts).length > 0 ? `<div class="chip-row">
      <div class="filter-tab ${statusFilter==='all'?'active':''}" onclick="state.deviceStatusFilter='all';renderDevices()" style="font-size:12px">Status: All</div>
      ${Object.entries(statusCounts).map(([s,cnt]) => {
        const c = STATUS_COLORS[s]||'#778899';
        return `<div class="filter-tab ${statusFilter===s?'active':''}" onclick="state.deviceStatusFilter='${s}';renderDevices()" style="font-size:12px;${statusFilter===s?'border-color:'+c+';color:'+c:''}">${esc(STATUS_LABELS[s]||s)} (${cnt})</div>`;
      }).join('')}
    </div>` : ''}`;

  const deviceCards = devs.map(d => {
    const rack = p.racks.find(r => r.id === d.rackId);
    const sel = state.selectedDeviceIds.has(d.id);
    const patch = getPatchConnection(d.id, p);
    const c = dtColor(d.deviceType||'Misc.');
    const netLine = [d.ip, d.mac].filter(Boolean).join(' · ');
    const mfrLine = [d.manufacturer, d.model].filter(Boolean).join(' ');
    const clickAction = selectMode ? `toggleDeviceSel('${d.id}')` : `editDevice('${d.id}')`;
    return `
    <div class="list-card" data-dev-id="${d.id}" onclick="${clickAction}" style="${sel ? 'border-color:var(--accent);background:rgba(0,200,255,.07);' : ''}">
      <div class="lc-title">
        ${selectMode ? `<input type="checkbox" ${sel?'checked':''} onclick="event.stopPropagation();toggleDeviceSel('${d.id}')">` : `<span style="width:11px;height:11px;border-radius:50%;background:${c};flex-shrink:0"></span>`}
        <span class="t-name">${esc(d.name)}</span>
      </div>
      <div class="lc-sub">${esc(netLine || mfrLine || '—')}</div>
      ${netLine && mfrLine ? `<div class="lc-sub" style="color:var(--text3)">${esc(mfrLine)}</div>` : ''}
      <div class="lc-chips">
        ${dtBadge(d.deviceType||'Misc.')}
        ${statusBadge(d.status||'')}
        ${rack ? `<span class="badge badge-green">▤ ${esc(rack.name)}${d.rackU?' · U'+d.rackU:''}</span>` : ''}
        ${(d.ports||0) > 0 ? `<span class="badge badge-gray">⊡ ${Object.keys(d.portAssignments||{}).length}/${d.ports}</span>` : ''}
        ${patch ? `<span class="badge badge-wrap" style="background:${dtColor('Patch Panel')}18;border:1px solid ${dtColor('Patch Panel')}44;color:${dtColor('Patch Panel')}">⊟ ${esc(patch)}</span>` : ''}
      </div>
    </div>`;
  }).join('');

  const ppCards = allPP
    .filter(d => !search || d.name.toLowerCase().includes(search) || (d.model||'').toLowerCase().includes(search))
    .map(d => {
      const rack = p.racks.find(r => r.id === d.rackId);
      const used = Object.keys(d.portAssignments||{}).length;
      const total = d.ports || 0;
      const pct = total > 0 ? Math.round(used/total*100) : 0;
      const c = dtColor('Patch Panel');
      return `
      <div class="list-card" onclick="editDevice('${d.id}')">
        <div class="lc-title"><span style="font-size:16px;color:${c}">⊟</span><span class="t-name" style="color:${c}">${esc(d.name)}</span></div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:8px">
          <div style="flex:1;height:6px;border-radius:3px;background:var(--border);overflow:hidden">
            <div style="width:${pct}%;height:100%;background:${c}"></div>
          </div>
          <span class="mono" style="font-size:11px">${used}/${total}</span>
        </div>
        <div class="lc-chips">
          ${rack ? `<span class="badge badge-green">▤ ${esc(rack.name)}${d.rackU?' · U'+d.rackU:''}</span>` : `<span class="badge badge-gray">Unracked</span>`}
          ${d.model ? `<span class="badge badge-gray">${esc(d.model)}</span>` : ''}
        </div>
        <div class="lc-side"><button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();state.selectedSwitch='${d.id}';setView('ports')">Ports →</button></div>
      </div>`;
    }).join('');

  document.getElementById('view-area').innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:10px">
      <div class="search-box">
        <span style="color:var(--text3)">⌕</span>
        <input id="device-search-input" placeholder="Search devices…" value="${esc(state.deviceSearch || '')}" oninput="deviceSearchInput(this.value)">
      </div>
    </div>
    ${typeChips}
    ${devs.length === 0 && allNonPP.length === 0
      ? `<div class="empty-state"><div class="empty-icon">◈</div><h3>No devices yet</h3><p>Tap ＋ to add a device or import a network scan.</p></div>`
      : devs.length === 0
        ? `<div class="empty-state"><div class="empty-icon">⌕</div><h3>No matches</h3><p>Try a different search or filter.</p></div>`
        : `<div style="margin-top:6px">${deviceCards}</div>`}
    <div class="section-hdr">
      <span class="sh-title" style="color:${dtColor('Patch Panel')}">⊟ Patch Panels (${allPP.length})</span>
      <button class="btn btn-ghost btn-sm" onclick="addPatchPanel()">+ New</button>
    </div>
    ${allPP.length === 0 ? `<div style="color:var(--text3);font-size:13px;padding:4px 2px 10px">No patch panels yet.</div>` : ppCards}
    ${selCount > 0 ? `
    <div class="bulk-bar">
      <span class="bulk-count">${selCount} selected</span>
      <button class="btn btn-ghost btn-sm" onclick="selectAllVisibleDevices()">All</button>
      <button class="btn btn-ghost btn-sm" onclick="bulkChangeType()">⇄ Type</button>
      <button class="btn btn-danger btn-sm" onclick="bulkDelete()">✕ Delete</button>
      <button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="toggleSelectMode()">Done</button>
    </div>` : ''}
  `;

  if (preserveSearch) {
    const inp = document.getElementById('device-search-input');
    if (inp) { inp.focus(); const len = inp.value.length; inp.setSelectionRange(len, len); }
  }
  if (savedScroll && va) va.scrollTop = savedScroll;
}

function deviceSearchInput(val) {
  state.deviceSearch = val;
  clearTimeout(state.searchDebounce);
  state.searchDebounce = setTimeout(() => renderDevices(true), 200);
}

// ─── SELECT MODE / BULK ───
function toggleSelectMode() {
  state.deviceSelectMode = !state.deviceSelectMode;
  if (!state.deviceSelectMode) state.selectedDeviceIds = new Set();
  renderDevices();
}

function toggleDeviceSel(id) {
  if (state.selectedDeviceIds.has(id)) state.selectedDeviceIds.delete(id);
  else state.selectedDeviceIds.add(id);
  renderDevices();
}

function selectAllVisibleDevices() {
  const p = getProject();
  const filter = state.deviceFilter || 'all';
  const statusFilter = state.deviceStatusFilter || 'all';
  const search = (state.deviceSearch || '').toLowerCase();
  p.devices.forEach(d => {
    if (d.deviceType === 'Patch Panel') return;
    if (filter !== 'all' && d.deviceType !== filter) return;
    if (statusFilter !== 'all' && (d.status||'') !== statusFilter) return;
    if (search && !d.name.toLowerCase().includes(search) && !(d.ip||'').includes(search) && !(d.mac||'').toLowerCase().includes(search)) return;
    state.selectedDeviceIds.add(d.id);
  });
  renderDevices();
}

function bulkDelete() {
  const count = state.selectedDeviceIds.size;
  if (!count) return;
  const p = getProject();
  const names = p.devices.filter(d => state.selectedDeviceIds.has(d.id)).map(d => esc(d.name));
  const listHtml = names.length <= 10
    ? `<ul style="margin:8px 0 14px;padding-left:20px;color:var(--text2);font-size:13px">${names.map(n=>`<li>${n}</li>`).join('')}</ul>`
    : `<p style="color:var(--text2);font-size:13px;margin-bottom:14px">${names.slice(0,8).join(', ')} … and ${names.length-8} more</p>`;
  openModal(`
    <h3 style="color:var(--red)">⚠ Delete ${count} Device${count!==1?'s':''}?</h3>
    <p style="color:var(--text2);font-size:13px;margin-bottom:6px">These devices move to Trash for 30 days; their port assignments and rack placements are cleared:</p>
    ${listHtml}
    <p style="color:var(--text2);font-size:13px;margin-bottom:6px">Type <strong style="color:#fff">DELETE</strong> to confirm:</p>
    <div class="form-row"><input class="form-control" id="bulk-del-confirm" placeholder="DELETE" oninput="document.getElementById('bulk-del-btn').disabled=this.value!=='DELETE'"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button id="bulk-del-btn" class="btn btn-danger" disabled onclick="executeBulkDelete()">Delete</button>
    </div>`);
  setTimeout(() => document.getElementById('bulk-del-confirm')?.focus(), 60);
}

function executeBulkDelete() {
  const confirmVal = document.getElementById('bulk-del-confirm')?.value;
  if (confirmVal !== 'DELETE') return;
  const p = getProject();
  const ids = [...state.selectedDeviceIds];
  let count = 0;
  ids.forEach(id => { if (_deleteDeviceCore(p, id)) count++; });
  logChange(`Bulk deleted ${count} device${count!==1?'s':''} (moved to Trash)`);
  state.selectedDeviceIds = new Set();
  state.deviceSelectMode = false;
  save(); closeModal(); renderDevices(); toast(`${count} device${count!==1?'s':''} moved to Trash`, 'success');
}

function bulkChangeType() {
  const count = state.selectedDeviceIds.size;
  if (!count) return;
  const typeOpts = DEVICE_TYPES.map(t => `<option value="${t}">${t}</option>`).join('');
  openModal(`
    <h3>Change Type for ${count} Device${count!==1?'s':''}</h3>
    <div class="form-row"><label>Set Device Type To</label>
      <select class="form-control" id="bulk-type" onchange="updateBulkPortsField()">
        ${typeOpts}
      </select>
    </div>
    <div class="form-row" id="bulk-ports-field" style="display:none">
      <label>Number of Ports</label>
      <input class="form-control" id="bulk-ports" type="number" min="1" max="512" value="24">
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveBulkType()">Apply</button>
    </div>`);
}

function updateBulkPortsField() {
  const t = document.getElementById('bulk-type')?.value;
  const pf = document.getElementById('bulk-ports-field');
  if (pf) pf.style.display = PORT_CAPABLE.has(t) ? '' : 'none';
}

function saveBulkType() {
  const p = getProject();
  const deviceType = document.getElementById('bulk-type')?.value || 'Misc.';
  const ports = parseInt(document.getElementById('bulk-ports')?.value) || 24;
  const hasPorts = PORT_CAPABLE.has(deviceType);
  const ids = new Set(state.selectedDeviceIds);
  if (!ids.size) { toast('No devices selected', 'error'); return; }
  const names = p.devices.filter(d => ids.has(d.id)).map(d => d.name).join(', ');
  p.devices.forEach(d => {
    if (!ids.has(d.id)) return;
    d.deviceType = deviceType;
    d.type = deviceType === 'Switch' ? 'switching' : 'non-switching';
    if (hasPorts) { if (!d.ports) d.ports = ports; if (!d.portAssignments) d.portAssignments = {}; }
    else { d.ports = 0; }
  });
  logChange(`Bulk type change → ${deviceType} for ${ids.size} device${ids.size!==1?'s':''}: ${names}`);
  save(); closeModal(); renderDevices(); toast(`Updated ${ids.size} device${ids.size!==1?'s':''}`, 'success');
}

// ─── DEVICE CRUD ───
function addDevice() { openDeviceModal(null); }
function editDevice(id) { openDeviceModal(id); }

function addPatchPanel() {
  openModal(`
    <h3>⊟ New Patch Panel</h3>
    <div class="form-row"><label>Panel Name</label>
      <input class="form-control" id="pp-name" placeholder="e.g. PP-1, Main Panel, Floor 2" autofocus></div>
    <div class="form-row-inline">
      <div class="form-row"><label>Number of Ports</label>
        <select class="form-control" id="pp-ports">
          <option value="12">12 ports</option>
          <option value="24" selected>24 ports</option>
          <option value="48">48 ports</option>
          <option value="96">96 ports</option>
          <option value="100">100 terminals (50-row 66 block)</option>
        </select>
      </div>
      <div class="form-row"><label>U Height</label>
        <select class="form-control" id="pp-uheight">
          <option value="1" selected>1U</option>
          <option value="2">2U</option>
        </select>
      </div>
    </div>
    <div class="form-row"><label>Layout</label>
      <select class="form-control" id="pp-layout" onchange="_ppLayoutChanged()">
        <option value="">▭ Horizontal rows (rack faceplate)</option>
        <option value="66">▯ Vertical 66-block (wall punch-down)</option>
      </select></div>
    <div class="form-row"><label>Model <span style="color:var(--text3)">(optional)</span></label>
      <input class="form-control" id="pp-model" placeholder="e.g. Leviton 5G702-U48"></div>
    <div class="form-row"><label>Notes <span style="color:var(--text3)">(optional)</span></label>
      <textarea class="form-control" id="pp-notes" rows="2" placeholder="e.g. Serves floors 1-3" style="resize:vertical;font-family:inherit"></textarea></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="savePatchPanel()">Create Panel</button>
    </div>`);
  setTimeout(() => document.getElementById('pp-name')?.focus(), 50);
}

// Picking the 66-block layout defaults the count to a standard 50-row block
// (100 terminals — each side of a row is one port, drawn with two clips)
function _ppLayoutChanged() {
  const is66 = document.getElementById('pp-layout')?.value === '66';
  const ps = document.getElementById('pp-ports');
  if (ps) ps.value = is66 ? '100' : '24';
}

function savePatchPanel() {
  const p = getProject();
  const name  = document.getElementById('pp-name')?.value?.trim();
  const ports  = parseInt(document.getElementById('pp-ports')?.value) || 24;
  const uheight = parseInt(document.getElementById('pp-uheight')?.value) || 1;
  const model  = document.getElementById('pp-model')?.value?.trim() || '';
  const notes  = document.getElementById('pp-notes')?.value?.trim() || '';
  const panelStyle = document.getElementById('pp-layout')?.value || '';
  if (!name) return toast('Enter a panel name', 'error');
  const dev = {
    id: genId(), name, deviceType: 'Patch Panel',
    type: 'non-switching', ip: '', mac: '', manufacturer: '', model, notes,
    ports, deviceUHeight: uheight, panelStyle,
    rackId: null, rackU: null,
    portAssignments: {}, portNotes: {}, portVlans: {}, portPeerPort: {}, portPoe: {}, portLabels: {},
    addedDate: new Date().toISOString()
  };
  p.devices.push(dev);
  logChange(`Patch Panel added: ${name} (${ports} ports)`);
  save(); closeModal(); refreshView(); toast(`Patch panel "${name}" created`, 'success');
}

function openDeviceModal(id) {
  const p = getProject();
  const d = id ? p.devices.find(x => x.id === id) : null;
  const isNew = !d;
  const curType = d?.deviceType || 'Misc.';
  const showPorts = PORT_CAPABLE.has(curType);
  const typeOpts = DEVICE_TYPES.map(t => `<option value="${t}" ${curType===t?'selected':''}>${t}</option>`).join('');
  const statusOpts = [
    { v:'', label:'— No Status —' },
    { v:'verified', label:'✓ Verified' },
    { v:'needs-label', label:'⚠ Needs Label' },
    { v:'needs-attention', label:'⚠ Needs Attention' },
    { v:'unknown', label:'? Unknown' },
    { v:'decommission', label:'✕ Decommission' },
  ];
  const statusOptHtml = statusOpts.map(s => `<option value="${s.v}" ${(d?.status||'')=== s.v?'selected':''}>${s.label}</option>`).join('');
  const devPhotos = !isNew ? (p.photos || []).map((ph, i) => ({ ph, i }))
    .filter(({ ph }) => (ph.assignments || []).some(a => a && a.itemId === 'dev:' + id)) : [];
  openModal(`
    <h3>${isNew ? 'Add Device' : 'Edit Device'}</h3>
    <div class="form-row"><label>Device Name *</label>
      <input class="form-control" id="d-name" value="${esc(d?.name||'')}" placeholder="e.g. Core-SW-01"></div>
    <div class="form-row-inline">
      <div class="form-row"><label>Device Type</label>
        <select class="form-control" id="d-devtype" onchange="onDevTypeChange()">
          ${typeOpts}
        </select></div>
      <div class="form-row"><label>Status</label>
        <select class="form-control" id="d-status">${statusOptHtml}</select></div>
    </div>
    <div class="form-row-inline">
      <div class="form-row"><label>IP Address</label>
        <input class="form-control" id="d-ip" value="${esc(d?.ip||'')}" placeholder="192.168.1.1" inputmode="decimal"></div>
      <div class="form-row"><label>MAC Address</label>
        <input class="form-control" id="d-mac" value="${esc(d?.mac||'')}" placeholder="00:11:22:33:44:55"></div>
    </div>
    ${!isNew && (d.ipHistory||[]).length ? `
    <div class="form-row" style="margin-top:-6px">
      <div class="iph-toggle" onclick="const l=document.getElementById('iph-list');const on=l.style.display==='none';l.style.display=on?'':'none';this.querySelector('span').textContent=on?'▴':'▾'">
        ⏱ IP history (${d.ipHistory.length}) <span>▾</span>
      </div>
      <div id="iph-list" style="display:none">
        ${d.ipHistory.map(h => `
        <div class="iph-row">
          <span class="iph-ip">${esc(h.ip || '(removed)')}</span>
          <span class="iph-ts">${h.ts ? fmtTs(h.ts) : '—'}</span>
          <span class="iph-src">${esc(h.src || '')}</span>
        </div>`).join('')}
      </div>
    </div>` : ''}
    <div class="form-row-inline">
      <div class="form-row"><label>Manufacturer</label>
        <input class="form-control" id="d-mfr" value="${esc(d?.manufacturer||'')}" placeholder="Cisco, HP…"></div>
      <div class="form-row"><label>Model</label>
        <input class="form-control" id="d-model" value="${esc(d?.model||'')}" placeholder="Catalyst 9200"></div>
    </div>
    <div class="form-row-inline">
      <div class="form-row" id="ports-field" style="${showPorts?'':'display:none'}">
        <label>Ports</label>
        <input class="form-control" id="d-ports" type="number" min="0" max="512" value="${d ? (d.ports || 0) : 24}" inputmode="numeric">
      </div>
      <div class="form-row" id="uheight-field" style="${RACK_MOUNTABLE.has(curType)?'':'display:none'}">
        <label>U Height</label>
        <input class="form-control" id="d-uheight" type="number" min="1" max="16" value="${d?.deviceUHeight||1}" inputmode="numeric">
      </div>
    </div>
    <div class="form-row" id="layout-field" style="${PANEL_LIKE(curType)?'':'display:none'}">
      <label>Faceplate Layout</label>
      <select class="form-control" id="d-layout">
        <option value="" ${!d?.panelStyle?'selected':''}>▭ Horizontal rows (rack faceplate)</option>
        <option value="66" ${d?.panelStyle==='66'?'selected':''}>▯ Vertical 66-block (wall punch-down)</option>
      </select>
    </div>
    <div class="form-row"><label>Notes</label>
      <textarea class="form-control" id="d-notes" placeholder="Optional notes" rows="3" style="resize:vertical;font-family:inherit">${esc(d?.notes||'')}</textarea></div>
    ${!isNew ? `
    <div class="form-row"><label>${CAM_SVG} Photos (${devPhotos.length})</label>
      <div class="dev-ph-strip">
        <div class="dev-ph-add" onclick="devAddPhoto('${id}','capture')" title="Take photo">${CAM_SVG}</div>
        <div class="dev-ph-add" onclick="devAddPhoto('${id}','upload')" title="Add from gallery">⇪</div>
        ${devPhotos.map(({ ph, i }) => `<div class="dev-ph-thumb" style="background-image:url('${ph.thumb || ''}')" onclick="_openDevPhotos('${id}',${i})" title="${esc(ph.caption || ph.name || '')}"></div>`).join('')}
      </div>
    </div>` : ''}
    <div class="modal-actions">
      ${!isNew ? `<button class="btn btn-danger" style="flex:0 0 auto;min-width:0" onclick="closeModal();deleteDevice('${id}')">✕</button>` : ''}
      ${!isNew ? `<button class="btn btn-ghost" style="margin-right:auto;flex:0 0 auto;min-width:0" onclick="closeModal();duplicateDevice('${id}')" title="Duplicate this device">⧉ Duplicate</button>` : ''}
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveDevice('${id||''}')">Save</button>
    </div>
  `);
  // Swiping the sheet away / tapping outside SAVES an existing device's edits
  // instead of silently discarding them (Cancel still discards explicitly).
  if (!isNew) _modalDismissHook = () => saveDevice(id);
  if (isNew) setTimeout(() => document.getElementById('d-name')?.focus(), 50);
}

function onDevTypeChange() {
  const t = document.getElementById('d-devtype')?.value;
  const pf = document.getElementById('ports-field');
  const uf = document.getElementById('uheight-field');
  const lf = document.getElementById('layout-field');
  if (pf) pf.style.display = PORT_CAPABLE.has(t) ? '' : 'none';
  if (uf) uf.style.display = RACK_MOUNTABLE.has(t) ? '' : 'none';
  if (lf) lf.style.display = PANEL_LIKE(t) ? '' : 'none';
}

function saveDevice(id) {
  const p = getProject();
  const name = document.getElementById('d-name')?.value?.trim();
  if (!name) return toast('Device name is required', 'error');
  const deviceType = document.getElementById('d-devtype')?.value || 'Misc.';
  const hasPorts = PORT_CAPABLE.has(deviceType);
  const deviceUHeight = RACK_MOUNTABLE.has(deviceType) ? (parseInt(document.getElementById('d-uheight')?.value) || 1) : 1;
  const ipVal = document.getElementById('d-ip')?.value?.trim() || '';
  const macVal = document.getElementById('d-mac')?.value?.trim() || '';
  // Sanity check: duplicate IP / MAC across the project is usually a typo
  const macNorm = s => String(s || '').toLowerCase().replace(/[^a-f0-9]/g, '');
  const conflicts = [];
  if (ipVal) {
    const c = p.devices.find(d => d.id !== id && (d.ip || '').trim() === ipVal);
    if (c) conflicts.push(`IP ${ipVal} is already on "${c.name}"`);
  }
  if (macVal && macNorm(macVal).length >= 6) {
    const c = p.devices.find(d => d.id !== id && d.mac && macNorm(d.mac) === macNorm(macVal));
    if (c) conflicts.push(`MAC ${macVal} is already on "${c.name}"`);
  }
  if (conflicts.length && !confirm(`⚠ Possible duplicate:\n\n${conflicts.join('\n')}\n\nSave anyway?`)) return;
  // Empty/garbage ports field keeps the device's current count instead of
  // silently snapping back to 24
  const portsVal = parseInt(document.getElementById('d-ports')?.value);
  const oldDev = id ? p.devices.find(d => d.id === id) : null;
  let quietNoChange = false;
  const data = {
    name, deviceType,
    type: deviceType === 'Switch' ? 'switching' : 'non-switching',
    ip: ipVal,
    mac: macVal,
    manufacturer: document.getElementById('d-mfr')?.value?.trim() || '',
    model: document.getElementById('d-model')?.value?.trim() || '',
    ports: hasPorts ? (Number.isFinite(portsVal) && portsVal >= 0 ? portsVal : (oldDev ? oldDev.ports || 0 : 24)) : 0,
    panelStyle: PANEL_LIKE(deviceType) ? (document.getElementById('d-layout')?.value ?? (oldDev?.panelStyle || '')) : '',
    notes: document.getElementById('d-notes')?.value?.trim() || '',
    deviceUHeight,
    status: document.getElementById('d-status')?.value || ''
  };
  if (id) {
    const idx = p.devices.findIndex(d => d.id === id);
    if (idx >= 0) {
      const old = p.devices[idx];
      const changes = [];
      if (old.name !== data.name) changes.push(`name: "${old.name}" → "${data.name}"`);
      if (old.deviceType !== data.deviceType) changes.push(`type: ${old.deviceType} → ${data.deviceType}`);
      if ((old.ip||'') !== data.ip) { changes.push(`IP: ${old.ip||'—'} → ${data.ip||'—'}`); recordIpChange(old, data.ip, 'manual edit'); }
      if ((old.mac||'') !== data.mac) changes.push(`MAC: ${old.mac||'—'} → ${data.mac||'—'}`);
      if ((old.manufacturer||'') !== data.manufacturer) changes.push(`manufacturer changed`);
      if ((old.model||'') !== data.model) changes.push(`model changed`);
      if ((old.ports||0) !== (data.ports||0)) changes.push(`ports: ${old.ports||0} → ${data.ports||0}`);
      if ((old.notes||'') !== data.notes) changes.push(`notes changed`);
      if ((old.deviceUHeight||1) !== (data.deviceUHeight||1)) changes.push(`U-height: ${old.deviceUHeight||1}U → ${data.deviceUHeight||1}U`);
      if ((old.status||'') !== data.status) changes.push(`status changed`);
      if ((old.panelStyle||'') !== (data.panelStyle||'')) changes.push(`faceplate layout changed`);
      Object.assign(p.devices[idx], data);
      // A dismiss with nothing edited shouldn't spam the changelog or toast
      if (changes.length) logChange(`Device updated: ${name} — ${changes.join('; ')}`);
      else quietNoChange = true;
    }
  } else {
    const newDev = { id: genId(), ...data, rackId: null, rackU: null, portAssignments: {}, portNotes: {}, portVlans: {}, portPeerPort: {}, portPoe: {}, portLabels: {}, addedDate: new Date().toISOString() };
    p.devices.push(newDev);
    logChange(`Device added: ${name} (${deviceType})${data.ip?' IP:'+data.ip:''}${data.mac?' MAC:'+data.mac:''}`);
  }
  save(); closeModal(); refreshView();
  if (!quietNoChange) toast(id ? 'Device updated' : 'Device added', 'success');
}

// ─── Duplicate: same make/model/type/notes, blank identity (IP/MAC/rack/ports) ───
function _nextCopyName(base, p) {
  const names = new Set(p.devices.map(d => (d.name || '').toLowerCase()));
  const m = base.match(/^(.*?)(\d+)(\s*)$/);
  if (m) {
    const start = parseInt(m[2]);
    for (let n = start + 1; n < start + 500; n++) {
      const cand = m[1] + String(n).padStart(m[2].length, '0') + m[3];
      if (!names.has(cand.toLowerCase())) return cand;
    }
  }
  for (let n = 2; n < 500; n++) {
    const cand = `${base} ${n}`;
    if (!names.has(cand.toLowerCase())) return cand;
  }
  return base + ' copy';
}

function duplicateDevice(id) {
  const p = getProject();
  const src = p.devices.find(d => d.id === id);
  if (!src) return;
  const name = _nextCopyName(src.name || 'Device', p);
  const copy = migrateDevice({
    id: genId(), name,
    deviceType: src.deviceType, type: src.type,
    ip: '', mac: '',
    manufacturer: src.manufacturer || '', model: src.model || '',
    ports: src.ports || 0, notes: src.notes || '',
    deviceUHeight: src.deviceUHeight || 1, status: src.status || '',
    rackId: null, rackU: null,
    portAssignments: {}, portNotes: {}, portVlans: {}, portPeerPort: {}, portPoe: {}, portLabels: {},
    ipHistory: [],
    addedDate: new Date().toISOString()
  });
  p.devices.push(copy);
  logChange(`Device duplicated: ${src.name} → ${name}`);
  save(); refreshView();
  toast(`Duplicated as "${name}"`, 'success');
  editDevice(copy.id);
}

// ─── Device photos: shoot/attach from the editor, auto-tagged to the device ───
function devAddPhoto(devId, mode) {
  _pendingPhotoDevId = devId;
  document.getElementById(mode === 'capture' ? 'photo-capture' : 'photo-upload')?.click();
}

function _openDevPhotos(devId, idx) {
  const p = getProject();
  _viewerPhotoIndices = p.photos.map((ph, i) => ({ ph, i }))
    .filter(({ ph }) => (ph.assignments || []).some(a => a && a.itemId === 'dev:' + devId))
    .map(({ i }) => i);
  openPhotoViewer(idx);
}

// Move one device to the trash and scrub every reference to it —
// port links, riding-circuit records, map pins, photo tags.
// Shared by single delete and bulk delete. Caller saves/re-renders.
function _deleteDeviceCore(p, id) {
  const dev = p.devices.find(d => d.id === id);
  if (!dev) return false;
  logChange(`Device deleted: ${dev.name} (${dev.deviceType||'Misc.'})`);
  if (!p.deviceTrash) p.deviceTrash = [];
  p.deviceTrash.unshift({ ...dev, deletedAt: new Date().toISOString() });
  p.devices = p.devices.filter(d => d.id !== id);
  (p.siteMapFloors || []).forEach(f => { if (f.markers) f.markers = f.markers.filter(m => m.devId !== id); });
  p.devices.forEach(d => {
    if (d.parentDeviceId === id) d.parentDeviceId = null;
    if (d.portAssignments) {
      Object.keys(d.portAssignments).forEach(k => {
        if (d.portAssignments[k] === id) {
          delete d.portAssignments[k];
          if (d.portPeerPort) delete d.portPeerPort[k];
        }
      });
    }
    if (d.portEndDevice) {
      Object.keys(d.portEndDevice).forEach(k => {
        if (d.portEndDevice[k] === id) delete d.portEndDevice[k];
      });
    }
  });
  (p.photos||[]).forEach(ph => {
    if (!ph.assignments) return;
    ph.assignments.forEach((a, i) => {
      if (a?.itemId === `dev:${id}`) ph.assignments[i] = null;
    });
  });
  return true;
}

function deleteDevice(id) {
  if (!confirm('Delete this device? It moves to Trash for 30 days (⋮ menu → Trash).')) return;
  const p = getProject();
  _deleteDeviceCore(p, id);
  save(); refreshView(); toast('Moved to Trash — restore from ⋮ menu');
}

// ═══════════════════════════════════════════
//  IMPORT REVIEW MODAL
// ═══════════════════════════════════════════
let _reviewCandidates = [];
let _reviewSourceName = '';

function showImportReview(candidates, sourceName) {
  if (!candidates || candidates.length === 0) {
    toast('No importable devices found', 'error'); return;
  }
  _scanUpdates = []; // only the scan flow re-arms these (after this call)
  _reviewCandidates = candidates.map((c, i) => ({ _selected: true, ...c, _rid: i }));

  const rows = _reviewCandidates.map(c => `
    <tr id="rev-row-${c._rid}" class="${c._selected?'':'review-row-deselected'}">
      <td class="td-check"><input type="checkbox" id="rev-chk-${c._rid}" ${c._selected?'checked':''} onchange="_reviewCandidates[${c._rid}]._selected=this.checked;_reviewSyncCounts()"></td>
      <td style="font-weight:600;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(c.name)}">${esc(c.name)}</td>
      <td><span style="font-size:10px;font-family:var(--mono);color:${dtColor(c.deviceType||'Misc.')};white-space:nowrap">● ${esc(c.deviceType||'Misc.')}</span></td>
      <td><span class="mono" style="font-size:11px">${esc(c.ip||'—')}</span></td>
      <td><span class="mono" style="font-size:11px">${esc(c.mac||'—')}</span></td>
      <td style="font-size:11px;color:var(--text2)">${esc(c.manufacturer||'—')}</td>
    </tr>`).join('');

  const selCount = _reviewCandidates.filter(c => c._selected).length;

  document.getElementById('modal-content').innerHTML = `
    <h3 style="margin-bottom:6px">Review Import — ${esc(sourceName)}</h3>
    <div class="review-stats">
      <span id="rev-sel-count">${selCount}</span> of ${_reviewCandidates.length} selected · uncheck rows to skip
    </div>
    <div class="chip-row" style="margin-bottom:8px">
      <div class="filter-tab" onclick="reviewSelectAll(true)">All</div>
      <div class="filter-tab" onclick="reviewSelectAll(false)">None</div>
      <div class="filter-tab" onclick="reviewSelectByType('switching')">Switches</div>
      <div class="filter-tab" onclick="reviewSelectByField('mac')">Has MAC</div>
      <div class="filter-tab" onclick="reviewSelectByField('ip')">Has IP</div>
      <div class="filter-tab" onclick="reviewSelectByField('hostname')">Has Hostname</div>
    </div>
    <div class="review-table-wrap">
      <table>
        <thead><tr>
          <th class="th-check"><input type="checkbox" id="rev-all-chk" checked onchange="reviewSelectAll(this.checked)"></th>
          <th>Name</th><th>Type</th><th>IP</th><th>MAC</th><th>Mfr</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="modal-actions" style="margin-top:14px">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" id="rev-import-btn" onclick="commitImportReview()">Import ${selCount}</button>
    </div>`;
  document.getElementById('modal-overlay').classList.add('open');
  document.getElementById('modal-content').classList.add('modal-wide');
}

function _reviewSyncCounts() {
  const sel = _reviewCandidates.filter(c => c._selected);
  const allCk = sel.length === _reviewCandidates.length;
  document.getElementById('rev-sel-count').textContent = sel.length;
  document.getElementById('rev-import-btn').textContent = `Import ${sel.length}`;
  const allChk = document.getElementById('rev-all-chk');
  allChk.checked = allCk;
  allChk.indeterminate = sel.length > 0 && !allCk;
  _reviewCandidates.forEach(c => {
    const row = document.getElementById('rev-row-'+c._rid);
    if (!row) return;
    row.classList.toggle('review-row-deselected', !c._selected);
    const chk = document.getElementById('rev-chk-'+c._rid);
    if (chk) chk.checked = c._selected;
  });
}

function reviewSelectAll(checked) {
  _reviewCandidates.forEach(c => c._selected = checked);
  _reviewSyncCounts();
}

function reviewSelectByType(type) {
  _reviewCandidates.forEach(c => c._selected = c.type === type);
  _reviewSyncCounts();
}

function reviewSelectByField(field) {
  _reviewCandidates.forEach(c => {
    if (field === 'mac') c._selected = !!(c.mac && c.mac.trim() && c.mac.trim().toLowerCase() !== '[n/a]');
    else if (field === 'ip') c._selected = !!(c.ip && c.ip.trim());
    else if (field === 'hostname') c._selected = !!(c.name && c.name.trim() && c.name !== c.ip);
  });
  _reviewSyncCounts();
}

function showImportReviewNamed(candidates, sourceName) {
  _reviewSourceName = sourceName;
  showImportReview(candidates, sourceName);
}

async function commitImportReview() {
  const p = getProject();
  if (!p) { toast('No project open', 'error'); return; }
  const toImport = (_reviewCandidates || []).filter(c => c._selected);
  const updates = Array.isArray(_scanUpdates) ? _scanUpdates : [];
  if (toImport.length === 0 && updates.length === 0) { toast('No devices selected', 'error'); return; }
  let added = 0;
  toImport.forEach(c => {
    const { _rid, _selected, _force, type, ...dev } = c;
    if (!_force && dev.ip && p.devices.find(d => d.ip === dev.ip)) return;
    if (!dev.addedDate) dev.addedDate = new Date().toISOString();
    p.devices.push(migrateDevice(dev));
    added++;
  });
  let updated = 0;
  updates.forEach(u => {
    const d = p.devices.find(x => x.id === u.devId);
    if (!d) return;
    _scanApplyUpdate(d, u.r);
    updated++;
  });
  _scanUpdates = [];
  closeModal();
  if (added === 0 && updated === 0) {
    toast('All devices already exist (duplicate IPs)', 'error');
    return;
  }
  await _idbSaveProject(p);
  logChange(`Scan import: ${added} added${updated ? `, ${updated} updated` : ''}`);
  save();
  toast(`${added ? `Imported ${added}` : ''}${added && updated ? ' · ' : ''}${updated ? `updated ${updated}` : ''}`, 'success');
  setView('devices');
}

// ═══════════════════════════════════════════
//  IMPORTERS — Angry IP / ARP paste / CSV
// ═══════════════════════════════════════════
function importScanCSV() { document.getElementById('csv-input')?.click(); }

// Both CSV pickers ("Import CSV file" and "Import network scan") feed the
// same pipeline: sniff the header, auto-map the columns, and fall back to
// the manual column-mapping sheet when the file isn't recognisable.
function handleCSVImport(e) { _csvPickFile(e); }

function importArpTable() {
  openModal(`
    <h3>Import from ARP Table</h3>
    <p style="color:var(--text2);font-size:13px;margin-bottom:14px">
      Run <code style="background:var(--card);padding:2px 6px;border-radius:4px;color:var(--accent);font-family:var(--mono)">arp -a</code>
      on a computer on the network, then paste the output below.
    </p>
    <div class="form-row">
      <label>Paste ARP output</label>
      <textarea class="form-control" id="arp-paste" rows="10"
        style="font-family:var(--mono);font-size:12px;resize:vertical;min-height:150px"
        placeholder="  192.168.1.1           aa-bb-cc-dd-ee-ff     dynamic"></textarea>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="processArpPaste()">Import Devices</button>
    </div>
  `);
  setTimeout(() => document.getElementById('arp-paste')?.focus(), 50);
}

function processArpPaste() {
  const text = document.getElementById('arp-paste')?.value || '';
  if (!text.trim()) return toast('Nothing pasted', 'error');
  const { candidates, skipped } = parseArpCandidates(text);
  closeModal();
  if (candidates.length === 0) {
    toast(`No valid entries found — ${skipped} entries had no MAC address or were duplicates`, 'error');
  } else {
    showImportReviewNamed(candidates, `ARP Table${skipped?' ('+skipped+' pre-filtered)':''}`);
  }
}

function parseArpCandidates(text) {
  const p = getProject();
  const MAC_RE   = /([0-9a-fA-F]{2}[:\-]){5}[0-9a-fA-F]{2}/;
  const IP_RE    = /\b(\d{1,3}(?:\.\d{1,3}){3})\b/;
  const BAD_MACS = new Set(['ff-ff-ff-ff-ff-ff','ff:ff:ff:ff:ff:ff','00-00-00-00-00-00','00:00:00:00:00:00']);
  const SWITCH_RE = /switch|catalyst|procurve|juniper|netgear gs|cisco sg|aruba|extreme|brocade|mellanox/i;
  const candidates = []; let skipped = 0;

  text.split('\n').forEach(rawLine => {
    const line = rawLine.trim();
    if (!line || /^interface|^#/i.test(line)) return;
    const macMatch = line.match(MAC_RE);
    const ipMatch  = line.match(IP_RE);
    if (!ipMatch) { skipped++; return; }
    if (!macMatch) { skipped++; return; }
    const ip  = ipMatch[1];
    const mac = macMatch[0].replace(/-/g, ':').toUpperCase();
    if (BAD_MACS.has(mac.toLowerCase())) { skipped++; return; }
    if (p.devices.find(d => d.ip === ip)) { skipped++; return; }
    let hostname = '';
    const linuxMatch = line.match(/^([^\s(]+)\s*\(\d/);
    if (linuxMatch && linuxMatch[1] !== '?') hostname = linuxMatch[1].trim();
    const name = hostname || ip;
    const isSw = SWITCH_RE.test(name);
    candidates.push({ id: genId(), name, ip, mac, manufacturer:'', model:'', deviceType: isSw?'Switch':'Misc.', type: isSw?'switching':'non-switching', ports: isSw?24:0, notes:'', rackId:null, rackU:null, portAssignments:{}, portNotes:{}, portVlans:{}, portPeerPort:{}, portPoe:{}, portLabels:{} });
  });
  return { candidates, skipped };
}

function importAngryIP() { document.getElementById('angry-ip-input')?.click(); }

// ═══════════════════════════════════════════
//  NETWORK SCAN / CSV IMPORT — header-driven
//  column auto-detection (HyperNetworkScanner,
//  Angry IP, our own template) with a manual
//  column-mapping editor for odd files, then
//  a pre-import filter stage (ghost pings,
//  dead hosts, dup MACs, subnet/VLAN
//  selection, existing devices).
//  Known headers, handled automatically:
//    IP,Ping,Hostname,Ports,MAC Address,MAC Vendor[,Subnet]
//    IP,MAC,Hostname,Ports,Ping,MAC Vendor,Last Seen On,Date/Time Last Seen,Seen On,Subnet
//    name,type,ip,mac,manufacturer,model,ports
//  plus headerless Angry IP plain exports (tab or comma).
// ═══════════════════════════════════════════
let _scanRows = [];
let _scanFilters = null;
let _scanUpdates = [];
let _scanSource = '';

function handleAngryIPImport(e) { _csvPickFile(e); }

function _csvPickFile(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    e.target.value = '';
    _csvBegin(String(ev.target.result || ''), file.name.replace(/\.(csv|txt)$/i, ''));
  };
  reader.readAsText(file);
}

// One entry per field the app can fill: [key, label, header-regex].
// The regex drives auto-detection; the mapping sheet lets the user
// override any of it for oddly named or repositioned columns.
const _CSV_FIELDS = [
  ['ip',        'IP address',          /^ip$|ip.?add/],
  ['name',      'Name / hostname',     /host|^name$|device.?name/],
  ['mac',       'MAC address',         /^mac$|mac.?add/],
  ['vendor',    'Manufacturer',        /vendor|manufactur|brand/],
  ['model',     'Model',               /model/],
  ['dtype',     'Device type',         /^type$|device.?type|category/],
  ['ping',      'Ping / response',     /ping|latency|rtt/],
  ['openPorts', 'Open ports',          /open.?port/],
  ['portCount', 'Port count (switch)', /port.?count|number.?of.?ports/],
  ['subnet',    'Subnet / VLAN',       /subnet|vlan/],
  ['seenOn',    'Seen on (switch)',    /seen.?on/],
  ['seenAt',    'Scan date/time',      /date.?time|last.?seen$|scan.?(date|time)/],
  ['notes',     'Notes',               /note|comment|descri/],
];

let _csvLines = [], _csvDelim = ',', _csvHasHeader = true, _csvMap = {};

function _csvEmptyMap() { const m = {}; _CSV_FIELDS.forEach(([k]) => m[k] = -1); return m; }
function _csvSplit(line) { return _csvDelim === ',' ? parseCSVLine(line) : line.split('\t').map(c => c.trim()); }
function _csvClean(v) { const s = String(v == null ? '' : v).replace(/^["']|["']$/g, '').trim(); return /^\[?n\/?a\]?$/i.test(s) ? '' : s; }

function _csvAutoMap(cells) {
  const map = _csvEmptyMap(); const used = new Set();
  cells.forEach((raw, i) => {
    const h = String(raw || '').toLowerCase().replace(/['"]/g, '').trim();
    if (!h) return;
    for (const [k, , re] of _CSV_FIELDS) {
      if (map[k] !== -1 || !re.test(h)) continue;
      map[k] = i; used.add(i); break;
    }
  });
  // A bare "Ports" column is an open-port list on scanner exports but a
  // port COUNT on inventory sheets (which also carry type/model columns).
  if (map.openPorts === -1 && map.portCount === -1) {
    const pi = cells.findIndex(c => /^ports?$/i.test(String(c || '').replace(/['"]/g, '').trim()));
    if (pi !== -1 && !used.has(pi)) {
      if (map.dtype !== -1 || map.model !== -1) map.portCount = pi; else map.openPorts = pi;
    }
  }
  return map;
}

function _csvBegin(raw, sourceName) {
  const lines = String(raw || '').split('\n').map(l => l.replace(/\r$/, '')).filter(l => l.trim());
  if (!lines.length) { toast('That file is empty', 'error'); return; }
  _csvDelim = (lines[0].includes('\t') && !lines[0].includes(',')) ? '\t' : ',';
  _csvLines = lines;
  _scanSource = sourceName;
  _scanFilters = null;
  const first = _csvSplit(lines[0]);
  _csvHasHeader = !first.some(c => /^\d{1,3}(\.\d{1,3}){3}$/.test(String(c).trim()));
  _csvMap = _csvHasHeader
    ? _csvAutoMap(first)
    // Headerless Angry IP plain export: fixed column order
    : Object.assign(_csvEmptyMap(), { ip: 0, ping: 1, name: 2, openPorts: 3, mac: 4, vendor: 5 });
  _scanRows = _csvBuildRows();
  const usable = _scanRows.some(r => r.ip || r.mac);
  if (!_scanRows.length || !usable) { _csvMappingSheet(true); return; }
  _csvDefaultFilters();
  _scanFilterSheet();
}

function _csvBuildRows() {
  const m = _csvMap;
  const scanStyle = m.ping >= 0;
  const g = (c, k) => (m[k] === undefined || m[k] < 0) ? '' : _csvClean(c[m[k]]);
  const rows = [];
  _csvLines.slice(_csvHasHeader ? 1 : 0).forEach(line => {
    const c = _csvSplit(line);
    let ip = g(c, 'ip');
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) ip = '';
    const name = g(c, 'name');
    if (!ip && !name) return;
    const pingRaw = g(c, 'ping');
    let mac = g(c, 'mac').toUpperCase().replace(/-/g, ':');
    if (!/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac)) mac = '';
    const subCol = g(c, 'subnet');
    rows.push({
      ip,
      alive: !/^dead$/i.test(pingRaw),
      ping: pingRaw,
      hostname: name,
      mac,
      vendor: g(c, 'vendor'),
      model: g(c, 'model'),
      dtype: g(c, 'dtype'),
      portCount: parseInt(g(c, 'portCount')) || 0,
      extraNotes: g(c, 'notes'),
      openPorts: g(c, 'openPorts').split(/[,;]\s*/).map(s => parseInt(s)).filter(n => n > 0),
      subnet: subCol || (ip ? ip.split('.').slice(0, 3).join('.') + '.0/24' : '—'),
      noteSubnet: !!subCol || scanStyle,
      seenOn: g(c, 'seenOn'),
      seenAt: g(c, 'seenAt')
    });
  });
  return rows;
}

// Scanner exports (ping column present) default to the noise filters;
// plain inventory sheets import everything. Re-scan of a documented site
// (several MACs already known) → default to updating IPs instead of
// skipping those devices.
function _csvDefaultFilters() {
  const macKey = m => String(m || '').toUpperCase().replace(/[^A-F0-9]/g, '');
  const known = new Set(getProject().devices.map(d => macKey(d.mac)).filter(Boolean));
  const withMac = _scanRows.filter(r => r.mac);
  const matches = withMac.filter(r => known.has(macKey(r.mac))).length;
  const reScan = matches >= 3 || (withMac.length > 0 && matches / withMac.length >= 0.3);
  const scanStyle = _csvMap.ping >= 0;
  _scanFilters = {
    noMac: scanStyle && _csvMap.mac >= 0,
    dead: scanStyle,
    dupMac: _csvMap.mac >= 0,
    existing: reScan ? 'update' : 'skip',
    subnetsOff: new Set()
  };
  if (reScan) toast(`${matches} known devices found — set to update their IPs`, 'success');
}

// ── Manual column-mapping editor ──
function _csvMappingSheet(autoFailed) {
  const first = _csvSplit(_csvLines[0]);
  const sample = _csvSplit(_csvLines[(_csvHasHeader && _csvLines.length > 1) ? 1 : 0] || '');
  const nCols = Math.max(first.length, sample.length);
  const colName = i => _csvHasHeader ? (String(first[i] || '').replace(/['"]/g, '').trim() || 'Column ' + (i + 1)) : 'Column ' + (i + 1);
  const opts = k => {
    let o = `<option value="-1" ${_csvMap[k] < 0 ? 'selected' : ''}>—</option>`;
    for (let i = 0; i < nCols; i++) {
      const ex = _csvClean(sample[i]);
      o += `<option value="${i}" ${_csvMap[k] === i ? 'selected' : ''}>${esc(colName(i))}${ex ? ' · "' + esc(ex.length > 16 ? ex.slice(0, 15) + '…' : ex) + '"' : ''}</option>`;
    }
    return o;
  };
  openModal(`
    <h3>⚙ CSV Column Mapping</h3>
    <p style="color:var(--text2);font-size:13px;margin-bottom:12px">${autoFailed
      ? 'Couldn&#39;t recognise this file&#39;s columns automatically — match them up below.'
      : 'Adjust which column of the file feeds each field.'}</p>
    <label class="rpt-opt"><input type="checkbox" id="csvm-header" ${_csvHasHeader ? 'checked' : ''} onchange="_csvHeaderToggle(this.checked)">First row is column headers</label>
    <div style="max-height:44vh;overflow-y:auto;margin-bottom:4px">
      ${_CSV_FIELDS.map(([k, label]) => `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:7px">
          <label style="flex:0 0 132px;font-size:12.5px;color:var(--text2)">${label}</label>
          <select class="form-control" id="csvm-${k}" style="flex:1;min-width:0;padding:8px">${opts(k)}</select>
        </div>`).join('')}
    </div>
    <div style="font-size:11.5px;color:var(--text3)">Map at least IP address or Name.</div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="_csvMappingCancel()">Cancel</button>
      <button class="btn btn-primary" onclick="_csvApplyMapping()">Continue ⇢</button>
    </div>`);
}

function _csvReadMappingUI() {
  _CSV_FIELDS.forEach(([k]) => {
    const sel = document.getElementById('csvm-' + k);
    if (sel && sel.value !== '') _csvMap[k] = parseInt(sel.value);
  });
}

function _csvHeaderToggle(checked) {
  _csvReadMappingUI();
  _csvHasHeader = checked;
  if (checked && Object.values(_csvMap).every(v => v < 0)) _csvMap = _csvAutoMap(_csvSplit(_csvLines[0]));
  _csvMappingSheet();
}

function _csvMappingCancel() {
  if (_scanFilters && _scanRows.length) _scanFilterSheet();
  else closeModal();
}

function _csvApplyMapping() {
  _csvReadMappingUI();
  if (_csvMap.ip < 0 && _csvMap.name < 0) { toast('Map the IP or Name column first', 'error'); return; }
  const rows = _csvBuildRows();
  if (!rows.length) { toast('No usable rows with that mapping', 'error'); return; }
  _scanRows = rows;
  _csvDefaultFilters();
  _scanFilterSheet();
}

// Best-guess device type from hostname/vendor keywords, service ports and
// gateway conventions — a starting point the user can correct after import.
function _guessDeviceType(r) {
  const hay = ((r.hostname || '') + ' ' + (r.vendor || '')).toLowerCase();
  const ports = new Set(r.openPorts || []);
  if (/fortigate|sonicwall|palo alto|watchguard|firewall/.test(hay)) return 'Firewall';
  if (/router|gateway|pfsense|mikrotik|edgerouter|\busg\b|\budm\b|opnsense/.test(hay)) return 'Router';
  if (/switch|icx|catalyst|procurve|cisco sg|netgear gs|juniper|brocade|\bsw-|poe hub/.test(hay)) return 'Switch';
  if (/\bap\b|^ap-|\bap-\d|xap|uap|eap-|aironet|zoneflex|ruckus r\d|access.?point|\bwap\b|air-cap/.test(hay)) return 'AP';
  if (/access.?control|openpath|kisi|brivo|verkada.?-?ac\d|door.?controller|badge/.test(hay)) return 'Access Control';
  if (/axis|hikvision|dahua|avigilon|amcrest|reolink|vivotek|hanwha|verkada|\bipc\b|camera|\bcam\b|\buvc\b/.test(hay) || ports.has(554)) return 'IP Camera';
  if (/^brn|brother|jetdirect|^npi|print|epson|lexmark|kyocera|ricoh|xerox/.test(hay) || ports.has(9100) || ports.has(631) || ports.has(515)) return 'Printer';
  if (/^sep[0-9a-f]{6,}|polycom|yealink|grandstream|snom|mitel|voip/.test(hay)) return 'IP Phone';
  if (/synology|qnap|truenas|freenas|readynas|\bnas\b/.test(hay)) return 'NAS';
  if (/server|\bsrv\b|-dc\d|esxi|proxmox|vcenter|hyper-?v/.test(hay) || ports.has(3389)) return 'Server';
  const lastOctet = parseInt(r.ip.split('.')[3]);
  if ((lastOctet === 1 || lastOctet === 254) && r.alive) return 'Router';
  return 'Misc.';
}

function _scanName(r) {
  let h = (r.hostname || '').replace(/\.(localdomain|local|lan|home|arpa)$/i, '');
  if (h) return h;
  if (r.vendor && r.mac) return r.vendor + ' ' + r.mac.slice(-5).replace(':', '');
  return r.ip || 'Device';
}

function _scanNotes(r) {
  return [
    r.extraNotes || '',
    r.openPorts.length ? 'Open: ' + r.openPorts.join(', ') : '',
    r.seenOn ? 'Seen: ' + r.seenOn : '',
    r.noteSubnet ? 'Subnet: ' + r.subnet : '',
    r.seenAt ? 'Scanned: ' + r.seenAt : ''
  ].filter(Boolean).join(' | ');
}

// Apply the current filters → { newDevs, updates, skipped-counts }
function _scanPartition() {
  const p = getProject();
  const f = _scanFilters;
  const out = { newDevs: [], updates: [], skip: { subnet: 0, dead: 0, noMac: 0, dupMac: 0, existing: 0 } };
  const seenMacs = new Set();
  const macKey = m => String(m || '').toUpperCase().replace(/[^A-F0-9]/g, '');
  // Most recently seen first, so "skip duplicate MACs" keeps the newest sighting
  const rows = [..._scanRows].sort((a, b) => (b.seenAt || '').localeCompare(a.seenAt || ''));
  for (const r of rows) {
    if (f.subnetsOff.has(r.subnet)) { out.skip.subnet++; continue; }
    if (f.dead && !r.alive) { out.skip.dead++; continue; }
    if (f.noMac && !r.mac) { out.skip.noMac++; continue; }
    if (f.dupMac && r.mac) {
      if (seenMacs.has(r.mac)) { out.skip.dupMac++; continue; }
      seenMacs.add(r.mac);
    }
    const existing = p.devices.find(d =>
      (r.mac && d.mac && macKey(d.mac) === macKey(r.mac)) || (r.ip && d.ip === r.ip));
    if (existing) {
      if (f.existing === 'skip') { out.skip.existing++; continue; }
      if (f.existing === 'update') { out.updates.push({ devId: existing.id, r }); continue; }
    }
    out.newDevs.push(r);
  }
  const ipNum = ip => ip ? ip.split('.').reduce((a, o) => a * 256 + (+o), 0) : 0;
  out.newDevs.sort((a, b) => ipNum(a.ip) - ipNum(b.ip));
  return out;
}

function _scanFilterSheet() {
  const bySubnet = {};
  _scanRows.forEach(r => { bySubnet[r.subnet] = (bySubnet[r.subnet] || 0) + 1; });
  const subnets = Object.keys(bySubnet).sort();
  const f = _scanFilters;
  const tgl = (key, label, sub) => `
    <label class="sheet-item" style="cursor:pointer">
      <input type="checkbox" id="scf-${key}" ${f[key] ? 'checked' : ''} onchange="_scanFilters.${key}=this.checked;_scanFilterSync()">
      <div style="flex:1;min-width:0">${label}<div class="si-sub">${sub}</div></div>
      <span class="si-sub" id="scf-${key}-n"></span>
    </label>`;
  openModal(`
    <h3>⊛ Scan / CSV Import</h3>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
      <div style="flex:1;min-width:0;font-size:12px;color:var(--text3);font-family:var(--mono);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(_scanSource)} · ${_scanRows.length} rows · ${subnets.length} subnet${subnets.length !== 1 ? 's' : ''}</div>
      ${_csvLines.length ? `<button class="btn btn-ghost btn-sm" style="flex-shrink:0;padding:5px 10px;font-size:11.5px" onclick="_csvMappingSheet()">⚙ Columns</button>` : ''}
    </div>
    ${tgl('noMac', 'Skip ghosts (ping, no MAC)', 'Responded but no hardware address — usually noise')}
    ${tgl('dead', 'Skip dead hosts', 'No ping response at scan time')}
    ${tgl('dupMac', 'Skip duplicate MACs', 'Same device on several IPs — keeps the newest sighting')}
    <div class="sheet-item" style="cursor:default">
      <div style="flex:1;min-width:0">Already in this project<div class="si-sub">Matched by MAC, then by IP</div></div>
      <select class="form-control" style="flex:0 0 128px;padding:8px" id="scf-existing" onchange="_scanFilters.existing=this.value;_scanFilterSync()">
        <option value="skip" ${f.existing === 'skip' ? 'selected' : ''}>Skip</option>
        <option value="update" ${f.existing === 'update' ? 'selected' : ''}>Update IPs</option>
        <option value="add" ${f.existing === 'add' ? 'selected' : ''}>Add anyway</option>
      </select>
    </div>
    ${subnets.length > 1 ? `
      <div class="pcg-label" style="margin-top:10px">⌗ Subnets / VLANs to import</div>
      <div class="chip-row" style="margin-bottom:4px">${subnets.map((s, i) => `
        <div class="filter-tab active" id="scf-sub-${i}" onclick="_scanToggleSubnet('${esc(s)}', this)">${esc(s)} (${bySubnet[s]})</div>`).join('')}
      </div>` : ''}
    <div id="scf-summary" style="font-size:12.5px;color:var(--text2);font-family:var(--mono);margin:12px 2px"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" id="scf-continue" onclick="_scanContinue()">Continue</button>
    </div>`);
  _scanFilterSync();
}

function _scanToggleSubnet(subnet, el) {
  if (_scanFilters.subnetsOff.has(subnet)) _scanFilters.subnetsOff.delete(subnet);
  else _scanFilters.subnetsOff.add(subnet);
  el.classList.toggle('active', !_scanFilters.subnetsOff.has(subnet));
  _scanFilterSync();
}

function _scanFilterSync() {
  const part = _scanPartition();
  const n = key => { const el = document.getElementById('scf-' + key + '-n'); if (el) el.textContent = part.skip[key] ? '−' + part.skip[key] : ''; };
  n('noMac'); n('dead'); n('dupMac');
  const sum = document.getElementById('scf-summary');
  if (sum) {
    const bits = [`→ ${part.newDevs.length} new`];
    if (part.updates.length) bits.push(`${part.updates.length} update`);
    const totalSkip = Object.values(part.skip).reduce((a, b) => a + b, 0);
    if (totalSkip) bits.push(`${totalSkip} skipped`);
    sum.textContent = bits.join(' · ');
  }
  const btn = document.getElementById('scf-continue');
  if (btn) {
    btn.textContent = part.newDevs.length ? `Review ${part.newDevs.length}` : (part.updates.length ? `Apply ${part.updates.length} updates` : 'Continue');
    btn.disabled = !part.newDevs.length && !part.updates.length;
  }
}

function _scanContinue() {
  const part = _scanPartition();
  if (!part.newDevs.length) {
    if (part.updates.length) { _reviewCandidates = []; _scanUpdates = part.updates; commitImportReview(); }
    else { closeModal(); toast('Nothing to import with these filters', 'error'); }
    return;
  }
  const candidates = part.newDevs.map(r => {
    // A mapped type column wins (matched to a known type case-insensitively);
    // otherwise fall back to the hostname/vendor/port heuristics.
    const deviceType = r.dtype
      ? (DEVICE_TYPES.find(t => t.toLowerCase() === r.dtype.toLowerCase()) || r.dtype)
      : _guessDeviceType(r);
    return {
      id: genId(), name: _scanName(r), ip: r.ip, mac: r.mac,
      manufacturer: r.vendor, model: r.model || '',
      deviceType, type: deviceType === 'Switch' ? 'switching' : 'non-switching',
      ports: r.portCount || (deviceType === 'Switch' ? 24 : 0),
      notes: _scanNotes(r),
      ipHistory: r.ip ? [{ ip: r.ip, ts: r.seenAt || new Date().toISOString(), src: 'scan' }] : [],
      rackId: null, rackU: null,
      portAssignments: {}, portNotes: {}, portVlans: {}, portPeerPort: {}, portPoe: {}, portLabels: {},
      _force: _scanFilters.existing === 'add'
    };
  });
  showImportReviewNamed(candidates, `${_scanSource}${part.updates.length ? ` (+${part.updates.length} updates)` : ''}`);
  _scanUpdates = part.updates; // armed after showImportReview cleared it
}

// Merge fresh scan data into an existing device without clobbering
// anything the user curated by hand.
function _scanApplyUpdate(d, r) {
  if (r.ip) { recordIpChange(d, r.ip, 'scan', r.seenAt || undefined); d.ip = r.ip; }
  if (r.mac && !d.mac) d.mac = r.mac;
  if (r.vendor && !d.manufacturer) d.manufacturer = r.vendor;
  const looksLikeIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(d.name || '');
  if (looksLikeIp && _scanName(r) !== r.ip) d.name = _scanName(r);
  const scanNote = _scanNotes(r);
  if (scanNote) {
    const kept = (d.notes || '').split(' | ').filter(s => s && !/^(Open|Seen|Subnet|Scanned):/.test(s));
    d.notes = [...kept, scanNote].join(' | ');
  }
}

function parseCSVLine(line) {
  const result = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
    else { cur += c; }
  }
  result.push(cur.trim());
  return result;
}
