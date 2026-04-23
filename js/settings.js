function renderSettings() {
  const p = getProject();
  setTopbarActions(`
    <button class="btn btn-ghost btn-sm" onclick="manageLocations()">📍 Locations</button>
    <button class="btn btn-ghost btn-sm" onclick="resetTypeColors()">↺ Reset Colors</button>
    <button class="btn btn-primary btn-sm" onclick="saveProjectDetails()">Save Details</button>`);
  document.getElementById('view-area').innerHTML = `
    <div class="settings-section">
      <h4>Project Details</h4>
      <p style="font-size:12px;color:var(--text2);margin-bottom:14px">Edit the project name and site information. This appears on the dashboard.</p>
      <div class="form-row-inline">
        <div class="form-row" style="flex:2"><label>Project Name *</label>
          <input class="form-control" id="set-projname" value="${esc(p.name)}"></div>
        <div class="form-row" style="flex:2"><label>Company / Organization</label>
          <input class="form-control" id="set-company" value="${esc(p.company||'')}"></div>
      </div>
      <div class="form-row"><label>Site Location</label>
        <input class="form-control" id="set-location" value="${esc(p.location||'')}" placeholder="Building, floor, address…"></div>
      <div class="form-row-inline">
        <div class="form-row"><label>Management Contact</label>
          <input class="form-control" id="set-contactmgmt" value="${esc(p.contactMgmt||'')}" placeholder="Name, phone, email…"></div>
        <div class="form-row"><label>IT Contact</label>
          <input class="form-control" id="set-contactit" value="${esc(p.contactIT||'')}" placeholder="Name, phone, email…"></div>
      </div>
    </div>
    <div class="settings-section">
      <h4>Device Type Colors</h4>
      <p style="font-size:12px;color:var(--text2);margin-bottom:14px">Customize the color used for each device type across all views.</p>
      <div class="color-grid">
        ${DEVICE_TYPES.map(t => {
          const c = dtColor(t);
          return `<div class="color-item">
            <span class="dt-dot" style="background:${c};width:14px;height:14px;flex-shrink:0" id="dot-${t.replace(/[^a-z0-9]/gi,'_')}"></span>
            <label for="color-${t.replace(/[^a-z0-9]/gi,'_')}">${esc(t)}</label>
            <input type="color" id="color-${t.replace(/[^a-z0-9]/gi,'_')}" value="${c}"
              oninput="updateTypeColor('${t}',this.value)">
          </div>`;
        }).join('')}
      </div>
    </div>
    <div class="settings-section">
      <h4>Rack-Mountable Types</h4>
      <p style="font-size:12px;color:var(--text2)">These device types appear in the Rack View device pool and can be placed in rack slots:</p>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">
        ${[...RACK_MOUNTABLE].map(t => `<span class="dt-badge" style="background:${dtColor(t)}22;border-color:${dtColor(t)}40;color:${dtColor(t)}"><span class="dt-dot" style="background:${dtColor(t)}"></span>${esc(t)}</span>`).join('')}
      </div>
    </div>
    <div class="settings-section">
      <h4>Port-Capable Types</h4>
      <p style="font-size:12px;color:var(--text2)">These device types support port configuration and appear in the Port Assignment view:</p>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">
        ${[...PORT_CAPABLE].map(t => `<span class="dt-badge" style="background:${dtColor(t)}22;border-color:${dtColor(t)}40;color:${dtColor(t)}"><span class="dt-dot" style="background:${dtColor(t)}"></span>${esc(t)}</span>`).join('')}
      </div>
    </div>
    </div>`;

}

function saveProjectDetails() {
  const p = getProject();
  const newName    = document.getElementById('set-projname')?.value?.trim();
  if (!newName) return toast('Project name is required', 'error');
  const newCompany = document.getElementById('set-company')?.value?.trim() || '';
  const newLoc     = document.getElementById('set-location')?.value?.trim() || '';
  const newMgmt    = document.getElementById('set-contactmgmt')?.value?.trim() || '';
  const newIT      = document.getElementById('set-contactit')?.value?.trim() || '';
  if (p.name !== newName)            logChange(`Project renamed: "${p.name}" → "${newName}"`);
  if ((p.company||'') !== newCompany) logChange(`Company changed: "${p.company||''}" → "${newCompany}"`);
  if ((p.location||'') !== newLoc)    logChange(`Location changed: "${p.location||''}" → "${newLoc}"`);
  if ((p.contactMgmt||'') !== newMgmt) logChange(`Management contact changed: "${p.contactMgmt||''}" → "${newMgmt}"`);
  if ((p.contactIT||'') !== newIT)    logChange(`IT contact changed: "${p.contactIT||''}" → "${newIT}"`);
  p.name = newName; p.company = newCompany; p.location = newLoc; p.contactMgmt = newMgmt; p.contactIT = newIT;
  save();
  document.querySelector('.sidebar-project').textContent = p.name;
  toast('Project details saved', 'success');
}

let _colorDebounce = null;
let _colorOldValue = {};
function updateTypeColor(typeName, color) {
  if (!state.typeColors) state.typeColors = {};
  if (!_colorOldValue[typeName]) _colorOldValue[typeName] = dtColor(typeName);
  state.typeColors[typeName] = color;
  const key = typeName.replace(/[^a-z0-9]/gi,'_');
  const dotEl = document.getElementById(`dot-${key}`);
  if (dotEl) dotEl.style.background = color;
  clearTimeout(_colorDebounce);
  _colorDebounce = setTimeout(() => {
    const oldColor = _colorOldValue[typeName] || color;
    if (oldColor !== color) logChange(`Device type color changed: ${typeName} — ${oldColor} → ${color}`);
    delete _colorOldValue[typeName];
    save();
  }, 400);
}

function resetTypeColors() {
  if (!confirm('Reset all device type colors to defaults?')) return;
  const changes = DEVICE_TYPES.filter(t => state.typeColors && state.typeColors[t])
    .map(t => `${t}: ${state.typeColors[t]} → ${DEFAULT_TYPE_COLORS[t]||'#778899'}`).join('; ');
  state.typeColors = {};
  if (changes) logChange(`Device type colors reset to defaults — ${changes}`);
  else logChange(`Device type colors reset to defaults (no custom colors were set)`);
  save();
  renderSettings();
  toast('Colors reset to defaults', 'success');
}
// exportData, importData, handleImport are now in core.js (needed from sidebar on every page)

