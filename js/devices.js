function renderDevices(preserveSearch) {
  if (!state.selectedDeviceIds) state.selectedDeviceIds = new Set();
  const va = document.getElementById('view-area');
  const savedScroll = va ? va.scrollTop : 0;
  setTopbarActions(`
    <button class="btn btn-ghost btn-sm" onclick="lookupMacManufacturers()" title="Look up missing manufacturers via MAC address">⊙ Lookup Manufacturers</button>
    <button class="btn btn-ghost btn-sm" onclick="addPatchPanel()">⊞ New Patch Panel</button>
    <button class="btn btn-ghost btn-sm" onclick="addFiberEnclosure()">⬡ New Fiber Enclosure</button>
    <button class="btn btn-primary btn-sm" onclick="addDevice()">+ Add Device</button>`);
  const p = getProject();
  const filter = state.deviceFilter || 'all';
  const search = (state.deviceSearch || '').toLowerCase();

  // ── Split patch panels and fiber enclosures out of the main device list ──
  const allNonPP = p.devices.filter(d => d.deviceType !== 'Patch Panel' && d.deviceType !== 'Fiber Enclosure');
  const allPP    = p.devices.filter(d => d.deviceType === 'Patch Panel');
  const allFE    = p.devices.filter(d => d.deviceType === 'Fiber Enclosure');

  const statusFilter = state.deviceStatusFilter || 'all';
  let devs = allNonPP.filter(d => {
    if (filter !== 'all' && d.deviceType !== filter) return false;
    if (statusFilter !== 'all' && (d.status||'') !== statusFilter) return false;
    if (search && !d.name.toLowerCase().includes(search) && !(d.ip||'').includes(search) && !(d.model||'').toLowerCase().includes(search) && !(d.mac||'').toLowerCase().includes(search) && !(d.deviceType||'').toLowerCase().includes(search) && !(d.serial||'').toLowerCase().includes(search) && !(d.manufacturer||'').toLowerCase().includes(search) && !(d.notes||'').toLowerCase().includes(search)) return false;
    return true;
  });

  // Sorting
  const sortCol = state.sortCol || null;
  const sortDir = state.sortDir || 'asc';
  if (sortCol) {
    devs = [...devs].sort((a, b) => {
      let va, vb;
      switch (sortCol) {
        case 'name':  va = (a.name||'').toLowerCase(); vb = (b.name||'').toLowerCase(); break;
        case 'type':  va = (a.deviceType||''); vb = (b.deviceType||''); break;
        case 'ip':    va = (a.ip||'').split('.').map(n=>n.padStart(3,'0')).join('.'); vb = (b.ip||'').split('.').map(n=>n.padStart(3,'0')).join('.'); break;
        case 'mac':   va = (a.mac||'').toLowerCase(); vb = (b.mac||'').toLowerCase(); break;
        case 'mfr':   va = ((a.manufacturer||'')+' '+(a.model||'')).toLowerCase(); vb = ((b.manufacturer||'')+' '+(b.model||'')).toLowerCase(); break;
        case 'ports': va = (a.ports||0); vb = (b.ports||0); break;
        case 'rack':  { const ra = p.racks.find(r=>r.id===a.rackId); const rb = p.racks.find(r=>r.id===b.rackId); va = ra?ra.name.toLowerCase():'zzz'; vb = rb?rb.name.toLowerCase():'zzz'; break; }
        default: va = ''; vb = '';
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }

  const visibleIds = new Set(devs.map(d => d.id));
  state.selectedDeviceIds = new Set([...state.selectedDeviceIds].filter(id => visibleIds.has(id)));
  const selCount = state.selectedDeviceIds.size;
  const allChecked = devs.length > 0 && selCount === devs.length;

  function thSort(label, col) {
    const active = sortCol === col;
    const arrow = active ? (sortDir === 'asc' ? '▲' : '▼') : '⬍';
    return `<th class="sortable${active?' sort-'+sortDir:''}" onclick="setSortCol('${col}')">${label}<span class="sort-arrow">${arrow}</span></th>`;
  }

  // Filter tabs: only non-patch-panel types
  const typeCounts = {};
  allNonPP.forEach(d => { typeCounts[d.deviceType||'Misc.'] = (typeCounts[d.deviceType||'Misc.']||0)+1; });
  const statusCounts = {};
  allNonPP.forEach(d => { if (d.status) statusCounts[d.status] = (statusCounts[d.status]||0)+1; });
  const hasSerial = allNonPP.some(d => d.serial);
  const filterTabsHtml = `
    <div class="filter-tabs" style="flex-wrap:wrap;gap:4px">
      <div class="filter-tab ${filter==='all'?'active':''}" onclick="state.deviceFilter='all';renderDevices()">All (${allNonPP.length})</div>
      ${DEVICE_TYPES.filter(t => t !== 'Patch Panel' && typeCounts[t]).map(t =>
        `<div class="filter-tab ${filter===t?'active':''}" onclick="state.deviceFilter='${t.replace(/'/g,"\\'")}';renderDevices()" style="${filter===t?'border-color:'+dtColor(t)+';color:'+dtColor(t):''}"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${dtColor(t)};margin-right:4px;vertical-align:middle"></span>${esc(t)} (${typeCounts[t]})</div>`
      ).join('')}
    </div>
    ${Object.keys(statusCounts).length > 0 ? `<div class="filter-tabs" style="flex-wrap:wrap;gap:4px;margin-top:4px">
      <div class="filter-tab ${statusFilter==='all'?'active':''}" onclick="state.deviceStatusFilter='all';renderDevices()" style="font-size:11px">Status: All</div>
      ${Object.entries(statusCounts).map(([s,cnt]) => {
        const c = STATUS_COLORS[s]||'#778899';
        return `<div class="filter-tab ${statusFilter===s?'active':''}" onclick="state.deviceStatusFilter='${s}';renderDevices()" style="${statusFilter===s?'border-color:'+c+';color:'+c:''};font-size:11px"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${c};margin-right:3px;vertical-align:middle"></span>${esc(STATUS_LABELS[s]||s)} (${cnt})</div>`;
      }).join('')}
    </div>` : ''}`;

  const bulkBar = selCount > 0 ? `
    <div class="bulk-bar">
      <span class="bulk-count">${selCount}</span> <span style="font-size:13px;color:var(--text2)">device${selCount!==1?'s':''} selected</span>
      <span class="bulk-sep">·</span>
      <button class="btn btn-ghost btn-sm" onclick="bulkAssignSwitch()">⊞ Assign to Switch</button>
      <button class="btn btn-ghost btn-sm" onclick="bulkChangeType()">⇄ Change Type</button>
      <button class="btn btn-ghost btn-sm" onclick="bulkCopyTable()">⎘ Copy Table</button>
      <button class="btn btn-ghost btn-sm" onclick="bulkClone()">⎘ Clone</button>
      <button class="btn btn-danger btn-sm" onclick="bulkDelete()">✕ Delete Selected</button>
      <button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="state.selectedDeviceIds=new Set();renderDevices()">✕ Clear</button>
    </div>` : '';

  const prevSearch = state.deviceSearch || '';

  // ── Patch Panels section ──
  const ppSearched = allPP.filter(d => !search || d.name.toLowerCase().includes(search) || (d.model||'').toLowerCase().includes(search));
  const feSearched = allFE.filter(d => !search || d.name.toLowerCase().includes(search) || (d.model||'').toLowerCase().includes(search));
  const ppSectionHtml = `
    <div style="margin-top:28px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:13px;font-weight:700;color:${dtColor('Patch Panel')};text-transform:uppercase;letter-spacing:1px">⊟ Patch Panels</span>
          <span style="font-size:11px;color:var(--text3);font-family:var(--mono)">${allPP.length} panel${allPP.length!==1?'s':''}</span>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="addPatchPanel()">+ New Patch Panel</button>
      </div>
      ${allPP.length === 0
        ? `<div style="color:var(--text3);font-size:12px;padding:12px 0">No patch panels yet. Click <strong>New Patch Panel</strong> to add one.</div>`
        : `<div class="devices-table-scroll">
          <table id="pp-table">
            <thead><tr>
              <th style="width:44px"></th>
              <th>Name</th>
              <th>Ports</th>
              <th>Ports Used</th>
              <th>Rack</th>
              <th>Model / Notes</th>
              <th></th>
            </tr></thead>
            <tbody>
              ${ppSearched.map(d => {
                const rack = p.racks.find(r => r.id === d.rackId);
                const used = Object.keys(d.portAssignments||{}).length;
                const total = d.ports || 0;
                const pct = total > 0 ? Math.round(used/total*100) : 0;
                const c = dtColor('Patch Panel');
                return `<tr>
                  <td style="text-align:center"><span style="font-size:16px">⊟</span></td>
                  <td style="font-weight:600;color:${c}">${esc(d.name)}</td>
                  <td><span class="mono">${total || '—'}</span></td>
                  <td>
                    <div style="display:flex;align-items:center;gap:6px">
                      <div style="width:60px;height:5px;border-radius:3px;background:var(--border);overflow:hidden">
                        <div style="width:${pct}%;height:100%;background:${c};border-radius:3px"></div>
                      </div>
                      <span class="mono" style="font-size:11px;color:var(--text2)">${used}/${total}</span>
                    </div>
                  </td>
                  <td>${rack?`<span class="badge badge-green">${esc(rack.name)}</span>`:'<span class="badge badge-gray">Unassigned</span>'}</td>
                  <td style="color:var(--text2);font-size:12px">${esc(d.model||'')}${d.notes?` <span style="color:var(--text3)">· ${esc(d.notes)}</span>`:''}</td>
                  <td><div class="td-actions">
                    <button class="btn btn-ghost btn-sm btn-icon" title="Edit" onclick="editDevice('${d.id}')">✎</button>
                    <button class="btn btn-danger btn-sm btn-icon" title="Delete" onclick="deleteDevice('${d.id}')">✕</button>
                  </div></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`}
    </div>`;

  // ── Fiber Enclosures section ──
  const feSectionHtml = `
    <div style="margin-top:28px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:13px;font-weight:700;color:${dtColor('Fiber Enclosure')};text-transform:uppercase;letter-spacing:1px">⬡ Fiber Enclosures</span>
          <span style="font-size:11px;color:var(--text3);font-family:var(--mono)">${allFE.length} enclosure${allFE.length!==1?'s':''}</span>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="addFiberEnclosure()">+ New Fiber Enclosure</button>
      </div>
      ${allFE.length === 0
        ? `<div style="color:var(--text3);font-size:12px;padding:12px 0">No fiber enclosures yet. Click <strong>New Fiber Enclosure</strong> to add one.</div>`
        : `<div class="devices-table-scroll">
          <table id="fe-table">
            <thead><tr>
              <th style="width:44px"></th>
              <th>Name</th>
              <th>Pairs</th>
              <th>U Height</th>
              <th>Rack</th>
              <th>Model / Notes</th>
              <th></th>
            </tr></thead>
            <tbody>
              ${feSearched.map(d => {
                const rack = p.racks.find(r => r.id === d.rackId);
                const c = dtColor('Fiber Enclosure');
                return `<tr>
                  <td style="text-align:center"><span style="font-size:16px">⬡</span></td>
                  <td style="font-weight:600;color:${c}">${esc(d.name)}</td>
                  <td><span class="mono">${d.fiberPairs || '—'}</span> pair</td>
                  <td><span class="mono">${d.deviceUHeight || 1}U</span></td>
                  <td>${rack?`<span class="badge badge-green">${esc(rack.name)}</span>`:'<span class="badge badge-gray">Unassigned</span>'}</td>
                  <td style="color:var(--text2);font-size:12px">${esc(d.manufacturer||'')}${d.manufacturer&&d.model?' ':''}${esc(d.model||'')}${d.notes?` <span style="color:var(--text3)">· ${esc(d.notes)}</span>`:''}</td>
                  <td><div class="td-actions">
                    <button class="btn btn-ghost btn-sm btn-icon" title="Edit" onclick="editDevice('${d.id}')">✎</button>
                    <button class="btn btn-danger btn-sm btn-icon" title="Delete" onclick="deleteDevice('${d.id}')">✕</button>
                  </div></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`}
    </div>`;

  document.getElementById('view-area').innerHTML = `
    <div class="devices-sticky-header">
      <div class="toolbar" style="margin-bottom:10px">
        <div class="search-box">
          <span style="color:var(--text3)">⌕</span>
          <input id="device-search-input" placeholder="Search devices & panels..." value="${esc(prevSearch)}" oninput="deviceSearchInput(this.value)">
        </div>
      </div>
      <div style="margin-bottom:8px">${filterTabsHtml}</div>
      ${bulkBar}
    </div>
    ${devs.length === 0 && filter !== 'all'
      ? `<div class="empty-state"><div class="empty-icon">◈</div><h3>No devices found</h3><p>Try adjusting your search or filter.</p></div>`
      : devs.length === 0 && allNonPP.length === 0
        ? `<div class="empty-state"><div class="empty-icon">◈</div><h3>No devices yet</h3><p>Add your first device to get started.</p></div>`
        : `<div class="devices-table-scroll">
      <table id="device-table">
        <thead><tr>
          <th class="th-check"><input type="checkbox" title="Select all" ${allChecked?'checked':''} onchange="bulkToggleAll(this.checked)"></th>
          ${thSort('Name','name')}
          ${thSort('Device Type','type')}
          <th>Status</th>
          <th>Manufacturer</th>
          ${thSort('IP Address','ip')}
          ${thSort('MAC Address','mac')}
          ${thSort('Manufacturer / Model','mfr')}
          ${hasSerial?'<th>Serial</th>':''}
          ${thSort('Ports','ports')}
          ${thSort('Rack','rack')}
          <th style="font-size:11px;color:${dtColor('Patch Panel')}">⊟ Patch</th>
          <th></th>
        </tr></thead>
        <tbody>
          ${devs.map(d => {
            const rack = p.racks.find(r => r.id === d.rackId);
            const sel = state.selectedDeviceIds.has(d.id);
            const patch = getPatchConnection(d.id, p);
            const c = dtColor('Patch Panel');
            return `<tr class="${sel?'row-selected':''}" data-dev-id="${d.id}">
              <td class="td-check"><input type="checkbox" ${sel?'checked':''} onchange="bulkToggleOne('${d.id}',this.checked)"></td>
              <td style="font-weight:600">${esc(d.name)}</td>
              <td>${dtBadge(d.deviceType||'Misc.')}</td>
              <td>${statusBadge(d.status||'')}</td>
              <td>${d.vendorId && getVendorById(d.vendorId) ? `<span style="font-size:11px">${esc(getVendorById(d.vendorId).name)}</span>` : '<span style="color:var(--text3);font-size:11px">—</span>'}</td>
              <td><span class="mono">${esc(d.ip||'—')}</span></td>
              <td><span class="mono">${esc(d.mac||'—')}</span></td>
              <td>${esc(d.manufacturer||'')} ${esc(d.model||'')}</td>
              ${hasSerial?`<td><span class="mono" style="font-size:11px">${esc(d.serial||'—')}</span></td>`:''}
              <td>${(d.ports||0)>0?(d.ports):'—'}</td>
              <td>${rack?`<span class="badge badge-green">${esc(rack.name)}</span>`:'<span class="badge badge-gray">Unassigned</span>'}</td>
              <td>${patch ? `<span class="mono" style="font-size:11px;color:${c};background:${c}18;border:1px solid ${c}33;border-radius:3px;padding:1px 5px;white-space:nowrap">${esc(patch)}</span>` : '<span style="color:var(--text3)">—</span>'}</td>
              <td><div class="td-actions">
                <button class="btn btn-ghost btn-sm btn-icon" title="Edit" onclick="editDevice('${d.id}')">✎</button>
                <button class="btn btn-danger btn-sm btn-icon" title="Delete" onclick="deleteDevice('${d.id}')">✕</button>
              </div></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`}
    ${ppSectionHtml}
    ${feSectionHtml}`;

  if (preserveSearch) {
    const inp = document.getElementById('device-search-input');
    if (inp) { inp.focus(); const len = inp.value.length; inp.setSelectionRange(len, len); }
  }
  if (savedScroll && va) va.scrollTop = savedScroll;
}

function deviceSearchInput(val) {
  state.deviceSearch = val;
  clearTimeout(state.searchDebounce);
  state.searchDebounce = setTimeout(() => renderDevices(true), 180);
}

function setSortCol(col) {
  if (state.sortCol === col) {
    state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    state.sortCol = col;
    state.sortDir = 'asc';
  }
  renderDevices();
}

// ─── BULK SELECTION HELPERS ───
function bulkToggleAll(checked) {
  const p = getProject();
  const filter = state.deviceFilter || 'all';
  const statusFilter = state.deviceStatusFilter || 'all';
  const search = (state.deviceSearch || '').toLowerCase();
  const devs = p.devices.filter(d => {
    if (d.deviceType === 'Patch Panel' || d.deviceType === 'Fiber Enclosure') return false;
    if (filter !== 'all' && d.deviceType !== filter) return false;
    if (statusFilter !== 'all' && (d.status||'') !== statusFilter) return false;
    if (search && !d.name.toLowerCase().includes(search) && !(d.ip||'').includes(search) && !(d.model||'').toLowerCase().includes(search) && !(d.mac||'').toLowerCase().includes(search) && !(d.deviceType||'').toLowerCase().includes(search)) return false;
    return true;
  });
  if (checked) devs.forEach(d => state.selectedDeviceIds.add(d.id));
  else state.selectedDeviceIds = new Set();
  renderDevices();
}

function bulkToggleOne(id, checked) {
  if (checked) state.selectedDeviceIds.add(id);
  else state.selectedDeviceIds.delete(id);
  // Update just the affected row — no full re-render, no scroll jump
  const row = document.querySelector(`tr[data-dev-id="${id}"]`);
  if (row) {
    row.classList.toggle('row-selected', checked);
    const cb = row.querySelector('input[type="checkbox"]');
    if (cb) cb.checked = checked;
  }
  _syncBulkBar();
}

function _syncBulkBar() {
  const p = getProject();
  if (!p) return;
  const filter = state.deviceFilter || 'all';
  const search = (state.deviceSearch || '').toLowerCase();
  const devs = p.devices.filter(d => {
    if (d.deviceType === 'Patch Panel' || d.deviceType === 'Fiber Enclosure') return false;
    if (filter !== 'all' && d.deviceType !== filter) return false;
    if (search && !d.name.toLowerCase().includes(search) &&
        !(d.ip||'').includes(search) && !(d.model||'').toLowerCase().includes(search) &&
        !(d.mac||'').toLowerCase().includes(search) && !(d.deviceType||'').toLowerCase().includes(search)) return false;
    return true;
  });
  const selCount = state.selectedDeviceIds.size;
  const allChecked = devs.length > 0 && selCount === devs.length;

  // Update header "select all" checkbox
  const headerCb = document.querySelector('#device-table thead input[type="checkbox"]');
  if (headerCb) headerCb.checked = allChecked;

  // Update or insert/remove bulk bar
  const stickyHeader = document.querySelector('.devices-sticky-header');
  const existingBar = document.querySelector('.bulk-bar');
  if (selCount > 0) {
    const bulkBarHtml = `<div class="bulk-bar">
      <span class="bulk-count">${selCount}</span> <span style="font-size:13px;color:var(--text2)">device${selCount!==1?'s':''} selected</span>
      <span class="bulk-sep">·</span>
      <button class="btn btn-ghost btn-sm" onclick="bulkAssignSwitch()">⊞ Assign to Switch</button>
      <button class="btn btn-ghost btn-sm" onclick="bulkChangeType()">⇄ Change Type</button>
      <button class="btn btn-ghost btn-sm" onclick="bulkCopyTable()">⎘ Copy Table</button>
      <button class="btn btn-ghost btn-sm" onclick="bulkClone()">⎘ Clone</button>
      <button class="btn btn-danger btn-sm" onclick="bulkDelete()">✕ Delete Selected</button>
      <button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="state.selectedDeviceIds=new Set();renderDevices()">✕ Clear</button>
    </div>`;
    if (existingBar) {
      existingBar.outerHTML = bulkBarHtml;
    } else if (stickyHeader) {
      stickyHeader.insertAdjacentHTML('beforeend', bulkBarHtml);
    }
  } else {
    if (existingBar) existingBar.remove();
  }
}

function bulkRowClick(event, id) {
  // Clicking the row (not the checkbox cell or action cell) toggles selection
  const tag = event.target.tagName;
  if (tag === 'BUTTON' || tag === 'INPUT') return;
  if (state.selectedDeviceIds.has(id)) state.selectedDeviceIds.delete(id);
  else state.selectedDeviceIds.add(id);
  renderDevices();
}

// ─── BULK ACTIONS ───
function bulkDelete() {
  const count = state.selectedDeviceIds.size;
  if (!count) return;
  const p = getProject();
  const names = p.devices.filter(d => state.selectedDeviceIds.has(d.id)).map(d => esc(d.name));
  const listHtml = names.length <= 10
    ? `<ul style="margin:8px 0 14px;padding-left:20px;color:var(--text2);font-size:12px">${names.map(n=>`<li>${n}</li>`).join('')}</ul>`
    : `<p style="color:var(--text2);font-size:12px;margin-bottom:14px">${names.slice(0,8).join(', ')} … and ${names.length-8} more</p>`;
  openModal(`
    <h3 style="color:var(--red)">⚠ Delete ${count} Device${count!==1?'s':''}?</h3>
    <p style="color:var(--text2);font-size:12px;margin-bottom:6px">The following devices will be permanently deleted along with all port assignments and rack placements:</p>
    ${listHtml}
    <p style="color:var(--text2);font-size:12px;margin-bottom:4px">Type <strong style="color:#fff">DELETE</strong> to confirm:</p>
    <div class="form-row"><input class="form-control" id="bulk-del-confirm" placeholder="DELETE" oninput="document.getElementById('bulk-del-btn').disabled=this.value!=='DELETE'"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button id="bulk-del-btn" class="btn btn-danger" disabled onclick="executeBulkDelete()">Delete ${count} Device${count!==1?'s':''}</button>
    </div>`);
  setTimeout(() => document.getElementById('bulk-del-confirm')?.focus(), 60);
}

function executeBulkDelete() {
  const confirm = document.getElementById('bulk-del-confirm')?.value;
  if (confirm !== 'DELETE') return;
  const p = getProject();
  const ids = new Set(state.selectedDeviceIds);
  const count = ids.size;
  const names = p.devices.filter(d => ids.has(d.id)).map(d => d.name).join(', ');
  p.devices = p.devices.filter(d => !ids.has(d.id));
  p.devices.forEach(d => {
    if (d.portAssignments) Object.keys(d.portAssignments).forEach(k => { if (ids.has(d.portAssignments[k])) delete d.portAssignments[k]; });
    if (ids.has(d.parentDeviceId)) d.parentDeviceId = null;
  });
  logChange(`Bulk deleted ${count} device${count!==1?'s':''}: ${names}`);
  state.selectedDeviceIds = new Set();
  save(); closeModal(); renderDevices(); toast(`Deleted ${count} device${count!==1?'s':''}`, 'success');
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
  const ids = new Set(state.selectedDeviceIds); // snapshot before modal closes
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

function bulkAssignSwitch() {
  const p = getProject();
  // Include APs — they have parentDeviceId connections but also appear in topology as connection points
  const switches = p.devices.filter(d => {
    const dt = d.deviceType || 'Misc.';
    return (PORT_CAPABLE.has(dt) && (d.ports||0) > 0) || dt === 'AP';
  });
  const count = state.selectedDeviceIds.size;
  if (!count) return;
  if (switches.length === 0) return toast('No Switch or AP devices found — add one with ports first', 'error');
  openModal(`
    <h3>Assign ${count} Device${count!==1?'s':''} to Switch / AP</h3>
    <p style="color:var(--text2);font-size:12px;margin-bottom:14px">Each selected device will be auto-assigned to the next available port on the selected device (or linked as "Connected to" for APs).</p>
    <div class="form-row"><label>Switch or AP</label>
      <select class="form-control" id="bulk-switch">
        ${switches.map(s => {
          const dt = s.deviceType || 'Misc.';
          const isAP = dt === 'AP';
          const used = Object.keys(s.portAssignments||{}).length;
          const free = isAP ? '—' : `${(s.ports||0) - used} port${(s.ports||0)-used!==1?'s':''} free`;
          return `<option value="${s.id}">${esc(s.name)} (${dt}) — ${free}</option>`;
        }).join('')}
      </select>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveBulkAssignSwitch()">Assign</button>
    </div>`);
}

function saveBulkAssignSwitch() {
  const p = getProject();
  const swId = document.getElementById('bulk-switch')?.value;
  const sw = p.devices.find(d => d.id === swId);
  if (!sw) return;
  const isAP = (sw.deviceType || '') === 'AP';
  if (!sw.portAssignments) sw.portAssignments = {};
  const portCount = sw.ports || 0;
  let assigned = 0, skipped = 0;
  const ids = [...new Set(state.selectedDeviceIds)];
  ids.forEach(devId => {
    if (devId === swId) { skipped++; return; }
    const dev = p.devices.find(d => d.id === devId);
    if (!dev) return;
    if (isAP) {
      // For APs: set parentDeviceId (topology link, no port slot consumed)
      dev.parentDeviceId = swId;
      logChange(`Bulk assigned (topology): ${dev.name} → AP ${sw.name}`);
      assigned++;
    } else {
      let freePort = null;
      for (let i = 1; i <= portCount; i++) {
        if (!sw.portAssignments[i]) { freePort = i; break; }
      }
      if (freePort === null) { skipped++; return; }
      sw.portAssignments[freePort] = devId;
      logChange(`Port assigned (bulk): ${sw.name} Port ${freePort} → ${dev.name}`);
      assigned++;
    }
  });
  save(); closeModal(); renderDevices();
  toast(`Assigned ${assigned} device${assigned!==1?'s':''} to ${esc(sw.name)}${skipped?' ('+skipped+' skipped'+(isAP?'':' — no free ports')+')':''}`, 'success');
}

function bulkCopyTable() {
  const p = getProject();
  const ids = state.selectedDeviceIds;
  const devs = ids.size > 0
    ? p.devices.filter(d => ids.has(d.id))
    : p.devices; // copy all if nothing selected
  const headers = ['Name','Type','IP Address','MAC Address','Manufacturer','Model','Ports','Rack','Notes'];
  const rows = devs.map(d => {
    const rack = p.racks.find(r => r.id === d.rackId);
    return [
      d.name, d.deviceType||'Misc.',
      d.ip||'', d.mac||'', d.manufacturer||'', d.model||'',
      (d.ports||0) > 0 ? (d.ports||0) : '',
      rack ? rack.name : '', d.notes||''
    ].map(v => String(v).includes('\t') ? `"${v}"` : v);
  });
  const tsv = [headers, ...rows].map(r => r.join('\t')).join('\n');
  navigator.clipboard.writeText(tsv).then(
    () => toast(`Copied ${devs.length} row${devs.length!==1?'s':''} to clipboard`, 'success'),
    () => {
      // Fallback for browsers that block clipboard
      const ta = document.createElement('textarea');
      ta.value = tsv; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy');
      document.body.removeChild(ta);
      toast(`Copied ${devs.length} row${devs.length!==1?'s':''} to clipboard`, 'success');
    }
  );
}

function addDevice() { openDeviceModal(null); }
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
        </select>
      </div>
      <div class="form-row"><label>U Height</label>
        <select class="form-control" id="pp-uheight">
          <option value="1" selected>1U</option>
          <option value="2">2U</option>
        </select>
      </div>
    </div>
    <div class="form-row"><label>Model <span style="color:var(--text3);font-weight:400">(optional)</span></label>
      <input class="form-control" id="pp-model" placeholder="e.g. Leviton 5G702-U48"></div>
    <div class="form-row"><label>Notes <span style="color:var(--text3);font-weight:400">(optional)</span></label>
      <textarea class="form-control" id="pp-notes" rows="2" placeholder="e.g. Serves floors 1-3" style="resize:vertical;font-family:inherit"></textarea></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="savePatchPanel()">Create Panel</button>
    </div>`);
  setTimeout(() => document.getElementById('pp-name')?.focus(), 50);
}
function savePatchPanel() {
  const p = getProject();
  const name  = document.getElementById('pp-name')?.value?.trim();
  const ports  = parseInt(document.getElementById('pp-ports')?.value) || 24;
  const uheight = parseInt(document.getElementById('pp-uheight')?.value) || 1;
  const model  = document.getElementById('pp-model')?.value?.trim() || '';
  const notes  = document.getElementById('pp-notes')?.value?.trim() || '';
  if (!name) return toast('Enter a panel name', 'error');
  const dev = {
    id: genId(), name, deviceType: 'Patch Panel',
    type: 'non-switching', ip: '', mac: '', manufacturer: '', model, notes,
    ports, deviceUHeight: uheight,
    rackId: null, rackU: null,
    portAssignments: {}, portNotes: {}, portVlans: {}, portPeerPort: {}, portPoe: {}, portLabels: {},
    addedDate: new Date().toISOString()
  };
  p.devices.push(dev);
  logChange(`Patch Panel added: ${name} (${ports} ports)`);
  save(); closeModal(); renderDevices(); toast(`Patch panel "${name}" created`, 'success');
}
function addFiberEnclosure() {
  openFiberEnclosureModal(null);
}
function openFiberEnclosureModal(id) {
  const p = getProject();
  const d = id ? p.devices.find(x => x.id === id) : null;
  const isNew = !d;
  const curPairs = d?.fiberPairs || 6;
  const curU = d?.deviceUHeight || 1;
  const pairOpts = [6,12,18,24,30,36,42,48,54,60,66,72].map(n =>
    `<option value="${n}" ${curPairs===n?'selected':''}>${n} pair</option>`
  ).join('');
  // >18 pair must be 4U; <=18 pair can be 1-4U
  const uOpts = curPairs > 18
    ? `<option value="4" selected>4U</option>`
    : [1,2,3,4].map(u => `<option value="${u}" ${curU===u?'selected':''}>${u}U</option>`).join('');
  openModal(`
    <h3>${isNew ? 'Add Fiber Enclosure' : 'Edit Fiber Enclosure'}</h3>
    <div class="form-row"><label>Enclosure Name</label>
      <input class="form-control" id="fe-name" value="${esc(d?.name||'')}" placeholder="e.g. FE-01, MDF Fiber" autofocus></div>
    <div class="form-row-inline">
      <div class="form-row"><label>Fiber Pairs</label>
        <select class="form-control" id="fe-pairs" onchange="onFiberPairsChange()">
          ${pairOpts}
        </select>
      </div>
      <div class="form-row"><label>U Height</label>
        <select class="form-control" id="fe-uheight">
          ${uOpts}
        </select>
      </div>
    </div>
    <div id="fe-uheight-note" style="font-size:10px;color:var(--amber);margin:-6px 0 10px;display:${curPairs>18?'block':'none'}">More than 18 pair requires 4U height.</div>
    <div class="form-row-inline">
      <div class="form-row"><label>Manufacturer <span style="color:var(--text3);font-weight:400">(opt.)</span></label>
        <input class="form-control" id="fe-mfr" value="${esc(d?.manufacturer||'')}" placeholder="Corning, CommScope, etc."></div>
      <div class="form-row"><label>Model <span style="color:var(--text3);font-weight:400">(opt.)</span></label>
        <input class="form-control" id="fe-model" value="${esc(d?.model||'')}" placeholder="e.g. CCH-012"></div>
    </div>
    <div class="form-row"><label>Notes <span style="color:var(--text3);font-weight:400">(optional)</span></label>
      <textarea class="form-control" id="fe-notes" rows="2" placeholder="e.g. SM fiber from demarc" style="resize:vertical;font-family:inherit">${esc(d?.notes||'')}</textarea></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveFiberEnclosure('${id||''}')">${isNew ? 'Create Enclosure' : 'Save'}</button>
    </div>`);
  setTimeout(() => document.getElementById('fe-name')?.focus(), 50);
}

function onFiberPairsChange() {
  const pairs = parseInt(document.getElementById('fe-pairs')?.value) || 6;
  const sel = document.getElementById('fe-uheight');
  const note = document.getElementById('fe-uheight-note');
  if (!sel) return;
  if (pairs > 18) {
    sel.innerHTML = '<option value="4" selected>4U</option>';
    if (note) note.style.display = 'block';
  } else {
    const curU = parseInt(sel.value) || 1;
    const validU = curU > 4 ? 1 : curU;
    sel.innerHTML = [1,2,3,4].map(u => `<option value="${u}" ${validU===u?'selected':''}>${u}U</option>`).join('');
    if (note) note.style.display = 'none';
  }
}

function saveFiberEnclosure(id) {
  const p = getProject();
  const name = document.getElementById('fe-name')?.value?.trim();
  if (!name) return toast('Enter an enclosure name', 'error');
  const fiberPairs = parseInt(document.getElementById('fe-pairs')?.value) || 6;
  const deviceUHeight = parseInt(document.getElementById('fe-uheight')?.value) || (fiberPairs > 18 ? 4 : 1);
  const manufacturer = document.getElementById('fe-mfr')?.value?.trim() || '';
  const model = document.getElementById('fe-model')?.value?.trim() || '';
  const notes = document.getElementById('fe-notes')?.value?.trim() || '';
  if (id) {
    const d = p.devices.find(x => x.id === id);
    if (d) {
      Object.assign(d, { name, fiberPairs, deviceUHeight, manufacturer, model, notes });
      logChange(`Fiber Enclosure updated: ${name} (${fiberPairs} pair, ${deviceUHeight}U)`);
    }
  } else {
    const dev = {
      id: genId(), name, deviceType: 'Fiber Enclosure',
      type: 'non-switching', ip: '', mac: '', manufacturer, model, notes,
      ports: 0, fiberPairs, deviceUHeight,
      rackId: null, rackU: null,
      portAssignments: {}, portNotes: {}, portVlans: {}, portPeerPort: {}, portPoe: {}, portLabels: {},
      addedDate: new Date().toISOString()
    };
    p.devices.push(dev);
    logChange(`Fiber Enclosure added: ${name} (${fiberPairs} pair, ${deviceUHeight}U)`);
  }
  save(); closeModal(); renderDevices(); toast(`Fiber enclosure "${name}" ${id ? 'updated' : 'created'}`, 'success');
}

function editDevice(id) { openDeviceModal(id); }

// ═══════════════════════════════════════════
//  IMPORT REVIEW MODAL
// ═══════════════════════════════════════════
// All bulk importers call this instead of directly pushing to p.devices.
// `candidates` = array of device objects (not yet in p.devices).
// `sourceName` = label shown in the modal title.
let _reviewCandidates = [];

function showImportReview(candidates, sourceName) {
  if (!candidates || candidates.length === 0) {
    toast('No importable devices found', 'error'); return;
  }
  _reviewCandidates = candidates.map((c, i) => ({ _selected: true, ...c, _rid: i }));

  function rebuild() {
    const sel = _reviewCandidates.filter(c => c._selected);
    const allCk = sel.length === _reviewCandidates.length;
    document.getElementById('rev-sel-count').textContent = sel.length;
    document.getElementById('rev-import-btn').textContent = `Import ${sel.length} Device${sel.length!==1?'s':''}`;
    document.getElementById('rev-all-chk').checked = allCk;
    document.getElementById('rev-all-chk').indeterminate = sel.length > 0 && !allCk;
    _reviewCandidates.forEach(c => {
      const row = document.getElementById('rev-row-'+c._rid);
      if (!row) return;
      row.classList.toggle('review-row-deselected', !c._selected);
      const chk = document.getElementById('rev-chk-'+c._rid);
      if (chk) chk.checked = c._selected;
    });
  }

  const rows = _reviewCandidates.map(c => `
    <tr id="rev-row-${c._rid}" class="${c._selected?'':'review-row-deselected'}">
      <td class="td-check"><input type="checkbox" id="rev-chk-${c._rid}" ${c._selected?'checked':''} onchange="_reviewCandidates[${c._rid}]._selected=this.checked;(${rebuild.toString()})()"></td>
      <td style="font-weight:600;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(c.name)}">${esc(c.name)}</td>
      <td><span class="badge ${c.type==='switching'?'badge-switch':'badge-nonswitch'}" style="font-size:10px">${c.type==='switching'?'SW':'DEV'}</span></td>
      <td><span class="mono" style="font-size:11px">${esc(c.ip||'—')}</span></td>
      <td><span class="mono" style="font-size:11px">${esc(c.mac||'—')}</span></td>
      <td style="font-size:11px;color:var(--text2)">${esc(c.manufacturer||'—')}</td>
      <td style="font-size:11px;color:var(--text2);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.notes||'')}</td>
    </tr>`).join('');

  const selCount = _reviewCandidates.filter(c => c._selected).length;

  document.getElementById('modal-content').innerHTML = `
    <h3 style="margin-bottom:6px">Review Import — ${esc(sourceName)}</h3>
    <div class="review-stats">
      <span id="rev-sel-count">${selCount}</span> of ${_reviewCandidates.length} selected for import
      &nbsp;·&nbsp; uncheck any rows you want to skip
    </div>
    <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap">
      <button class="btn btn-ghost btn-sm" onclick="reviewSelectAll(true)">Select All</button>
      <button class="btn btn-ghost btn-sm" onclick="reviewSelectAll(false)">Deselect All</button>
      <button class="btn btn-ghost btn-sm" onclick="reviewSelectByType('switching')">Select Switches Only</button>
      <button class="btn btn-ghost btn-sm" onclick="reviewSelectByType('non-switching')">Select Devices Only</button>
    </div>
    <div class="review-table-wrap">
      <table>
        <thead><tr>
          <th class="th-check"><input type="checkbox" id="rev-all-chk" checked onchange="reviewSelectAll(this.checked)"></th>
          <th>Name</th><th>Type</th><th>IP</th><th>MAC</th><th>Manufacturer</th><th>Notes</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="modal-actions" style="margin-top:14px">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" id="rev-import-btn" onclick="commitImportReview()">Import ${selCount} Device${selCount!==1?'s':''}</button>
    </div>`;
  document.getElementById('modal-overlay').classList.add('open');
  // Widen modal for review table
  document.getElementById('modal-content').classList.add('modal-wide');
}

function reviewSelectAll(checked) {
  _reviewCandidates.forEach(c => c._selected = checked);
  // re-render the review modal in-place
  showImportReview(_reviewCandidates.map(c => c), _reviewSourceName || 'Import');
}

function reviewSelectByType(type) {
  _reviewCandidates.forEach(c => c._selected = c.type === type);
  showImportReview(_reviewCandidates.map(c => c), _reviewSourceName || 'Import');
}

let _reviewSourceName = '';

function showImportReviewNamed(candidates, sourceName) {
  _reviewSourceName = sourceName;
  showImportReview(candidates, sourceName);
}

async function commitImportReview() {
  const p = getProject();
  if (!p) { toast('No project open', 'error'); return; }
  const toImport = _reviewCandidates.filter(c => c._selected);
  if (toImport.length === 0) { toast('No devices selected', 'error'); return; }
  let added = 0;
  toImport.forEach(c => {
    const { _rid, _selected, type, ...dev } = c;
    // Skip if IP already exists
    if (dev.ip && p.devices.find(d => d.ip === dev.ip)) return;
    if (!dev.addedDate) dev.addedDate = new Date().toISOString();
    p.devices.push(dev);
    added++;
  });
  if (added === 0) {
    closeModal();
    document.getElementById('modal-content').classList.remove('modal-wide');
    toast('All devices already exist (duplicate IPs)', 'error');
    return;
  }
  // Save to IDB, then render in place — avoids page-navigation race conditions
  await _idbSaveProject(p);
  save();
  closeModal();
  document.getElementById('modal-content').classList.remove('modal-wide');
  toast(`Imported ${added} device${added!==1?'s':''}`, 'success');
  // Render devices directly instead of navigating — data is already in memory
  state.currentView = 'devices';
  const title = document.getElementById('view-title');
  if (title) title.textContent = 'Devices';
  const sidebar = document.getElementById('sidebar-container');
  if (sidebar && typeof buildSidebar === 'function') sidebar.innerHTML = buildSidebar('devices');
  renderDevices();
}

function openDeviceModal(id) {
  const p = getProject();
  const d = id ? p.devices.find(x => x.id === id) : null;
  // Patch panels and fiber enclosures get their own dedicated editors
  if (d?.deviceType === 'Patch Panel') { openPatchPanelModal(id); return; }
  if (d?.deviceType === 'Fiber Enclosure') { openFiberEnclosureModal(id); return; }
  const isNew = !d;
  const curType = d?.deviceType || 'Misc.';
  const showPorts = PORT_CAPABLE.has(curType);
  const typeOpts = DEVICE_TYPES.map(t => `<option value="${t}" ${curType===t?'selected':''}>${t}</option>`).join('');
  // Parent device options: switches and APs that aren't this device
  const parentables = p.devices.filter(x => x.id !== id && (x.deviceType === 'Switch' || x.deviceType === 'AP' || PORT_CAPABLE.has(x.deviceType||'')));
  const parentOpts = `<option value="">— None —</option>` +
    parentables.map(x => `<option value="${x.id}" ${d?.parentDeviceId===x.id?'selected':''}>${esc(x.name)} (${esc(x.deviceType||'Misc.')})</option>`).join('');
  const statusOpts = [
    { v:'', label:'— No Status —', color:'var(--text2)' },
    { v:'verified', label:'✓ Verified', color:'#00e87a' },
    { v:'needs-label', label:'⚠ Needs Label', color:'#ffaa00' },
    { v:'needs-attention', label:'⚠ Needs Attention', color:'#ff4455' },
    { v:'unknown', label:'? Unknown', color:'#778899' },
    { v:'decommission', label:'✕ Decommission', color:'#445566' },
  ];
  const statusOptHtml = statusOpts.map(s => `<option value="${s.v}" ${(d?.status||'')=== s.v?'selected':''}>${s.label}</option>`).join('');
  const vendorOptHtml = `<option value="">— No Manufacturer —</option>` + (state.globalVendors||[]).map(v=>`<option value="${v.id}" ${(d?.vendorId||'')===v.id?'selected':''}>${esc(v.name)} (${esc(v.type||'')})</option>`).join('');
  openModal(`
    <h3>${isNew ? 'Add Device' : 'Edit Device'}</h3>
    <div class="form-row-inline">
      <div class="form-row" style="flex:2"><label>Device Name *</label>
        <input class="form-control" id="d-name" value="${esc(d?.name||'')}" placeholder="e.g. Core-SW-01"></div>
      <div class="form-row"><label>Device Type</label>
        <select class="form-control" id="d-devtype" onchange="onDevTypeChange()">
          ${typeOpts}
        </select></div>
    </div>
    <div class="form-row-inline">
      <div class="form-row"><label>IP Address</label>
        <input class="form-control" id="d-ip" value="${esc(d?.ip||'')}" placeholder="192.168.1.1"></div>
      <div class="form-row"><label>MAC Address</label>
        <input class="form-control" id="d-mac" value="${esc(d?.mac||'')}" placeholder="00:11:22:33:44:55"></div>
    </div>
    <div class="form-row-inline">
      <div class="form-row"><label>Manufacturer</label>
        <input class="form-control" id="d-mfr" value="${esc(d?.manufacturer||'')}" placeholder="Cisco, HP, etc."></div>
      <div class="form-row"><label>Model</label>
        <input class="form-control" id="d-model" value="${esc(d?.model||'')}" placeholder="Catalyst 9200"></div>
    </div>
    <div class="form-row-inline">
      <div class="form-row"><label>Status / Condition</label>
        <select class="form-control" id="d-status">${statusOptHtml}</select></div>
      <div class="form-row"><label>Manufacturer</label>
        <select class="form-control" id="d-vendor">${vendorOptHtml}</select></div>
    </div>
    <div class="form-row" id="ports-field" style="${showPorts?'':'display:none'}">
      <label>Number of Ports</label>
      <input class="form-control" id="d-ports" type="number" min="1" max="512" value="${d?.ports||24}" placeholder="24">
    </div>
    <div class="form-row" id="uheight-field" style="${RACK_MOUNTABLE.has(curType)?'':'display:none'}">
      <label>Rack U-Height <span style="color:var(--text3);font-weight:400">(how many U slots this device occupies)</span></label>
      <input class="form-control" id="d-uheight" type="number" min="1" max="16" value="${d?.deviceUHeight||1}" placeholder="1">
    </div>
    <div class="form-row"><label>Connected to Switch / AP <span style="color:var(--text3);font-weight:400">(appears in topology)</span></label>
      <select class="form-control" id="d-parent">${parentOpts}</select>
    </div>
    <div class="form-row"><label>Notes</label>
      <textarea class="form-control" id="d-notes" placeholder="Optional notes" rows="3" style="resize:vertical;font-family:inherit">${esc(d?.notes||'')}</textarea></div>

    <div class="asset-section">
      <div class="asset-section-hdr" onclick="this.nextElementSibling.classList.toggle('open');this.querySelector('.asset-arr').textContent=this.nextElementSibling.classList.contains('open')?'▲':'▼'">
        Asset Details <span class="asset-arr">▼</span>
      </div>
      <div class="asset-section-body">
        <div class="form-row"><label>Serial Number</label>
          <input class="form-control" id="d-serial" value="${esc(d?.serial||'')}" placeholder="SN-XXXXXXXX"></div>
        <div class="form-row-inline">
          <div class="form-row"><label>Warranty Expiry</label>
            <input class="form-control" type="date" id="d-warranty" value="${esc(d?.warrantyExpiry||'')}"></div>
          <div class="form-row"><label>EOL / End of Life Date</label>
            <input class="form-control" type="date" id="d-eol" value="${esc(d?.eolDate||'')}"></div>
        </div>
      </div>
    </div>

    <div style="border-top:1px solid var(--border);margin:14px 0 10px;padding-top:12px">
      <div style="font-size:11px;color:var(--text2);font-family:var(--mono);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Web Management Access</div>
      <div class="form-row-inline">
        <div class="form-row" style="flex:0 0 90px"><label>Protocol</label>
          <select class="form-control" id="d-webproto">
            <option value="https" ${(d?.webProtocol||'https')==='https'?'selected':''}>HTTPS</option>
            <option value="http" ${(d?.webProtocol||'https')==='http'?'selected':''}>HTTP</option>
          </select></div>
        <div class="form-row" style="flex:1"><label>Username</label>
          <input class="form-control" id="d-webuser" value="${esc(d?.webUser||'')}" placeholder="admin" autocomplete="off"></div>
        <div class="form-row" style="flex:1"><label>Password</label>
          <div style="position:relative;display:flex;align-items:center">
            <input class="form-control" type="password" id="d-webpass" value="${esc(d?.webPassword||'')}" placeholder="••••••••" autocomplete="off" style="padding-right:34px">
            <button type="button" title="Show/hide password" onclick="(function(btn){const inp=document.getElementById('d-webpass');const show=inp.type==='password';inp.type=show?'text':'password';btn.textContent=show?'🙈':'👁';btn.style.opacity=show?'1':'0.5';})(this)" style="position:absolute;right:6px;background:none;border:none;cursor:pointer;font-size:14px;line-height:1;padding:2px;opacity:0.5;color:var(--text2)">👁</button>
          </div></div>
      </div>
      ${d?.ip ? `<button type="button" class="btn btn-ghost btn-sm" onclick="deviceWebLogin('${esc(d.ip)}')">⇒ Login to Web UI</button>` : `<span style="font-size:11px;color:var(--text3)">Set an IP address to enable web login.</span>`}
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      ${!isNew ? `<button class="btn btn-ghost" onclick="cloneDevice('${id}')">⎘ Clone</button>` : ''}
      <button class="btn btn-primary" onclick="saveDevice('${id||''}')">Save</button>
    </div>
  `);
  setTimeout(() => document.getElementById('d-name')?.focus(), 50);
}

// ─── Patch Panel dedicated editor ───
function openPatchPanelModal(id) {
  const p = getProject();
  const d = p.devices.find(x => x.id === id);
  if (!d) return;
  const portCount = d.ports || 24;
  const assignments = d.portAssignments || {};
  const labels      = d.portLabels      || {};
  const notes       = d.portNotes       || {};
  const c = dtColor('Patch Panel');
  const usedCount = Object.keys(assignments).filter(k => assignments[k]).length;

  // Build mini port diagram — all ports in a wrapping grid
  let portDots = '';
  for (let i = 1; i <= portCount; i++) {
    const connDev = assignments[i] ? p.devices.find(x => x.id === assignments[i]) : null;
    const dc = connDev ? dtColor(connDev.deviceType || 'Misc.') : null;
    const lbl = labels[i] || '';
    const note = notes[i] || '';
    const titleParts = [`Port ${i}`];
    if (lbl) titleParts.push(lbl);
    if (connDev) titleParts.push('→ ' + connDev.name);
    if (note) titleParts.push(note);
    const clrStyle = dc
      ? `background:${dc};border-color:${dc};box-shadow:0 0 5px ${dc}88;color:#000;`
      : `background:var(--card);border-color:var(--border2);color:var(--text3);`;
    portDots += `<div class="pp-edit-port" style="${clrStyle}" title="${esc(titleParts.join(' · '))}"
      onclick="ppEditPortClick('${id}',${i})">
      <div class="pp-edit-num">${i}</div>
      ${lbl ? `<div class="pp-edit-lbl">${esc(lbl.length>5?lbl.slice(0,4)+'\u2026':lbl)}</div>` : ''}
    </div>`;
  }

  openModal(`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
      <h3 style="margin:0">⊟ Edit Patch Panel</h3>
      <button class="btn btn-primary btn-sm" onclick="ppGoToPortManager('${id}')">⊡ Port Manager →</button>
    </div>
    <p style="color:var(--text3);font-size:11px;margin-bottom:14px;font-family:var(--mono)">${usedCount} / ${portCount} ports labeled</p>

    <div class="form-row-inline">
      <div class="form-row" style="flex:2"><label>Panel Name *</label>
        <input class="form-control" id="ppe-name" value="${esc(d.name)}" placeholder="e.g. PP-1"></div>
      <div class="form-row"><label>Ports</label>
        <select class="form-control" id="ppe-ports">
          ${[12,24,48,96].map(n=>`<option value="${n}" ${portCount===n?'selected':''}>${n}</option>`).join('')}
        </select></div>
      <div class="form-row"><label>U-Height</label>
        <select class="form-control" id="ppe-uheight">
          <option value="1" ${(d.deviceUHeight||1)===1?'selected':''}>1U</option>
          <option value="2" ${(d.deviceUHeight||1)===2?'selected':''}>2U</option>
        </select></div>
    </div>
    <div class="form-row-inline">
      <div class="form-row"><label>Manufacturer</label>
        <input class="form-control" id="ppe-mfr" value="${esc(d.manufacturer||'')}" placeholder="Leviton, Panduit…"></div>
      <div class="form-row"><label>Model</label>
        <input class="form-control" id="ppe-model" value="${esc(d.model||'')}" placeholder="5G702-U24"></div>
    </div>
    <div class="form-row"><label>Panel Notes</label>
      <textarea class="form-control" id="ppe-notes" rows="2" placeholder="e.g. Serves floors 1–3, IDF cabinet A" style="resize:vertical">${esc(d.notes||'')}</textarea></div>

    <div style="margin:14px 0 6px;border-top:1px solid var(--border);padding-top:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <span style="font-size:11px;font-family:var(--mono);text-transform:uppercase;letter-spacing:1px;color:${c}">Port Overview</span>
        <span style="font-size:10px;color:var(--text3)">Click any port to edit its label / note</span>
      </div>
      <div class="pp-edit-grid">${portDots}</div>
    </div>

    <div class="modal-actions">
      <button class="btn btn-danger btn-sm" onclick="deleteDevice('${id}')" style="margin-right:auto">Delete Panel</button>
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="savePatchPanelEdit('${id}')">Save</button>
    </div>
  `, '600px');
  setTimeout(() => document.getElementById('ppe-name')?.focus(), 50);
}

function ppGoToPortManager(panelId) {
  state._ppModalOrigin = false;
  closeModal();
  state.selectedSwitch = panelId;
  setView('ports');
}

function ppEditPortClick(panelId, portNum) {
  const p = getProject();
  const d = p.devices.find(x => x.id === panelId);
  if (!d) return;
  const nameEl = document.getElementById('ppe-name');
  const notesEl = document.getElementById('ppe-notes');
  if (nameEl && nameEl.value.trim()) d.name = nameEl.value.trim();
  if (notesEl) d.notes = notesEl.value.trim();
  save();
  state._ppModalOrigin = true;
  assignPort(panelId, portNum);
}

function savePatchPanelEdit(id) {
  const p = getProject();
  const d = p.devices.find(x => x.id === id);
  if (!d) return;
  const name = document.getElementById('ppe-name')?.value?.trim();
  if (!name) return toast('Panel name is required', 'error');
  const oldPorts = d.ports || 24;
  const newPorts = parseInt(document.getElementById('ppe-ports')?.value) || 24;
  d.name        = name;
  d.ports       = newPorts;
  d.deviceUHeight = parseInt(document.getElementById('ppe-uheight')?.value) || 1;
  d.manufacturer  = document.getElementById('ppe-mfr')?.value?.trim() || '';
  d.model         = document.getElementById('ppe-model')?.value?.trim() || '';
  d.notes         = document.getElementById('ppe-notes')?.value?.trim() || '';
  if (newPorts !== oldPorts) logChange(`Patch Panel ports changed: ${name} ${oldPorts}→${newPorts}`);
  logChange(`Patch Panel updated: ${name}`);
  save(); closeModal(); if (typeof refreshView === 'function') refreshView(); else renderDevices(); toast('Patch panel saved', 'success');
}

function deviceWebLogin(ip) {
  const proto   = document.getElementById('d-webproto')?.value || 'https';
  const user    = document.getElementById('d-webuser')?.value?.trim() || '';
  const pass    = document.getElementById('d-webpass')?.value || '';
  const url     = `${proto}://${ip}`;

  // Open the web UI
  window.open(url, '_blank', 'noopener');

  // Show a credential helper — browser security blocks url-embedded creds for HTTPS,
  // so we surface them in a dismissible overlay for easy manual paste
  const overlayId = 'cred-helper-overlay';
  const existing = document.getElementById(overlayId);
  if (existing) existing.remove();

  if (!user && !pass) return; // nothing to show

  const el = document.createElement('div');
  el.id = overlayId;
  el.style.cssText = `position:fixed;bottom:20px;right:20px;z-index:9999;
    background:#0e1825;border:1.5px solid #1e90ff44;border-radius:10px;
    padding:16px 18px;min-width:260px;box-shadow:0 4px 24px #000a;font-family:Consolas,monospace`;
  el.innerHTML = `
    <div style="font-size:11px;color:#5599cc;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Web UI Credentials — ${esc(url)}</div>
    ${user ? `<div style="margin-bottom:8px;display:flex;align-items:center;gap:8px">
      <span style="font-size:11px;color:#778899;min-width:60px">User</span>
      <span style="font-size:13px;color:#cce4f8;flex:1;font-family:Consolas,monospace">${esc(user)}</span>
      <button onclick="navigator.clipboard.writeText('${user.replace(/'/g,"\\'")}');this.textContent='✓';setTimeout(()=>this.textContent='⎘',1200)" style="background:none;border:1px solid #1e90ff44;color:#5599cc;border-radius:4px;cursor:pointer;padding:2px 8px;font-size:12px">⎘</button>
    </div>` : ''}
    ${pass ? `<div style="margin-bottom:10px;display:flex;align-items:center;gap:8px">
      <span style="font-size:11px;color:#778899;min-width:60px">Password</span>
      <span style="font-size:13px;color:#cce4f8;flex:1;font-family:Consolas,monospace">${esc(pass)}</span>
      <button onclick="navigator.clipboard.writeText('${pass.replace(/'/g,"\\'")}');this.textContent='✓';setTimeout(()=>this.textContent='⎘',1200)" style="background:none;border:1px solid #1e90ff44;color:#5599cc;border-radius:4px;cursor:pointer;padding:2px 8px;font-size:12px">⎘</button>
    </div>` : ''}
    <div style="display:flex;justify-content:flex-end">
      <button onclick="document.getElementById('${overlayId}')?.remove()" style="background:none;border:1px solid #334;color:#556;border-radius:4px;cursor:pointer;padding:3px 12px;font-size:11px">Dismiss</button>
    </div>`;
  document.body.appendChild(el);
  // Auto-dismiss after 30s
  setTimeout(() => document.getElementById(overlayId)?.remove(), 30000);
}

function onDevTypeChange() {
  const t = document.getElementById('d-devtype')?.value;
  const pf = document.getElementById('ports-field');
  const uf = document.getElementById('uheight-field');
  if (pf) pf.style.display = PORT_CAPABLE.has(t) ? '' : 'none';
  if (uf) uf.style.display = RACK_MOUNTABLE.has(t) ? '' : 'none';
}

function saveDevice(id) {
  const p = getProject();
  const name = document.getElementById('d-name')?.value?.trim();
  if (!name) return toast('Device name is required', 'error');
  const deviceType = document.getElementById('d-devtype')?.value || 'Misc.';
  const hasPorts = PORT_CAPABLE.has(deviceType);
  const parentDeviceId = document.getElementById('d-parent')?.value || null;
  const webUser     = document.getElementById('d-webuser')?.value?.trim() || '';
  const webPassword = document.getElementById('d-webpass')?.value || '';
  const webProtocol = document.getElementById('d-webproto')?.value || 'https';
  const deviceUHeight = RACK_MOUNTABLE.has(deviceType) ? (parseInt(document.getElementById('d-uheight')?.value) || 1) : 1;
  const ipVal = document.getElementById('d-ip')?.value?.trim() || '';
  const macVal = document.getElementById('d-mac')?.value?.trim() || '';
  // Feature 4: Duplicate detection (warn but don't block)
  if (ipVal) {
    const ipConflict = p.devices.find(d => d.id !== id && d.ip === ipVal);
    if (ipConflict) toast(`Warning: IP ${ipVal} is already used by ${ipConflict.name}`, 'warning');
  }
  if (macVal) {
    const macConflict = p.devices.find(d => d.id !== id && d.mac && d.mac.toLowerCase() === macVal.toLowerCase());
    if (macConflict) toast(`Warning: MAC ${macVal} is already used by ${macConflict.name}`, 'warning');
  }
  const data = {
    name, deviceType,
    type: deviceType === 'Switch' ? 'switching' : 'non-switching',
    ip: ipVal,
    mac: macVal,
    manufacturer: document.getElementById('d-mfr')?.value?.trim() || '',
    model: document.getElementById('d-model')?.value?.trim() || '',
    ports: hasPorts ? parseInt(document.getElementById('d-ports')?.value) || 24 : 0,
    notes: document.getElementById('d-notes')?.value?.trim() || '',
    parentDeviceId: parentDeviceId || null,
    webUser, webPassword, webProtocol,
    deviceUHeight,
    status: document.getElementById('d-status')?.value || '',
    vendorId: document.getElementById('d-vendor')?.value || '',
    serial: document.getElementById('d-serial')?.value?.trim() || '',
    warrantyExpiry: document.getElementById('d-warranty')?.value || '',
    eolDate: document.getElementById('d-eol')?.value || '',
  };
  if (id) {
    const idx = p.devices.findIndex(d => d.id === id);
    if (idx >= 0) {
      const old = p.devices[idx];
      // Log each changed field
      const changes = [];
      if (old.name !== data.name) changes.push(`name: "${old.name}" → "${data.name}"`);
      if (old.deviceType !== data.deviceType) changes.push(`type: ${old.deviceType} → ${data.deviceType}`);
      if ((old.ip||'') !== data.ip) changes.push(`IP: ${old.ip||'—'} → ${data.ip||'—'}`);
      if ((old.mac||'') !== data.mac) changes.push(`MAC: ${old.mac||'—'} → ${data.mac||'—'}`);
      if ((old.manufacturer||'') !== data.manufacturer) changes.push(`manufacturer: "${old.manufacturer||''}" → "${data.manufacturer}"`);
      if ((old.model||'') !== data.model) changes.push(`model: "${old.model||''}" → "${data.model}"`);
      if ((old.ports||0) !== (data.ports||0)) changes.push(`ports: ${old.ports||0} → ${data.ports||0}`);
      if ((old.notes||'') !== data.notes) changes.push(`notes changed: "${data.notes}"`);
      const oldParent = p.devices.find(d => d.id === (old.parentDeviceId||null));
      const newParent = data.parentDeviceId ? p.devices.find(d => d.id === data.parentDeviceId) : null;
      if ((old.parentDeviceId||null) !== (data.parentDeviceId||null)) {
        changes.push(`connected to: ${oldParent?oldParent.name:'None'} → ${newParent?newParent.name:'None'}`);
      }
      if ((old.vendorId||'') !== (data.vendorId||'')) {
        const oldV = getVendorById(old.vendorId||'');
        const newV = getVendorById(data.vendorId||'');
        changes.push(`manufacturer: ${oldV?oldV.name:'None'} → ${newV?newV.name:'None'}`);
      }
      if ((old.webUser||'') !== data.webUser) changes.push(`web user: "${old.webUser||''}" → "${data.webUser}"`);
      if ((old.webPassword||'') !== data.webPassword) changes.push(`web password: "${old.webPassword||''}" → "${data.webPassword}"`);
      if ((old.webProtocol||'https') !== data.webProtocol) changes.push(`web protocol: ${old.webProtocol||'https'} → ${data.webProtocol}`);
      if ((old.deviceUHeight||1) !== (data.deviceUHeight||1)) changes.push(`rack U-height: ${old.deviceUHeight||1}U → ${data.deviceUHeight||1}U`);
      Object.assign(p.devices[idx], data);
      logChange(`Device updated: ${name}${changes.length ? ' — ' + changes.join('; ') : ''}`);
    }
  } else {
    const newDev = { id: genId(), ...data, rackId: null, rackU: null, portAssignments: {}, portNotes: {}, portVlans: {}, portPeerPort: {}, portPoe: {}, portLabels: {}, addedDate: new Date().toISOString() };
    p.devices.push(newDev);
    const credStr = data.webUser ? ` web:${data.webProtocol}://${data.webUser}:${data.webPassword}@${data.ip||'?'}` : '';
    logChange(`Device added: ${name} (${deviceType})${data.ip?' IP:'+data.ip:''}${data.mac?' MAC:'+data.mac:''}${credStr}`);
  }
  save(); closeModal(); if (typeof refreshView === 'function') refreshView(); else renderDevices(); toast(id ? 'Device updated' : 'Device added', 'success');
}

function deleteDevice(id) {
  if (!confirm('Delete this device?')) return;
  const p = getProject();
  const dev = p.devices.find(d => d.id === id);
  if (dev) logChange(`Device deleted: ${dev.name} (${dev.deviceType||'Misc.'})`);
  p.devices = p.devices.filter(d => d.id !== id);
  // Remove from port assignments, portPeerPort, and parentDeviceId on all other devices
  p.devices.forEach(d => {
    if (d.parentDeviceId === id) d.parentDeviceId = null;
    if (d.portAssignments) {
      Object.keys(d.portAssignments).forEach(k => {
        if (d.portAssignments[k] === id) {
          delete d.portAssignments[k];
          if (d.portPeerPort) delete d.portPeerPort[k]; // remove orphaned peer-port reference
        }
      });
    }
  });
  // Remove from photo slot assignments
  (p.photos||[]).forEach(ph => {
    if (!ph.assignments) return;
    ph.assignments.forEach((a, i) => {
      if (a?.itemId === `dev:${id}`) ph.assignments[i] = null;
    });
  });
  save(); if (typeof refreshView === 'function') refreshView(); else renderDevices(); toast('Device deleted');
}

// ─── DEVICE CLONING (Feature 3) ───
function cloneDevice(id) {
  const p = getProject();
  const orig = p.devices.find(d => d.id === id);
  if (!orig) return;
  const clone = JSON.parse(JSON.stringify(orig));
  clone.id = genId();
  clone.name = orig.name + ' (copy)';
  clone.rackId = null;
  clone.rackU = null;
  clone.serial = '';
  clone.ip = '';
  clone.mac = '';
  clone.addedDate = new Date().toISOString();
  // Clear port assignments on the clone
  clone.portAssignments = {};
  clone.portNotes = {};
  clone.portVlans = {};
  clone.portPeerPort = {};
  clone.portPoe = {};
  clone.portLabels = {};
  p.devices.push(clone);
  logChange(`Device cloned: ${orig.name} → ${clone.name}`);
  save();
  closeModal();
  editDevice(clone.id);
  toast('Device cloned — edit and save', 'success');
}

function bulkClone() {
  const p = getProject();
  const ids = [...state.selectedDeviceIds];
  if (ids.length === 0) return;
  ids.forEach(id => {
    const orig = p.devices.find(d => d.id === id);
    if (!orig) return;
    const clone = JSON.parse(JSON.stringify(orig));
    clone.id = genId();
    clone.name = orig.name + ' (copy)';
    clone.rackId = null;
    clone.rackU = null;
    clone.serial = '';
    clone.ip = '';
    clone.mac = '';
    clone.addedDate = new Date().toISOString();
    clone.portAssignments = {};
    clone.portNotes = {};
    clone.portVlans = {};
    clone.portPeerPort = {};
    clone.portPoe = {};
    clone.portLabels = {};
    p.devices.push(clone);
    logChange(`Device cloned: ${orig.name} → ${clone.name}`);
  });
  state.selectedDeviceIds = new Set();
  save();
  renderDevices();
  toast(`${ids.length} device${ids.length!==1?'s':''} cloned`, 'success');
}

