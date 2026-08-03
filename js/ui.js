// ═══════════════════════════════════════════
//  UI — shell (bottom nav, sheets, FAB),
//  home, projects, settings
// ═══════════════════════════════════════════

const VIEWS = {
  home:      { title: 'Home',        render: () => renderHome() },
  devices:   { title: 'Devices',     render: () => renderDevices() },
  racks:     { title: 'Racks',       render: () => { renderRacks(); checkFocusRack(); } },
  ports:     { title: 'Ports',       render: () => renderPorts() },
  photos:    { title: 'Photos',      render: () => renderPhotos() },
  cableruns: { title: 'Cable Runs',  render: () => renderCableRuns() },
  settings:  { title: 'Settings',    render: () => renderSettings() }
};
const NAV_TABS = [
  { v: 'home',      ico: '⌂',  lbl: 'Home' },
  { v: 'devices',   ico: '◈',  lbl: 'Devices' },
  { v: 'racks',     ico: '▤',  lbl: 'Racks' },
  { v: 'ports',     ico: '⊡',  lbl: 'Ports' },
  { v: 'cableruns', ico: '⇄',  lbl: 'Cables' },
  { v: 'photos',    ico: CAM_SVG, lbl: 'Photos' }
];

function setView(v) {
  if (!VIEWS[v]) return;
  if (window.location.hash.replace('#', '') !== v) {
    history.pushState({ view: v }, '', '#' + v);
  }
  _renderView(v);
}

function _renderView(v) {
  closeModal();
  if (typeof closePhotoViewer === 'function') closePhotoViewer();
  if (typeof _dndAbort === 'function') _dndAbort();
  state.currentView = v;

  const title = document.getElementById('view-title');
  if (title) title.textContent = VIEWS[v].title;

  document.querySelectorAll('.bn-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === v);
  });

  setFab('');
  const dock = document.getElementById('pool-dock');
  if (dock) dock.style.display = 'none';

  const va = document.getElementById('view-area');
  if (va) {
    va.scrollTop = 0;
    va.classList.remove('view-enter');
    void va.offsetWidth;
    va.classList.add('view-enter');
  }

  VIEWS[v].render();
}

function refreshView() {
  if (VIEWS[state.currentView]) _renderView(state.currentView);
}

// FAB (floating action button) — one per view, set by each renderer
function setFab(html) {
  const c = document.getElementById('fab-container');
  if (c) { c.innerHTML = html || ''; c.classList.remove('raised'); }
}

function buildBottomNav(activeView) {
  return NAV_TABS.map(t => `
    <div class="bn-item ${activeView === t.v ? 'active' : ''}" data-view="${t.v}" onclick="setView('${t.v}')">
      <span class="bn-ico">${t.ico}</span><span class="bn-lbl">${t.lbl}</span>
    </div>`).join('');
}

// ⋮ app menu (bottom sheet)
function openAppMenu() {
  const p = getProject();
  openModal(`
    <div style="display:flex;align-items:center;gap:12px;padding:2px 4px 12px">
      <img src="${LOGO_URI}" style="width:42px;height:42px;border-radius:50%;object-fit:cover" alt="">
      <div style="min-width:0">
        <div style="font-weight:800;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p?.name || '')}</div>
        <div style="font-size:11px;color:var(--text3);font-family:var(--mono)">Van Nice Site Manager</div>
      </div>
    </div>
    <div class="sheet-sep"></div>
    <div class="sheet-item" onclick="closeModal();setView('settings')"><span class="si-ico">⚙</span> Settings</div>
    <div class="sheet-sep"></div>
    <div class="sheet-item" onclick="closeModal();generateSiteReport()"><span class="si-ico">🖨</span><div>Site report (PDF)<div class="si-sub">Pick sections — racks, panels, port lists, photos</div></div></div>
    <div class="sheet-sep"></div>
    <div class="sheet-item" onclick="closeModal();globalSave()"><span class="si-ico">💾</span><div>Export project file<div class="si-sub">Download ZIP with all photos</div></div></div>
    <div class="sheet-item" onclick="closeModal();gdriveSave()"><span class="si-ico" style="color:#4285f4">☁</span><div>Save to Google Drive</div></div>
    <div class="sheet-item" onclick="closeModal();gdriveLoad()"><span class="si-ico" style="color:#4285f4">☁</span><div>Load from Google Drive</div></div>
    <div class="sheet-item" onclick="closeModal();importData()"><span class="si-ico">⇩</span><div>Import project file</div></div>
    <div class="sheet-sep"></div>
    <div class="sheet-item" onclick="openTrashSheet()"><span class="si-ico">🗑</span><div>Trash${(p?.photoTrash?.length || 0) + (p?.deviceTrash?.length || 0) ? ` (${(p.photoTrash?.length || 0) + (p.deviceTrash?.length || 0)})` : ''}<div class="si-sub">Deleted photos &amp; devices — kept 30 days</div></div></div>
    <div class="sheet-item" onclick="closeModal();backToProjects()"><span class="si-ico">🗂</span> Switch Project</div>
  `);
}

// ═══════════════════════════════════════════
//  TRASH — deleted photos & devices, 30 days
// ═══════════════════════════════════════════
function openTrashSheet() {
  const p = getProject();
  if (!p) return;
  const pt = p.photoTrash || [], dt = p.deviceTrash || [];
  const daysLeft = iso => Math.max(0, 30 - Math.floor((Date.now() - new Date(iso || 0).getTime()) / 86400000));
  openModal(`
    <h3>🗑 Trash</h3>
    <p style="font-size:12px;color:var(--text3);margin-bottom:12px">Deleted items are kept 30 days, then removed for good.</p>
    ${dt.length ? `<div class="pcg-label">◈ Devices (${dt.length})</div>` + dt.map((d, i) => `
      <div class="sheet-item" style="cursor:default">
        <span class="si-ico" style="color:${dtColor(d.deviceType || 'Misc.')}">●</span>
        <div style="flex:1;min-width:0">${esc(d.name)}<div class="si-sub">${esc(d.deviceType || '')}${d.ip ? ' · ' + esc(d.ip) : ''} · ${daysLeft(d.deletedAt)}d left</div></div>
        <button class="btn btn-ghost btn-sm" style="flex:0 0 auto" onclick="restoreTrashedDevice(${i})">↩ Restore</button>
      </div>`).join('') : ''}
    ${pt.length ? `<div class="pcg-label">${CAM_SVG} Photos (${pt.length}) — tap to restore</div>
      <div class="trash-grid">${pt.map((ph, i) => `
        <div class="trash-ph" style="background-image:url('${ph.thumb || ''}')" onclick="restoreTrashedPhoto(${i})" title="${esc(ph.caption || ph.name || '')}"><span>↩</span></div>`).join('')}</div>` : ''}
    ${!dt.length && !pt.length ? `<div class="empty-state" style="padding:26px 0"><div class="empty-icon">🗑</div><p>Trash is empty</p></div>` : ''}
    <div class="modal-actions">
      ${dt.length || pt.length ? `<button class="btn btn-danger" style="margin-right:auto;flex:0 0 auto;min-width:0" onclick="emptyTrash()">Empty Trash</button>` : ''}
      <button class="btn btn-primary" onclick="closeModal()">Done</button>
    </div>`);
}

function restoreTrashedPhoto(i) {
  const p = getProject();
  const ph = (p.photoTrash || [])[i];
  if (!ph) return;
  p.photoTrash.splice(i, 1);
  const { deletedAt, ...rest } = ph;
  p.photos.unshift(rest);
  logChange(`Photo restored from Trash: "${rest.caption || rest.name || ''}"`);
  save();
  if (state.currentView === 'photos') renderPhotos();
  toast('Photo restored', 'success');
  openTrashSheet();
}

function restoreTrashedDevice(i) {
  const p = getProject();
  const d = (p.deviceTrash || [])[i];
  if (!d) return;
  p.deviceTrash.splice(i, 1);
  const { deletedAt, ...rest } = d;
  // Its rack slot may have been reused while it sat in the Trash
  if (rest.rackId && rest.rackU) {
    const span = rest.deviceUHeight || 1;
    const clash = p.devices.some(x => x.rackId === rest.rackId &&
      (x.rackU || 0) < rest.rackU + span && rest.rackU < (x.rackU || 0) + (x.deviceUHeight || 1));
    if (clash) { rest.rackId = null; rest.rackU = null; toast('Rack slot was taken — restored to Unassigned', 'warning'); }
  }
  p.devices.push(migrateDevice(rest));
  logChange(`Device restored from Trash: ${rest.name}`);
  save(); refreshView();
  toast(`${rest.name} restored`, 'success');
  openTrashSheet();
}

function emptyTrash() {
  const p = getProject();
  const n = (p.photoTrash || []).length + (p.deviceTrash || []).length;
  if (!n) return;
  if (!confirm(`Permanently delete ${n} item${n !== 1 ? 's' : ''}? This cannot be undone.`)) return;
  (p.photoTrash || []).forEach(ph => { if (ph.id) _idbDeletePhotoData(ph.id).catch(() => {}); });
  p.photoTrash = [];
  p.deviceTrash = [];
  logChange('Trash emptied');
  save();
  toast('Trash emptied');
  openTrashSheet();
}

// ═══════════════════════════════════════════
//  SCREEN SWITCHING (projects picker ⇄ app)
// ═══════════════════════════════════════════
function _showProjectsScreen() {
  state.currentProjectId = null;
  sessionStorage.removeItem('netrack_current_project');
  localStorage.removeItem('netrack_current_project');
  closeModal();
  document.getElementById('screen-app').style.display = 'none';
  document.getElementById('screen-projects').style.display = 'flex';
  renderProjects();
  updateBackupStatusBadge();
}

function _showAppScreen(view) {
  document.getElementById('screen-projects').style.display = 'none';
  document.getElementById('screen-app').style.display = 'flex';
  const nav = document.getElementById('bottom-nav');
  if (nav) nav.innerHTML = buildBottomNav(view);
  setView(view);
}

function backToProjects() {
  history.pushState({}, '', '#projects');
  _showProjectsScreen();
}

function openProject(id) {
  state.currentProjectId = id;
  sessionStorage.setItem('netrack_current_project', id);
  _showAppScreen('home');
}

// App boot — called once from index.html
async function initApp() {
  await load();
  purgeExpiredProjectTrash().catch(() => {});
  const logo = document.getElementById('proj-logo-img');
  if (logo) logo.src = LOGO_URI;

  const photoUpload = document.getElementById('photo-upload');
  const photoCapture = document.getElementById('photo-capture');
  if (photoUpload) photoUpload.addEventListener('change', uploadPhotos);
  if (photoCapture) photoCapture.addEventListener('change', uploadPhotos);
  // Picker dismissed with no photo → forget any pending device auto-tag
  if (photoUpload) photoUpload.addEventListener('cancel', () => { _pendingPhotoDevId = null; });
  if (photoCapture) photoCapture.addEventListener('cancel', () => { _pendingPhotoDevId = null; });

  window.addEventListener('popstate', () => {
    // Android back gesture: close any open sheet / photo viewer first, stay on the view
    const ov = document.getElementById('modal-overlay');
    const restore = () => {
      if (state.currentProjectId && VIEWS[state.currentView]) {
        history.pushState({ view: state.currentView }, '', '#' + state.currentView);
      }
    };
    if (ov && ov.classList.contains('open')) { closeModal(); restore(); return; }
    if (document.getElementById('photo-viewer-overlay')) { closePhotoViewer(); restore(); return; }
    if (document.getElementById('sm-studio')) { closeMapStudio(); restore(); return; }
    if (document.getElementById('search-overlay')) { closeSearch(); restore(); return; }
    const h = window.location.hash.replace('#', '');
    if (h && VIEWS[h] && state.currentProjectId) _renderView(h);
    else _showProjectsScreen();
  });

  // Android hardware back: close sheet → close viewer → go Home → minimize app
  if (window.Capacitor?.Plugins?.App) {
    window.Capacitor.Plugins.App.addListener('backButton', () => {
      const ov = document.getElementById('modal-overlay');
      if (ov && ov.classList.contains('open')) { closeModal(); return; }
      if (document.getElementById('photo-viewer-overlay')) { closePhotoViewer(); return; }
      if (document.getElementById('sm-studio')) { closeMapStudio(); if (state.currentView === 'photos') renderPhotos(); return; }
      if (document.getElementById('search-overlay')) { closeSearch(); return; }
      if (typeof _dnd !== 'undefined' && _dnd) { _dndAbort(); return; }
      if (state.currentProjectId && state.currentView !== 'home') { setView('home'); return; }
      if (state.currentProjectId) { backToProjects(); return; }
      try { window.Capacitor.Plugins.App.minimizeApp(); } catch(e) {}
    });
  }

  // sessionStorage only: it survives in-page reloads but not an app exit, so
  // every fresh launch starts on the project picker.
  const savedProject = sessionStorage.getItem('netrack_current_project');
  const hashView = window.location.hash.replace('#', '');
  if (savedProject && state.projects.find(p => p.id === savedProject)) {
    state.currentProjectId = savedProject;
    _showAppScreen(VIEWS[hashView] ? hashView : 'home');
  } else {
    _showProjectsScreen();
  }
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ═══════════════════════════════════════════
//  PROJECTS SCREEN
// ═══════════════════════════════════════════
function renderProjects() {
  const g = document.getElementById('proj-grid');
  g.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'proj-inner-grid';
  state.projects.forEach(p => {
    const devCount = p.devices.length;
    const rackCount = p.racks.length;
    const photoCount = (p.photos||[]).length;
    const div = document.createElement('div');
    div.className = 'proj-card';
    div.innerHTML = `
      <button class="pdel" title="Delete project" onclick="deleteProject('${p.id}', event)">✕</button>
      <div class="pname">${esc(p.name)}</div>
      <div class="pmeta"><span>${devCount}</span> devices · <span>${rackCount}</span> racks · <span>${photoCount}</span> photos</div>
      <div class="pmeta" style="margin-top:4px;color:var(--text3)">${p.created || ''}</div>
    `;
    div.addEventListener('click', () => openProject(p.id));
    grid.appendChild(div);
  });
  const np = document.createElement('div');
  np.className = 'proj-new';
  np.innerHTML = `<span style="font-size:22px;color:var(--accent)">+</span> New Project`;
  np.onclick = () => newProject();
  grid.appendChild(np);
  g.appendChild(grid);
  _updateProjectTrashBtn();
}

function newProject() {
  openModal(`
    <h3>New Project</h3>
    <div class="form-row"><label>Project Name</label>
      <input class="form-control" id="pn-name" placeholder="e.g. Office Network 2026" autofocus></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="createProject()">Create</button>
    </div>
  `);
  setTimeout(() => document.getElementById('pn-name')?.focus(), 50);
}

async function createProject() {
  const name = document.getElementById('pn-name')?.value?.trim();
  if (!name) return toast('Enter a project name', 'error');
  const p = migrateProject({
    id: genId(), name,
    created: new Date().toLocaleDateString(),
    changelog: [{ ts: new Date().toISOString(), msg: `Project created: "${name}"` }]
  });
  state.projects.push(p);
  await _idbSaveProject(p);
  save();
  closeModal();
  openProject(p.id);
}

function deleteProject(id, e) {
  e.stopPropagation();
  const p = state.projects.find(x => x.id === id);
  if (!p) return;
  const d = (p.devices || []).length, r = (p.racks || []).length, ph = (p.photos || []).length;
  openModal(`
    <h3>🗑 Delete Project</h3>
    <p style="margin-bottom:16px;color:var(--text2)"><strong style="color:#fff">${esc(p.name)}</strong> — ${d} device${d!==1?'s':''}, ${r} rack${r!==1?'s':''}, ${ph} photo${ph!==1?'s':''} — moves to Trash and stays fully restorable for <strong style="color:#fff">30 days</strong>. Photos are kept too.</p>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-danger" onclick="confirmDeleteProject('${id}')">Move to Trash</button>
    </div>`);
}

async function confirmDeleteProject(id) {
  const p = state.projects.find(x => x.id === id);
  if (!p) return;
  await trashProject(p);   // keeps a full copy + its photo blobs for 30 days
  state.projects = state.projects.filter(x => x.id !== id);
  _idbDeleteProject(id).catch(() => {});
  if (state.currentProjectId === id) state.currentProjectId = null;
  save();
  closeModal();
  renderProjects();
  toast(`"${p.name}" moved to Trash`, 'success');
}

// ═══════════════════════════════════════════
//  DELETED PROJECTS (projects screen → 🗑)
// ═══════════════════════════════════════════
async function _updateProjectTrashBtn() {
  const btn = document.getElementById('proj-trash-btn');
  if (!btn) return;
  const list = await _loadProjectTrash();
  btn.style.display = list.length ? '' : 'none';
  btn.textContent = `🗑 Trash (${list.length})`;
}

async function openProjectTrashSheet() {
  const list = await _loadProjectTrash();
  const daysLeft = iso => Math.max(0, TRASH_DAYS - Math.floor((Date.now() - new Date(iso || 0).getTime()) / 86400000));
  openModal(`
    <h3>🗑 Deleted Projects</h3>
    <p style="font-size:12px;color:var(--text3);margin-bottom:12px">Restored projects come back whole — devices, racks, ports, maps and photos.</p>
    ${list.length ? list.map(t => `
      <div class="sheet-item" style="cursor:default">
        <span class="si-ico">🗂</span>
        <div style="flex:1;min-width:0">${esc(t.name)}
          <div class="si-sub">${t.counts?.devices || 0} devices · ${t.counts?.racks || 0} racks · ${t.counts?.photos || 0} photos · ${daysLeft(t.deletedAt)}d left</div>
        </div>
        <button class="btn btn-ghost btn-sm" style="flex:0 0 auto" onclick="restoreTrashedProject('${t.id}')">↩ Restore</button>
        <button class="btn btn-danger btn-sm btn-icon" style="flex:0 0 auto" title="Delete forever" onclick="purgeTrashedProjectPrompt('${t.id}')">✕</button>
      </div>`).join('')
    : `<div class="empty-state" style="padding:26px 0"><div class="empty-icon">🗑</div><p>No deleted projects</p></div>`}
    <div class="modal-actions">
      <button class="btn btn-primary" onclick="closeModal()">Done</button>
    </div>`);
}

async function restoreTrashedProject(id) {
  const list = await _loadProjectTrash();
  const entry = list.find(t => t.id === id);
  if (!entry) return;
  if (state.projects.some(x => x.id === id)) {
    toast(`"${entry.name}" is already in your list`, 'warning');
    return;
  }
  let p;
  try { p = migrateProject(JSON.parse(entry.data)); }
  catch (err) { return toast('Could not read the saved copy', 'error'); }
  state.projects.push(p);
  await _idbSaveProject(p);
  await _saveProjectTrash(list.filter(t => t.id !== id));
  save();
  closeModal();
  renderProjects();
  logChange(`Project restored from Trash: ${p.name}`);
  toast(`"${p.name}" restored`, 'success');
}

async function purgeTrashedProjectPrompt(id) {
  const list = await _loadProjectTrash();
  const entry = list.find(t => t.id === id);
  if (!entry) return;
  openModal(`
    <h3 style="color:var(--red)">⚠ Delete Forever</h3>
    <p style="margin-bottom:16px;color:var(--text2)">This erases <strong style="color:#fff">${esc(entry.name)}</strong> and all of its photos from this phone for good. Only a Google Drive copy could bring it back.</p>
    <p style="margin-bottom:12px;color:var(--text2)">Type the project name to confirm:</p>
    <div class="form-row"><input class="form-control" id="pdel-confirm" placeholder="${esc(entry.name)}"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="openProjectTrashSheet()">Cancel</button>
      <button class="btn btn-danger" onclick="purgeTrashedProjectConfirm('${id}')">Delete Permanently</button>
    </div>`);
  setTimeout(() => document.getElementById('pdel-confirm')?.focus(), 50);
}

async function purgeTrashedProjectConfirm(id) {
  const list = await _loadProjectTrash();
  const entry = list.find(t => t.id === id);
  if (!entry) { closeModal(); return; }
  const typed = document.getElementById('pdel-confirm')?.value?.trim();
  if (typed !== entry.name) return toast('Project name does not match', 'error');
  await purgeTrashedProject(id);
  renderProjects();
  toast('Project permanently deleted');
  openProjectTrashSheet();
}

// Backup settings sheet (from the projects screen)
function openBackupSettings() {
  const cfg = loadBackupConfig();
  openModal(`
    <h3>⚙ Backup Settings</h3>
    <p style="color:var(--text2);font-size:13px;margin-bottom:16px">Every change auto-saves on this device. Pick a local folder to also write one <code>.json</code> file per project (overwritten on each save). Chrome/Edge only.</p>
    <div class="settings-section">
      <h4>Backup Folder</h4>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <span style="font-size:22px">📂</span>
        <div id="gs-fsa-folder-name" style="font-size:14px;font-weight:600;font-family:var(--mono);color:${cfg.fsaDirName?'var(--accent)':'var(--text3)'}">${esc(cfg.fsaDirName) || 'No folder chosen yet'}</div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="fsaPickFolder()">📁 ${cfg.fsaDirName?'Change Folder':'Choose Backup Folder'}</button>
    </div>
    <div class="settings-section">
      <h4>Manual Backup</h4>
      <button class="btn btn-ghost btn-sm" onclick="gsBackupAllNow()">💾 Backup All Projects Now</button>
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary" onclick="closeModal()">Done</button>
    </div>`);
}

// ═══════════════════════════════════════════
//  HOME
// ═══════════════════════════════════════════
function renderHome() {
  setTopbarActions('');
  const p = getProject();
  const totalPorts = p.devices.reduce((a, s) => a + (parseInt(s.ports) || 0), 0);
  const assignedPorts = p.devices.reduce((a, s) => a + Object.keys(s.portAssignments || {}).length, 0);
  const notes = p.siteNotes || [];

  document.getElementById('view-area').innerHTML = `
    <div class="home-hero">
      <h1>${esc(p.name)}</h1>
      <div class="hh-sub">${[p.company, p.location].filter(Boolean).map(esc).join(' · ') || 'Van Nice Guys, LLC'}</div>
    </div>

    <div class="quick-grid">
      <div class="quick-btn" onclick="document.getElementById('photo-capture').click()">
        <span class="qb-ico">${CAM_SVG}</span><span class="qb-lbl">Take Photo</span>
      </div>
      <div class="quick-btn" onclick="addDevice()">
        <span class="qb-ico">◈</span><span class="qb-lbl">Add Device</span>
      </div>
      <div class="quick-btn" onclick="addPatchPanel()">
        <span class="qb-ico">⊟</span><span class="qb-lbl">Patch Panel</span>
      </div>
      <div class="quick-btn" onclick="addCableRun()">
        <span class="qb-ico">⇄</span><span class="qb-lbl">Cable Run</span>
      </div>
    </div>

    <div class="stat-chips">
      <div class="stat-chip" onclick="setView('devices')"><div class="sv accent">${p.devices.length}</div><div class="sl">Devices</div></div>
      <div class="stat-chip" onclick="setView('racks')"><div class="sv green">${p.racks.length}</div><div class="sl">Racks</div></div>
      <div class="stat-chip" onclick="setView('ports')"><div class="sv">${totalPorts > 0 ? assignedPorts+'/'+totalPorts : '—'}</div><div class="sl">Ports</div></div>
      <div class="stat-chip" onclick="setView('photos')"><div class="sv amber">${(p.photos||[]).length}</div><div class="sl">Photos</div></div>
      <div class="stat-chip" onclick="setView('cableruns')"><div class="sv">${(p.cableRuns||[]).length}</div><div class="sl">Cables</div></div>
    </div>

    ${(p.changelog||[]).length ? `
    <div class="section-hdr">
      <span class="sh-title">⏱ Recent Changes</span>
      <button class="btn btn-ghost btn-sm" onclick="openChangelogSheet()">View all (${p.changelog.length}) →</button>
    </div>
    <div class="cl-card">
      ${p.changelog.slice(0, 5).map(c => `
        <div class="cl-row">
          <span class="cl-ts">${fmtTs(c.ts)}</span>
          <span class="cl-msg">${esc(c.msg)}</span>
        </div>`).join('')}
    </div>` : ''}

    <div class="section-hdr">
      <span class="sh-title">📝 Site Notes</span>
      <span style="font-size:11px;color:var(--text3);font-family:var(--mono)">${notes.length} note${notes.length!==1?'s':''}</span>
    </div>
    <div class="note-add">
      <textarea id="note-input" placeholder="Add a site note…"></textarea>
      <button class="btn btn-primary" style="align-self:flex-end" onclick="addNote()">Add</button>
    </div>
    ${notes.length === 0
      ? `<div style="color:var(--text3);font-size:13px;text-align:center;padding:14px 0">No notes yet.</div>`
      : notes.map(n => `
        <div class="note-card">
          <div class="nc-ts">${fmtTs(n.ts)}</div>
          <div class="nc-text">${esc(n.text)}</div>
          <button class="nc-del" onclick="deleteNote('${n.id}')" title="Delete note">✕</button>
        </div>`).join('')}
  `;
}

// ═══════════════════════════════════════════
//  CHANGELOG VIEWER — everything logChange()
//  has recorded, filterable, newest first
// ═══════════════════════════════════════════
let _clFilter = '';
let _clShown = 150;

function openChangelogSheet() {
  _clFilter = '';
  _clShown = 150;
  openModal(`
    <h3>⏱ Change History</h3>
    <input class="form-control" id="cl-filter" placeholder="Filter — device name, IP, “deleted”…"
      oninput="_clFilter=this.value;_clShown=150;_clRenderList()" autocomplete="off" style="margin-bottom:10px">
    <div id="cl-list" style="max-height:56vh;overflow-y:auto"></div>
    <div class="modal-actions">
      <button class="btn btn-primary" onclick="closeModal()">Done</button>
    </div>`);
  _clRenderList();
}

function _clRenderList() {
  const el = document.getElementById('cl-list');
  if (!el) return;
  const all = getProject().changelog || [];
  const q = _clFilter.trim().toLowerCase();
  const hits = q ? all.filter(c => (c.msg || '').toLowerCase().includes(q)) : all;
  const shown = hits.slice(0, _clShown);
  // Day separators make a long history scannable
  let lastDay = '';
  const rows = shown.map(c => {
    const day = new Date(c.ts).toLocaleDateString();
    const sep = day !== lastDay ? `<div class="cl-day">${esc(day)}</div>` : '';
    lastDay = day;
    const time = new Date(c.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${sep}<div class="cl-row"><span class="cl-ts">${esc(time)}</span><span class="cl-msg">${esc(c.msg)}</span></div>`;
  }).join('');
  const p = getProject();
  el.innerHTML = (rows || `<div style="color:var(--text3);font-size:13px;padding:20px 0;text-align:center">No entries${q ? ' match “' + esc(_clFilter) + '”' : ''}.</div>`)
    + (hits.length > _clShown
      ? `<button class="btn btn-ghost btn-sm" style="width:100%;margin-top:8px" onclick="_clShown+=300;_clRenderList()">Show ${Math.min(300, hits.length - _clShown)} more (${hits.length - _clShown} left)</button>`
      : (!q ? `<div class="cl-day" style="text-align:center;padding:12px 0 4px">— project created ${esc(p.created || '(date unknown)')} —</div>` : ''));
}

function addNote() {
  const ta = document.getElementById('note-input');
  const text = ta?.value?.trim();
  if (!text) return;
  const p = getProject();
  if (!p.siteNotes) p.siteNotes = [];
  p.siteNotes.unshift({ id: genId(), ts: new Date().toISOString(), text });
  logChange(`Site note added: "${text}"`);
  save();
  renderHome();
  toast('Note added', 'success');
}

function deleteNote(noteId) {
  openModal(`
    <h3>Delete Note?</h3>
    <p style="color:var(--text2);margin-bottom:16px">This permanently removes this note.</p>
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
  renderHome();
}

// ═══════════════════════════════════════════
//  SETTINGS
// ═══════════════════════════════════════════
function renderSettings() {
  const p = getProject();
  const cfg = loadBackupConfig();
  setTopbarActions(`<button class="btn btn-primary btn-sm" onclick="saveProjectDetails()">Save</button>`);
  document.getElementById('view-area').innerHTML = `
    <div class="settings-section">
      <h4>Project Details</h4>
      <div class="form-row"><label>Project Name *</label>
        <input class="form-control" id="set-projname" value="${esc(p.name)}"></div>
      <div class="form-row"><label>Company / Organization</label>
        <input class="form-control" id="set-company" value="${esc(p.company||'')}"></div>
      <div class="form-row"><label>Site Location</label>
        <input class="form-control" id="set-location" value="${esc(p.location||'')}" placeholder="Building, floor, address…"></div>
      <div class="form-row"><label>Management Contact</label>
        <input class="form-control" id="set-contactmgmt" value="${esc(p.contactMgmt||'')}" placeholder="Name, phone, email…"></div>
      <div class="form-row"><label>IT Contact</label>
        <input class="form-control" id="set-contactit" value="${esc(p.contactIT||'')}" placeholder="Name, phone, email…"></div>
    </div>
    <div class="settings-section">
      <h4>Local Backup</h4>
      <p style="font-size:12.5px;color:var(--text2);margin-bottom:10px">Auto-saves each project as <code>ProjectName.json</code> in your chosen folder ~1.5s after any change. Chrome/Edge on desktop.</p>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span id="gs-fsa-folder-name" style="font-size:13px;font-weight:600;font-family:var(--mono);color:${cfg.fsaDirName?'var(--accent)':'var(--text3)'}">${esc(cfg.fsaDirName) || 'No folder chosen'}</span>
        <button class="btn btn-ghost btn-sm" onclick="fsaPickFolder()">📁 ${cfg.fsaDirName?'Change':'Choose'} Folder</button>
        <button class="btn btn-ghost btn-sm" onclick="gsBackupAllNow()">💾 Backup All Now</button>
        <button class="btn btn-ghost btn-sm" onclick="exportData()">⇩ Export ZIP</button>
      </div>
    </div>
    <div class="settings-section">
      <h4>Safety Snapshots</h4>
      <p style="font-size:12.5px;color:var(--text2);margin-bottom:10px">Taken automatically before every Drive save/load and import. Restoring rolls this project back (the current state is snapshotted first, so it's reversible).</p>
      <div id="snap-list" style="font-size:13px;color:var(--text3)">Loading…</div>
    </div>
    <div class="settings-section">
      <h4>Device Type Colors <button class="btn btn-ghost btn-sm" style="float:right;margin-top:-6px" onclick="resetTypeColors()">↺ Reset</button></h4>
      <div class="color-grid">
        ${DEVICE_TYPES.map(t => {
          const c = dtColor(t);
          return `<div class="color-item">
            <span class="dt-dot" style="background:${c};width:14px;height:14px" id="dot-${t.replace(/[^a-z0-9]/gi,'_')}"></span>
            <label for="color-${t.replace(/[^a-z0-9]/gi,'_')}">${esc(t)}</label>
            <input type="color" id="color-${t.replace(/[^a-z0-9]/gi,'_')}" value="${c}"
              oninput="updateTypeColor('${t}',this.value)">
          </div>`;
        }).join('')}
      </div>
    </div>`;
  _fillSnapshotList(p.id);
}

async function _fillSnapshotList(projId) {
  const el = document.getElementById('snap-list');
  if (!el) return;
  let list = [];
  try { list = (await _idbGetConfig('snapshots_' + projId)) || []; } catch (e) {}
  el.innerHTML = list.length === 0
    ? 'No snapshots yet — one is taken before every Drive sync or import.'
    : list.map((s, i) => `
      <div class="sheet-item" style="cursor:default;padding:10px 2px">
        <span class="si-ico">🕐</span>
        <div style="flex:1;min-width:0;color:var(--text)">${fmtTs(s.ts)}<div class="si-sub">${esc(s.reason || '')} · ${Math.round((s.data || '').length / 1024)} KB</div></div>
        <button class="btn btn-ghost btn-sm" style="flex:0 0 auto" onclick="restoreSnapshot(${i})">↩ Restore</button>
      </div>`).join('');
}

async function restoreSnapshot(i) {
  const p = getProject();
  let list = [];
  try { list = (await _idbGetConfig('snapshots_' + p.id)) || []; } catch (e) {}
  const s = list[i];
  if (!s) return;
  if (!confirm(`Roll "${p.name}" back to the snapshot from ${fmtTs(s.ts)}?\n\nThe current state is snapshotted first, so this can be undone.`)) return;
  try {
    await snapshotProject(p, 'before snapshot restore');
    const restored = migrateProject(JSON.parse(s.data));
    const idx = state.projects.findIndex(x => x.id === p.id);
    if (idx >= 0) state.projects[idx] = restored;
    save(); refreshView();
    toast('Snapshot restored', 'success');
  } catch (e) {
    toast('Restore failed: ' + (e.message || e), 'error');
  }
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
  if ((p.contactMgmt||'') !== newMgmt) logChange(`Management contact changed`);
  if ((p.contactIT||'') !== newIT)    logChange(`IT contact changed`);
  p.name = newName; p.company = newCompany; p.location = newLoc; p.contactMgmt = newMgmt; p.contactIT = newIT;
  save();
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
  state.typeColors = {};
  logChange('Device type colors reset to defaults');
  save();
  renderSettings();
  toast('Colors reset to defaults', 'success');
}
