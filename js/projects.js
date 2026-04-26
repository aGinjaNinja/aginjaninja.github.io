// ── Helper: create a local project card ──
function _createProjectCard(p) {
  const devCount = p.devices.length;
  const rackCount = p.racks.length;
  const photoCount = (p.photos||[]).length;
  const bytes = new Blob([JSON.stringify(p)]).size;
  const sizeStr = bytes >= 1024000 ? (bytes/1048576).toFixed(1)+' MB' : (bytes/1024).toFixed(0)+' KB';
  const div = document.createElement('div');
  div.className = 'proj-card';
  div.innerHTML = `
    <button class="pmove" title="Move to folder" onclick="moveProjectToFolder('${p.id}', event)">📁</button>
    <button class="pdel" title="Delete project" onclick="deleteProject('${p.id}', event)">✕</button>
    <div class="pname">${esc(p.name)}</div>
    <div class="pmeta"><span>${devCount}</span> devices &nbsp;·&nbsp; <span>${rackCount}</span> racks &nbsp;·&nbsp; <span>${photoCount}</span> photos</div>
    <div class="pmeta" style="margin-top:4px;color:var(--text3);">${p.created || 'Project'} &nbsp;·&nbsp; ${sizeStr}</div>
  `;
  div.addEventListener('click', () => openProject(p.id));
  return div;
}

// ── Helper: create a Drive-only project card ──
function _createDriveCard(d) {
  const div = document.createElement('div');
  div.className = 'proj-card';
  div.style.borderColor = 'rgba(66,133,244,.3)';
  div.innerHTML = `
    <div style="position:absolute;top:8px;right:8px;font-size:10px;color:#4285f4;font-family:var(--mono);background:rgba(66,133,244,.1);border:1px solid rgba(66,133,244,.3);border-radius:4px;padding:1px 6px">☁ Drive</div>
    <div class="pname">${esc(d.name)}</div>
    <div class="pmeta" style="color:#4285f4">Click to download &amp; open</div>
    <div class="pmeta" style="margin-top:4px;font-size:10px;color:var(--text2)">${d.devices||0} devices &middot; ${d.racks||0} racks &middot; ${d.photos||0} photos</div>
    <div class="pmeta" style="margin-top:4px;color:var(--text3);font-size:10px">${d.modifiedTime ? new Date(d.modifiedTime).toLocaleDateString() : ''}${d.size ? ' &middot; ' + (d.size >= 1024000 ? (d.size/1048576).toFixed(1)+' MB' : (d.size/1024).toFixed(0)+' KB') : ''}</div>
  `;
  div.addEventListener('click', () => openDriveProject(d.driveFileId));
  return div;
}

// ── Helper: create a "+ New Project" card ──
function _createNewProjectCard(folderId) {
  const np = document.createElement('div');
  np.className = 'proj-new';
  np.innerHTML = `<span style="font-size:20px;color:var(--accent)">+</span> New Project`;
  np.onclick = () => newProject(folderId || '');
  return np;
}

// ═══════════════════════════════════════════
//  RENDER PROJECTS — grouped by folder
// ═══════════════════════════════════════════
function renderProjects() {
  const g = document.getElementById('proj-grid');
  g.innerHTML = '';

  const folders = state.projectFolders || [];
  const hasFolders = folders.length > 0;

  // Build folderId → local project[] map
  const folderProjects = {};
  const unfiled = [];
  state.projects.forEach(p => {
    if (p.folderId && folders.find(f => f.id === p.folderId)) {
      if (!folderProjects[p.folderId]) folderProjects[p.folderId] = [];
      folderProjects[p.folderId].push(p);
    } else {
      unfiled.push(p);
    }
  });

  // Build folderId → Drive-only project[] map
  const localNames = new Set(state.projects.map(p => p.name));
  const driveOnly = (state.driveIndex || []).filter(d => !localNames.has(d.name));
  const driveFoldered = {};
  const driveUnfiled = [];
  driveOnly.forEach(d => {
    if (d.folderId && folders.find(f => f.id === d.folderId)) {
      if (!driveFoldered[d.folderId]) driveFoldered[d.folderId] = [];
      driveFoldered[d.folderId].push(d);
    } else {
      driveUnfiled.push(d);
    }
  });

  // ── "+ New Folder" link at top — always visible ──
  const topBar = document.createElement('div');
  topBar.style.cssText = 'display:flex;justify-content:flex-end;margin-bottom:8px';
  topBar.innerHTML = `<button class="btn btn-ghost btn-sm" onclick="newFolder()" style="font-size:12px;padding:4px 10px">+ New Folder</button>`;
  g.appendChild(topBar);

  // ── Render each folder (local + Drive cards together) ──
  folders.forEach(folder => {
    const localCards = folderProjects[folder.id] || [];
    const driveCards = driveFoldered[folder.id] || [];
    const totalCount = localCards.length + driveCards.length;

    const folderEl = document.createElement('div');
    folderEl.className = 'proj-folder';

    const header = document.createElement('div');
    header.className = 'proj-folder-header';
    header.innerHTML = `
      <div class="proj-folder-toggle" onclick="toggleFolder('${folder.id}')">${folder.collapsed ? '▶' : '▼'}</div>
      <div class="proj-folder-name" onclick="toggleFolder('${folder.id}')">${esc(folder.name)}</div>
      <div class="proj-folder-count">${totalCount} project${totalCount !== 1 ? 's' : ''}</div>
      <button class="proj-folder-action" onclick="renameFolder('${folder.id}')" title="Rename folder">✎</button>
      <button class="proj-folder-action" onclick="deleteFolder('${folder.id}')" title="Delete folder">✕</button>
    `;
    folderEl.appendChild(header);

    if (!folder.collapsed) {
      const grid = document.createElement('div');
      grid.className = 'proj-inner-grid';
      localCards.forEach(p => grid.appendChild(_createProjectCard(p)));
      driveCards.forEach(d => grid.appendChild(_createDriveCard(d)));
      folderEl.appendChild(grid);
    }

    g.appendChild(folderEl);
  });

  // ── Unfiled local projects (always shown — contains "+ New Project") ──
  if (hasFolders) {
    const header = document.createElement('div');
    header.className = 'proj-folder-header';
    header.innerHTML = `
      <div class="proj-folder-name" style="color:var(--text2)">Unfiled Projects</div>
      <div class="proj-folder-count">${unfiled.length}</div>
    `;
    g.appendChild(header);
  }
  const unfiledGrid = document.createElement('div');
  unfiledGrid.className = 'proj-inner-grid';
  unfiled.forEach(p => unfiledGrid.appendChild(_createProjectCard(p)));
  unfiledGrid.appendChild(_createNewProjectCard(''));
  g.appendChild(unfiledGrid);

  // ── Unfiled Drive-only projects ──
  if (driveUnfiled.length > 0) {
    const header = document.createElement('div');
    header.className = 'proj-folder-header';
    header.innerHTML = `
      <div class="proj-folder-name" style="color:#4285f4">☁ Google Drive</div>
      <div class="proj-folder-count">${driveUnfiled.length}</div>
    `;
    g.appendChild(header);
    const grid = document.createElement('div');
    grid.className = 'proj-inner-grid';
    driveUnfiled.forEach(d => grid.appendChild(_createDriveCard(d)));
    g.appendChild(grid);
  }
}

// ═══════════════════════════════════════════
//  FOLDER MANAGEMENT
// ═══════════════════════════════════════════
function _saveProjectFolders() {
  _idbSaveConfig('projectFolders', state.projectFolders || []).catch(() => {});
}

function newFolder() {
  openModal(`
    <h3>New Folder</h3>
    <div class="form-row"><label>Client / Company Name</label>
      <input class="form-control" id="pf-name" placeholder="e.g. Acme Corporation" autofocus></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="createFolder()">Create</button>
    </div>
  `);
  setTimeout(() => document.getElementById('pf-name')?.focus(), 50);
}

function createFolder() {
  const name = document.getElementById('pf-name')?.value?.trim();
  if (!name) return toast('Enter a folder name', 'error');
  if (!state.projectFolders) state.projectFolders = [];
  state.projectFolders.push({ id: genId(), name, collapsed: false });
  _saveProjectFolders();
  closeModal();
  renderProjects();
  toast('Folder created');
}

function toggleFolder(id) {
  const f = (state.projectFolders || []).find(f => f.id === id);
  if (f) { f.collapsed = !f.collapsed; _saveProjectFolders(); renderProjects(); }
}

function renameFolder(id) {
  const f = (state.projectFolders || []).find(f => f.id === id);
  if (!f) return;
  openModal(`
    <h3>Rename Folder</h3>
    <div class="form-row"><label>Folder Name</label>
      <input class="form-control" id="pf-rename" value="${esc(f.name)}" autofocus></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="confirmRenameFolder('${id}')">Save</button>
    </div>
  `);
  setTimeout(() => { const el = document.getElementById('pf-rename'); el?.focus(); el?.select(); }, 50);
}

function confirmRenameFolder(id) {
  const f = (state.projectFolders || []).find(f => f.id === id);
  if (!f) return;
  const name = document.getElementById('pf-rename')?.value?.trim();
  if (!name) return toast('Enter a folder name', 'error');
  f.name = name;
  _saveProjectFolders();
  closeModal();
  renderProjects();
}

function deleteFolder(id) {
  const f = (state.projectFolders || []).find(f => f.id === id);
  if (!f) return;
  state.projects.forEach(p => { if (p.folderId === id) p.folderId = ''; });
  state.projectFolders = state.projectFolders.filter(x => x.id !== id);
  _saveProjectFolders();
  save();
  renderProjects();
  toast('Folder removed — projects moved to Unfiled');
}

function moveProjectToFolder(projectId, e) {
  e.stopPropagation();
  const folders = state.projectFolders || [];
  const p = state.projects.find(x => x.id === projectId);
  if (!p) return;
  const options = folders.map(f =>
    `<div onclick="confirmMoveProject('${projectId}','${f.id}')" style="padding:10px 14px;cursor:pointer;border-radius:6px;transition:background .15s${p.folderId === f.id ? ';color:var(--accent);font-weight:600' : ''}" onmouseover="this.style.background='var(--card2)'" onmouseout="this.style.background=''">
      ${p.folderId === f.id ? '✓ ' : '&nbsp;&nbsp;&nbsp;'}${esc(f.name)}
    </div>`
  ).join('');
  openModal(`
    <h3>Move to Folder</h3>
    <p style="font-size:12px;color:var(--text3);margin-bottom:10px">${esc(p.name)}</p>
    <div style="display:flex;flex-direction:column;gap:2px;max-height:40vh;overflow-y:auto">
      <div onclick="confirmMoveProject('${projectId}','')" style="padding:10px 14px;cursor:pointer;border-radius:6px;transition:background .15s${!p.folderId ? ';color:var(--accent);font-weight:600' : ''}" onmouseover="this.style.background='var(--card2)'" onmouseout="this.style.background=''">
        ${!p.folderId ? '✓ ' : '&nbsp;&nbsp;&nbsp;'}Unfiled
      </div>
      ${options}
    </div>
    <div style="border-top:1px solid var(--border);margin-top:10px;padding-top:10px">
      <button class="btn btn-ghost btn-sm" onclick="closeModal();newFolder()">+ New Folder</button>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    </div>
  `);
}

function confirmMoveProject(projectId, folderId) {
  const p = state.projects.find(x => x.id === projectId);
  if (!p) return;
  p.folderId = folderId;
  save();
  closeModal();
  renderProjects();
}

// ═══════════════════════════════════════════
//  PROJECT CRUD
// ═══════════════════════════════════════════
function newProject(preselectedFolderId) {
  const folders = state.projectFolders || [];
  const folderSelect = folders.length > 0 ? `
    <div class="form-row"><label>Folder</label>
      <select class="form-control" id="pn-folder">
        <option value="">— No Folder —</option>
        ${folders.map(f => `<option value="${f.id}"${f.id === preselectedFolderId ? ' selected' : ''}>${esc(f.name)}</option>`).join('')}
      </select>
    </div>` : '';
  openModal(`
    <h3>New Project</h3>
    <div class="form-row"><label>Project Name</label>
      <input class="form-control" id="pn-name" placeholder="e.g. Office Network 2025" autofocus></div>
    ${folderSelect}
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
  const folderId = document.getElementById('pn-folder')?.value || '';
  const p = {
    id: genId(), name, folderId,
    company: '', location: '', contactMgmt: '', contactIT: '',
    created: new Date().toLocaleDateString(),
    devices: [], racks: [], changelog: [], siteNotes: [],
    flowchart: JSON.parse(JSON.stringify(DEFAULT_FLOWCHART)),
    fcNodePositions: {},
    photos: [], photoFolders: [],
    checklist: getDefaultChecklist(), timeLog: [],
    cableRuns: [], locations: [], siteMap: { data: null, markers: [], cableLines: [] }
  };
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
  openModal(`
    <h3 style="color:var(--red)">⚠ Delete Project</h3>
    <p style="margin-bottom:16px;color:var(--text2)">This will permanently delete <strong style="color:#fff">${esc(p.name)}</strong> and all its devices, racks, and data. This cannot be undone.</p>
    <p style="margin-bottom:16px;color:var(--text2)">To confirm, type the project name below:</p>
    <div class="form-row"><input class="form-control" id="del-confirm-name" placeholder="${esc(p.name)}"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-danger" onclick="confirmDeleteProject('${id}')">Delete Permanently</button>
    </div>`);
  setTimeout(() => document.getElementById('del-confirm-name')?.focus(), 50);
}

function confirmDeleteProject(id) {
  const p = state.projects.find(x => x.id === id);
  if (!p) return;
  const typed = document.getElementById('del-confirm-name')?.value?.trim();
  if (typed !== p.name) return toast('Project name does not match', 'error');
  // Clean up photo data from separate store
  const photoIds = (p.photos || []).map(ph => ph.id).filter(Boolean);
  photoIds.push('sitemap_' + id, 'cablemap_' + id);
  Promise.all(photoIds.map(pid => _idbDeletePhotoData(pid))).catch(() => {});
  state.projects = state.projects.filter(x => x.id !== id);
  _idbDeleteProject(id).catch(() => {});
  save();
  closeModal();
  renderProjects();
  toast('Project deleted');
}

function openProject(id) {
  state.currentProjectId = id;
  sessionStorage.setItem('netrack_current_project', id);
  try { localStorage.setItem('netrack_current_project', id); } catch(e) {}
  window.location.href = 'dashboard.html';
}
