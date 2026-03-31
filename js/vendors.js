const VENDOR_TYPES = ['ISP','MSP','Carrier','Vendor','Other'];

let _returnToUnresolved = false;
let _pendingOUI = '';
let _unresolvedSort = { col: 'project', dir: 'asc' };

function editVendor(id) { openVendorModal(id); }

function addVendorFromUnresolved(mac, deviceId, projectId) {
  const oui = _extractOUI(mac);
  openModal(`
    <h3>Assign Manufacturer</h3>
    ${mac ? `<div style="font-size:11px;color:var(--accent);margin-bottom:10px;padding:6px 10px;background:rgba(0,200,255,.08);border:1px solid rgba(0,200,255,.2);border-radius:5px">MAC: <strong style="font-family:var(--mono)">${esc(mac)}</strong>${oui ? ` &nbsp;·&nbsp; OUI prefix: <strong style="font-family:var(--mono)">${esc(oui)}</strong> — all devices sharing this prefix will be auto-assigned` : ''}</div>` : ''}
    <div class="form-row"><label>Manufacturer Name</label>
      <input class="form-control" id="unres-mfr-name" placeholder="e.g. Cisco, Ubiquiti, Ruckus" autofocus></div>
    <input type="hidden" id="unres-mfr-mac" value="${esc(mac||'')}">
    <input type="hidden" id="unres-mfr-did" value="${esc(deviceId||'')}">
    <input type="hidden" id="unres-mfr-pid" value="${esc(projectId||'')}">
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal();showUnresolvedDevices()">Cancel</button>
      <button class="btn btn-primary" onclick="saveQuickManufacturer()">Save</button>
    </div>`, '400px');
  setTimeout(() => document.getElementById('unres-mfr-name')?.focus(), 50);
}

function saveQuickManufacturer() {
  const name = document.getElementById('unres-mfr-name')?.value?.trim();
  if (!name) return toast('Enter a manufacturer name', 'error');
  const mac = document.getElementById('unres-mfr-mac')?.value || '';
  const did = document.getElementById('unres-mfr-did')?.value || '';
  const pid = document.getElementById('unres-mfr-pid')?.value || '';
  const oui = _extractOUI(mac);

  // Add to globalVendors if not already there
  let vendor = state.globalVendors.find(v => v.name.toLowerCase() === name.toLowerCase());
  if (!vendor) {
    vendor = { id: genId(), name, type: 'Vendor', accountNum: '', circuitId: '', supportPhone: '', supportEmail: '', notes: '' };
    state.globalVendors.push(vendor);
    saveGlobalVendors();
  }

  // Assign to the clicked device directly
  if (did && pid) {
    const proj = state.projects.find(p => p.id === pid);
    if (proj) {
      const dev = proj.devices.find(d => d.id === did);
      if (dev) { dev.manufacturer = name; dev.vendorId = vendor.id; }
    }
  }

  // Auto-match all unresolved devices sharing the same OUI prefix
  if (oui) {
    _autoMatchByOUI(vendor.id, name, oui);
  }

  save();
  closeModal();
  showUnresolvedDevices();
  toast(`Manufacturer "${name}" assigned`, 'success');
}

function _extractOUI(mac) {
  if (!mac) return '';
  const clean = mac.replace(/[^a-fA-F0-9]/g, '').toLowerCase();
  if (clean.length < 6) return '';
  return clean.slice(0,2) + ':' + clean.slice(2,4) + ':' + clean.slice(4,6);
}

function _deviceMatchesOUI(deviceMac, oui) {
  if (!deviceMac || !oui) return false;
  return _extractOUI(deviceMac) === oui;
}

// Scans ALL devices with a manufacturer, builds OUI→manufacturer map,
// then auto-assigns any unresolved device sharing the same OUI prefix.
function _autoResolveByOUI() {
  // Build OUI map from devices that already have a manufacturer
  const ouiMap = {}; // oui → { manufacturer, vendorId }
  state.projects.forEach(p => {
    (p.devices || []).forEach(d => {
      if (_isDeviceMissingVendor(d)) return;
      const oui = _extractOUI(d.mac);
      if (!oui) return;
      if (!ouiMap[oui]) {
        const mfr = (d.manufacturer || '').trim();
        const vid = (d.vendorId || '').trim();
        if (mfr) ouiMap[oui] = { manufacturer: mfr, vendorId: vid };
      }
    });
  });

  // Assign unresolved devices that match a known OUI
  let matched = 0;
  state.projects.forEach(p => {
    (p.devices || []).forEach(d => {
      if (!_isDeviceMissingVendor(d)) return;
      const oui = _extractOUI(d.mac);
      if (!oui || !ouiMap[oui]) return;
      d.manufacturer = ouiMap[oui].manufacturer;
      if (ouiMap[oui].vendorId) d.vendorId = ouiMap[oui].vendorId;
      matched++;
    });
  });

  if (matched > 0) {
    save();
    toast(`Auto-resolved ${matched} device${matched !== 1 ? 's' : ''} by MAC prefix`, 'success');
  }
  return matched;
}

// A device is "missing vendor" if it has no manufacturer AND no vendorId linked
function _isDeviceMissingVendor(d) {
  // Check manufacturer field first — vendor and manufacturer are the same thing
  const mfr = (d.manufacturer || '').trim().toLowerCase().replace(/[\[\]]/g, '');
  const hasMfr = mfr && mfr !== 'n/s' && mfr !== 'n/a' && mfr !== 'na' && mfr !== 'none'
    && mfr !== 'unknown' && mfr !== '-' && mfr !== '—' && mfr !== 'n\\a' && mfr !== 'n\\s';
  if (hasMfr) return false;
  // Also check vendorId link
  const vid = (d.vendorId || '').trim();
  if (vid && state.globalVendors.find(v => v.id === vid)) return false;
  return true;
}

function openVendorModal(id) {
  const v = id ? state.globalVendors.find(x=>x.id===id) : null;
  const isNew = !v;
  openModal(`
    <h3>${isNew?'Add Manufacturer':'Edit Manufacturer'}</h3>
    <div class="form-row"><label>Manufacturer Name</label>
      <input class="form-control" id="v-name" value="${esc(v?.name||'')}" placeholder="e.g. Cisco, Ubiquiti, Ruckus" autofocus></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="_cancelVendorModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveVendor('${id||''}')">Save</button>
    </div>`, '400px');
  setTimeout(()=>{
    const el = document.getElementById('v-name');
    if (el) { el.focus(); el.select(); }
  }, 50);
}

function _cancelVendorModal() {
  const wasReturning = _returnToUnresolved;
  _returnToUnresolved = false;
  _pendingOUI = '';
  closeModal();
  if (wasReturning) showUnresolvedDevices();
}

function saveVendor(id) {
  const name = document.getElementById('v-name')?.value?.trim();
  if (!name) return toast('Manufacturer name is required','error');
  const data = { name };
  let newVendorId = id;
  if (id) {
    const idx = state.globalVendors.findIndex(v=>v.id===id);
    if (idx >= 0) Object.assign(state.globalVendors[idx], data);
  } else {
    newVendorId = genId();
    state.globalVendors.push({ id: newVendorId, ...data });
  }
  saveGlobalVendors();
  closeModal();

  if (_returnToUnresolved) {
    const oui = _pendingOUI;
    _returnToUnresolved = false;
    _pendingOUI = '';
    if (!id) {
      // Auto-match: set manufacturer + vendorId on matching devices
      if (oui) {
        _autoMatchByOUI(newVendorId, data.name, oui);
      } else {
        _autoMatchByName(newVendorId, data.name);
      }
    }
    showUnresolvedDevices();
  } else {
    if (typeof renderVendorPage === 'function' && document.getElementById('vendor-list-area')) renderVendorPage();
    if (typeof renderDashboard === 'function' && typeof getProject === 'function' && getProject()) renderDashboard();
  }
  toast(id ? 'Manufacturer updated' : 'Manufacturer added', 'success');
}

function _autoMatchByOUI(vendorId, vendorName, oui) {
  if (!oui) return;
  let matched = 0;
  state.projects.forEach(p => {
    (p.devices||[]).forEach(d => {
      if (!_isDeviceMissingVendor(d)) return;
      if (_deviceMatchesOUI(d.mac, oui)) {
        d.vendorId = vendorId;
        d.manufacturer = vendorName;
        matched++;
      }
    });
  });
  if (matched > 0) {
    save();
    toast(`Auto-assigned ${matched} device${matched!==1?'s':''} with MAC prefix ${oui}`, 'success');
  }
}

function _autoMatchByName(vendorId, vendorName) {
  if (!vendorName) return;
  const vLower = vendorName.toLowerCase().trim();
  let matched = 0;
  state.projects.forEach(p => {
    (p.devices||[]).forEach(d => {
      if (!_isDeviceMissingVendor(d)) return;
      const mfr = (d.manufacturer||'').toLowerCase().trim();
      if (mfr && (mfr.includes(vLower) || vLower.includes(mfr))) {
        d.vendorId = vendorId;
        matched++;
      }
    });
  });
  if (matched > 0) {
    save();
    toast(`Auto-assigned ${matched} device${matched!==1?'s':''} matching "${vendorName}"`, 'success');
  }
}

function deleteVendor(id) {
  if (!confirm('Delete this manufacturer?')) return;
  state.globalVendors = state.globalVendors.filter(x=>x.id!==id);
  state.projects.forEach(p => {
    (p.devices||[]).forEach(d => { if (d.vendorId === id) d.vendorId = ''; });
  });
  saveGlobalVendors();
  save();
  if (typeof renderVendorPage === 'function' && document.getElementById('vendor-list-area')) renderVendorPage();
  if (typeof renderDashboard === 'function' && typeof getProject === 'function' && getProject()) renderDashboard();
  toast('Manufacturer deleted');
}

// ═══════════════════════════════════════════
//  VENDOR PAGE — rendered on index.html
// ═══════════════════════════════════════════
function renderVendorPage() {
  const area = document.getElementById('vendor-list-area');
  if (!area) return;
  _autoResolveByOUI();
  const vendors = state.globalVendors || [];

  // Sort by name
  vendors.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));

  const usageCounts = {};
  const ouiPrefixes = {};
  vendors.forEach(v => { usageCounts[v.id] = 0; ouiPrefixes[v.id] = new Set(); });
  state.projects.forEach(p => {
    (p.devices||[]).forEach(d => {
      if (d.vendorId && usageCounts[d.vendorId] !== undefined) {
        usageCounts[d.vendorId]++;
        const oui = _extractOUI(d.mac);
        if (oui) ouiPrefixes[d.vendorId].add(oui);
      }
    });
  });

  let unresolvedCount = 0;
  state.projects.forEach(p => {
    (p.devices||[]).forEach(d => {
      if (_isDeviceMissingVendor(d)) unresolvedCount++;
    });
  });

  area.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
      <div style="display:flex;align-items:center;gap:12px">
        <button class="btn btn-ghost btn-sm" onclick="toggleVendorPage()" style="padding:4px 10px">← Projects</button>
        <div>
          <div style="font-size:16px;font-weight:700;color:var(--text)">Manufacturer List</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">Shared across all projects &nbsp;·&nbsp; ${vendors.length} manufacturer${vendors.length!==1?'s':''}</div>
        </div>
      </div>
      ${unresolvedCount > 0 ? `<button class="btn btn-ghost btn-sm" onclick="showUnresolvedDevices()" style="color:var(--amber);border-color:rgba(255,170,0,.4)">⚠ ${unresolvedCount} device${unresolvedCount!==1?'s':''} without manufacturer</button>` : ''}
    </div>
    ${vendors.length===0 ? `
      <div style="text-align:center;padding:40px 20px;color:var(--text3)">
        <div style="font-size:28px;margin-bottom:8px">📋</div>
        <div style="font-size:14px;font-weight:600;color:var(--text2);margin-bottom:4px">No manufacturers yet</div>
        <div style="font-size:12px">Manufacturers are added from the "devices without manufacturer" list based on MAC address OUI prefix.</div>
      </div>` : `
      <div style="overflow-x:auto">
        <table style="width:100%;font-size:12px;border-collapse:collapse">
          <thead><tr>
            <th style="text-align:left;padding:8px 10px;border-bottom:2px solid var(--border);font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:var(--text3)">Company</th>
            <th style="text-align:left;padding:8px 10px;border-bottom:2px solid var(--border);font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:var(--text3)">MAC Prefix</th>
            <th style="text-align:left;padding:8px 10px;border-bottom:2px solid var(--border);font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:var(--text3)">Used By</th>
            <th style="padding:8px 10px;border-bottom:2px solid var(--border);width:80px"></th>
          </tr></thead>
          <tbody>
            ${vendors.map(v=>{const ouis=[...ouiPrefixes[v.id]||[]].sort();return `<tr style="border-bottom:1px solid var(--border)">
              <td style="padding:8px 10px;font-weight:600">${esc(v.name||'')}</td>
              <td style="padding:8px 10px;font-family:var(--mono);font-size:11px;color:var(--accent)">${ouis.length?ouis.join(', '):'<span style="color:var(--text3)">—</span>'}</td>
              <td style="padding:8px 10px;font-size:11px;color:var(--text2)">${usageCounts[v.id]||0} device${(usageCounts[v.id]||0)!==1?'s':''}</td>
              <td style="padding:8px 10px">
                <div style="display:flex;gap:4px;justify-content:flex-end">
                  <button class="btn btn-ghost btn-sm btn-icon" onclick="editVendor('${v.id}')" title="Edit">✎</button>
                  <button class="btn btn-danger btn-sm btn-icon" onclick="deleteVendor('${v.id}')" title="Delete">✕</button>
                </div>
              </td>
            </tr>`;}).join('')}
          </tbody>
        </table>
      </div>`}`;
}

function _sortUnresolved(col) {
  if (_unresolvedSort.col === col) {
    _unresolvedSort.dir = _unresolvedSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    _unresolvedSort.col = col;
    _unresolvedSort.dir = 'asc';
  }
  showUnresolvedDevices();
}

function showUnresolvedDevices() {
  _autoResolveByOUI();
  const rows = [];
  state.projects.forEach(p => {
    (p.devices||[]).forEach(d => {
      if (_isDeviceMissingVendor(d)) {
        rows.push({ project: p.name, device: d.name, type: d.deviceType||'', ip: d.ip||'', mac: d.mac||'', manufacturer: d.manufacturer||'', id: d.id, pid: p.id });
      }
    });
  });
  if (rows.length === 0) {
    toast('All devices have manufacturers assigned', 'success');
    if (typeof renderVendorPage === 'function') renderVendorPage();
    return;
  }

  // Sort rows
  const col = _unresolvedSort.col;
  const dir = _unresolvedSort.dir === 'asc' ? 1 : -1;
  rows.sort((a, b) => {
    const av = (a[col] || '').toLowerCase();
    const bv = (b[col] || '').toLowerCase();
    return av < bv ? -dir : av > bv ? dir : 0;
  });

  const arrow = (c) => _unresolvedSort.col === c ? (_unresolvedSort.dir === 'asc' ? ' ▲' : ' ▼') : '';
  const thStyle = 'text-align:left;padding:6px 8px;border-bottom:2px solid var(--border);white-space:nowrap;cursor:pointer;user-select:none;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--text3)';

  const vendorOpts = state.globalVendors.map(v=>`<option value="${v.id}">${esc(v.name)} (${esc(v.type||'')})</option>`).join('');
  const hasVendors = state.globalVendors.length > 0;

  openModal(`
    <h3>⚠ ${rows.length} Device${rows.length!==1?'s':''} Without Manufacturer</h3>
    <div style="font-size:11px;color:var(--text3);margin-bottom:10px">Click <strong>+ Add</strong> on a row to create a vendor from that device's MAC prefix. All devices sharing that prefix get auto-assigned. Click column headers to sort.</div>
    ${hasVendors ? `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding:8px 10px;background:var(--panel);border:1px solid var(--border);border-radius:6px">
      <label style="font-size:11px;white-space:nowrap;color:var(--text2)">Bulk assign:</label>
      <select class="form-control" id="bulk-vendor-select" style="flex:1;font-size:12px"><option value="">— Choose Manufacturer —</option>${vendorOpts}</select>
      <button class="btn btn-primary btn-sm" onclick="bulkAssignVendor()">Assign All</button>
    </div>` : ''}
    <div style="max-height:420px;overflow:auto">
      <table style="width:100%;font-size:11px;border-collapse:collapse;min-width:700px">
        <thead><tr>
          <th style="${thStyle}" onclick="_sortUnresolved('project')">Project${arrow('project')}</th>
          <th style="${thStyle}" onclick="_sortUnresolved('device')">Device${arrow('device')}</th>
          <th style="${thStyle}" onclick="_sortUnresolved('type')">Type${arrow('type')}</th>
          <th style="${thStyle}" onclick="_sortUnresolved('mac')">MAC Address${arrow('mac')}</th>
          <th style="${thStyle}" onclick="_sortUnresolved('ip')">IP${arrow('ip')}</th>
          <th style="text-align:left;padding:6px 8px;border-bottom:2px solid var(--border);white-space:nowrap;min-width:120px;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--text3)">Assign Manufacturer</th>
          <th style="padding:6px 8px;border-bottom:2px solid var(--border);white-space:nowrap;width:70px"></th>
        </tr></thead>
        <tbody>
          ${rows.map(r => `<tr style="border-bottom:1px solid var(--border)">
            <td style="padding:6px 8px;color:var(--text2);white-space:nowrap">${esc(r.project)}</td>
            <td style="padding:6px 8px;font-weight:600;white-space:nowrap">${esc(r.device)}</td>
            <td style="padding:6px 8px;white-space:nowrap">${esc(r.type)}</td>
            <td style="padding:6px 8px;font-family:var(--mono);font-size:10px;white-space:nowrap">${r.mac ? esc(r.mac) : '<span style="color:var(--text3)">—</span>'}</td>
            <td style="padding:6px 8px;font-family:var(--mono);white-space:nowrap">${esc(r.ip||'—')}</td>
            <td style="padding:6px 8px">${hasVendors ? `<select class="form-control unres-vendor" data-pid="${r.pid}" data-did="${r.id}" style="font-size:11px;padding:3px 6px"><option value="">—</option>${vendorOpts}</select>` : '<span style="font-size:10px;color:var(--text3)">—</span>'}</td>
            <td style="padding:6px 8px;text-align:center"><button class="btn btn-primary btn-sm" onclick="addVendorFromUnresolved('${esc(r.mac)}','${r.id}','${r.pid}')" style="font-size:10px;white-space:nowrap;padding:3px 10px">+ Add</button></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal();if(typeof renderVendorPage==='function')renderVendorPage()">Close</button>
      ${hasVendors ? `<button class="btn btn-primary" onclick="saveUnresolvedVendors()">Save Assignments</button>` : ''}
    </div>`, '900px');
}

function bulkAssignVendor() {
  const vid = document.getElementById('bulk-vendor-select')?.value;
  if (!vid) return toast('Select a vendor first', 'error');
  document.querySelectorAll('.unres-vendor').forEach(sel => { sel.value = vid; });
}

function saveUnresolvedVendors() {
  let count = 0;
  const vendorName = {};
  state.globalVendors.forEach(v => { vendorName[v.id] = v.name; });
  const matchedOUIs = new Set();
  document.querySelectorAll('.unres-vendor').forEach(sel => {
    const vid = sel.value;
    if (!vid) return;
    const pid = sel.dataset.pid;
    const did = sel.dataset.did;
    const proj = state.projects.find(p => p.id === pid);
    if (!proj) return;
    const dev = proj.devices.find(d => d.id === did);
    if (!dev) return;
    dev.vendorId = vid;
    if (vendorName[vid]) dev.manufacturer = vendorName[vid];
    count++;
    // Track OUI for auto-matching other devices
    const oui = _extractOUI(dev.mac);
    if (oui && vendorName[vid]) {
      const key = oui + '|' + vid;
      if (!matchedOUIs.has(key)) {
        matchedOUIs.add(key);
        _autoMatchByOUI(vid, vendorName[vid], oui);
      }
    }
  });
  if (count > 0) save();
  closeModal();
  if (typeof renderVendorPage === 'function') renderVendorPage();
  toast(`${count} device${count!==1?'s':''} assigned to manufacturers`, 'success');
}

function toggleVendorPage() {
  const area = document.getElementById('vendor-list-area');
  const grid = document.getElementById('proj-grid');
  const actions = document.querySelector('.proj-actions');
  const backupStatus = document.getElementById('proj-backup-status');
  if (!area) return;
  const showing = area.style.display !== 'none';
  area.style.display = showing ? 'none' : 'block';
  if (grid) grid.style.display = showing ? '' : 'none';
  if (actions) actions.style.display = showing ? '' : 'none';
  if (backupStatus) backupStatus.style.display = showing ? '' : 'none';
  const btn = document.getElementById('vendor-toggle-btn');
  if (btn) btn.textContent = showing ? '📋 Manufacturers' : '← Back to Projects';
  if (!showing) renderVendorPage();
}
