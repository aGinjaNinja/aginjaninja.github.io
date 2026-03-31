// ═══════════════════════════════════════════
//  GOOGLE DRIVE SYNC
// ═══════════════════════════════════════════

// ── Paste your OAuth 2.0 Client ID here ──────────────────────────────────────
const GDRIVE_CLIENT_ID = '761585225303-f5pe1sfedqoksov4eepkh7o6ijm76v87.apps.googleusercontent.com';
// ─────────────────────────────────────────────────────────────────────────────

const GDRIVE_SCOPE       = 'https://www.googleapis.com/auth/drive.file';
const GDRIVE_FOLDER_NAME = 'NetRackManager';
let _driveTokenClient = null;
let _driveToken       = null;
let _driveCallback    = null;

function _initDriveClient() {
  if (_driveTokenClient) return true;
  if (!window.google?.accounts?.oauth2) {
    toast('Google Identity Services not loaded yet — try again in a moment.', 'error');
    return false;
  }
  if (!GDRIVE_CLIENT_ID || GDRIVE_CLIENT_ID.startsWith('YOUR_CLIENT_ID')) {
    openModal(`
      <h3>☁ Google Drive Setup</h3>
      <p style="font-size:13px;color:var(--text2);margin-bottom:14px">
        A <b>Google OAuth Client ID</b> is required before Drive sync can work. This is a one-time setup.
      </p>
      <ol style="font-size:13px;color:var(--text2);line-height:2;padding-left:18px">
        <li>Go to <b style="color:var(--accent)">console.cloud.google.com</b></li>
        <li>Create a project → <b>APIs &amp; Services → Enable APIs</b> → enable <b>Google Drive API</b></li>
        <li><b>APIs &amp; Services → Credentials → Create Credentials → OAuth 2.0 Client ID</b></li>
        <li>Application type: <b>Web application</b></li>
        <li>Under <b>Authorised JavaScript origins</b> add the URL you open this file from<br>
          <span style="font-family:var(--mono);font-size:11px;color:var(--accent)">${esc(location.origin)}</span></li>
        <li>Copy the <b>Client ID</b> and paste it into the <code>GDRIVE_CLIENT_ID</code> constant<br>
          near the top of the Drive Sync section in this file's source.</li>
      </ol>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="closeModal()">OK</button>
      </div>`);
    return false;
  }
  _driveTokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GDRIVE_CLIENT_ID,
    scope: GDRIVE_SCOPE,
    callback: (resp) => {
      if (resp.error) { toast('Google auth error: ' + resp.error, 'error'); return; }
      _driveToken = resp.access_token;
      if (_driveCallback) { const cb = _driveCallback; _driveCallback = null; cb(); }
    }
  });
  return true;
}

function _driveAuth(callback) {
  _driveCallback = callback;
  if (!_initDriveClient()) return;
  _driveTokenClient.requestAccessToken({ prompt: _driveToken ? '' : '' });
}

async function _driveFetch(url, opts) {
  const resp = await fetch(url, {
    ...opts,
    headers: { Authorization: 'Bearer ' + _driveToken, ...(opts?.headers || {}) }
  });
  if (resp.status === 401) { _driveToken = null; throw new Error('Auth expired — please try again'); }
  return resp;
}

async function _getOrCreateDriveFolder() {
  const q = encodeURIComponent(`name='${GDRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const r = await _driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`);
  const d = await r.json();
  if (d.files?.length) return d.files[0].id;
  const cr = await _driveFetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: GDRIVE_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' })
  });
  return (await cr.json()).id;
}

// ── Manufacturer list save/load ──────────────────────────────────────────────
const GDRIVE_MFR_FILENAME = 'NetRackManager_manufacturers.json';

function _buildManufacturerList() {
  // Build OUI→manufacturer map from all devices that have a manufacturer
  const ouiMap = {}; // oui → { name, vendorId }
  state.projects.forEach(p => {
    (p.devices || []).forEach(d => {
      const mfr = (d.manufacturer || '').trim();
      if (!mfr) return;
      const mfrLower = mfr.toLowerCase();
      if (['n/s','n/a','na','none','unknown','-','—','n\\a','n\\s'].includes(mfrLower)) return;
      const oui = typeof _extractOUI === 'function' ? _extractOUI(d.mac) : '';
      if (!oui) return;
      if (!ouiMap[oui]) ouiMap[oui] = { name: mfr, vendorId: d.vendorId || '' };
    });
  });
  // Group by manufacturer name
  const mfrMap = {};
  for (const [oui, info] of Object.entries(ouiMap)) {
    const key = info.name.toLowerCase();
    if (!mfrMap[key]) mfrMap[key] = { name: info.name, vendorId: info.vendorId, ouis: [] };
    if (!mfrMap[key].ouis.includes(oui)) mfrMap[key].ouis.push(oui);
  }
  return Object.values(mfrMap);
}

async function _gdriveSaveManufacturers(folderId) {
  const list = _buildManufacturerList();
  const content = JSON.stringify({ _netrack_manufacturers: true, updated: new Date().toISOString(), manufacturers: list }, null, 2);
  const q = encodeURIComponent(`name='${GDRIVE_MFR_FILENAME}' and '${folderId}' in parents and trashed=false`);
  const search = await _driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`);
  const { files } = await search.json();
  if (files?.length) {
    await _driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${files[0].id}?uploadType=media`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: content
    });
  } else {
    const boundary = 'nrm' + Date.now();
    const meta = JSON.stringify({ name: GDRIVE_MFR_FILENAME, parents: [folderId], mimeType: 'application/json' });
    const body = `--${boundary}\r\nContent-Type: application/json\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
    await _driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body
    });
  }
}

async function _gdriveLoadManufacturers(folderId) {
  const q = encodeURIComponent(`name='${GDRIVE_MFR_FILENAME}' and '${folderId}' in parents and trashed=false`);
  const search = await _driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`);
  const { files } = await search.json();
  if (!files?.length) return 0;
  const r = await _driveFetch(`https://www.googleapis.com/drive/v3/files/${files[0].id}?alt=media`);
  const data = await r.json();
  if (!data._netrack_manufacturers || !data.manufacturers?.length) return 0;

  // Merge manufacturers into globalVendors (dedup by name)
  const existingNames = new Set(state.globalVendors.map(v => (v.name || '').toLowerCase()));
  for (const m of data.manufacturers) {
    const key = (m.name || '').toLowerCase();
    if (!key || existingNames.has(key)) continue;
    state.globalVendors.push({
      id: m.vendorId || genId(), name: m.name, type: 'Vendor',
      accountNum: '', circuitId: '', supportPhone: '', supportEmail: '', notes: ''
    });
    existingNames.add(key);
  }
  saveGlobalVendors();

  // Cross-check all devices: apply OUI matches
  let matched = 0;
  const ouiToMfr = {};
  for (const m of data.manufacturers) {
    const vendor = state.globalVendors.find(v => (v.name || '').toLowerCase() === (m.name || '').toLowerCase());
    const vid = vendor ? vendor.id : '';
    for (const oui of (m.ouis || [])) {
      ouiToMfr[oui] = { name: m.name, vendorId: vid };
    }
  }
  state.projects.forEach(p => {
    (p.devices || []).forEach(d => {
      if (typeof _isDeviceMissingVendor === 'function' && !_isDeviceMissingVendor(d)) return;
      const oui = typeof _extractOUI === 'function' ? _extractOUI(d.mac) : '';
      if (!oui || !ouiToMfr[oui]) return;
      d.manufacturer = ouiToMfr[oui].name;
      if (ouiToMfr[oui].vendorId) d.vendorId = ouiToMfr[oui].vendorId;
      matched++;
    });
  });
  if (matched > 0) save();
  return matched;
}

// ── Project folders save/load ─────────────────────────────────────────────────
const GDRIVE_FOLDERS_FILENAME = 'NetRackManager_folders.json';

async function _gdriveSaveFolders(driveFolderId) {
  const folders = state.projectFolders || [];
  const content = JSON.stringify({ _netrack_folders: true, updated: new Date().toISOString(), folders }, null, 2);
  const q = encodeURIComponent(`name='${GDRIVE_FOLDERS_FILENAME}' and '${driveFolderId}' in parents and trashed=false`);
  const search = await _driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`);
  const { files } = await search.json();
  if (files?.length) {
    await _driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${files[0].id}?uploadType=media`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: content
    });
  } else {
    const boundary = 'nrf' + Date.now();
    const meta = JSON.stringify({ name: GDRIVE_FOLDERS_FILENAME, parents: [driveFolderId], mimeType: 'application/json' });
    const body = `--${boundary}\r\nContent-Type: application/json\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
    await _driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body
    });
  }
}

async function _gdriveLoadFolders(driveFolderId) {
  const q = encodeURIComponent(`name='${GDRIVE_FOLDERS_FILENAME}' and '${driveFolderId}' in parents and trashed=false`);
  const search = await _driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`);
  const { files } = await search.json();
  if (!files?.length) return;
  const r = await _driveFetch(`https://www.googleapis.com/drive/v3/files/${files[0].id}?alt=media`);
  const data = await r.json();
  if (!data._netrack_folders || !data.folders) return;
  // Merge: keep existing folders, add any from Drive that don't exist locally
  const existingIds = new Set((state.projectFolders || []).map(f => f.id));
  for (const f of data.folders) {
    if (!existingIds.has(f.id)) {
      state.projectFolders.push(f);
      existingIds.add(f.id);
    }
  }
  _idbSaveConfig('projectFolders', state.projectFolders).catch(() => {});
}

// ── Project save/load ────────────────────────────────────────────────────────

function _projectDescription(p) {
  return JSON.stringify({ devices: (p.devices||[]).length, racks: (p.racks||[]).length, photos: (p.photos||[]).length, folderId: p.folderId || '' });
}

function _driveProgressModal(title, detail) {
  openModal(`
    <h3 style="margin-bottom:12px">${title}</h3>
    <p id="gdrive-prog-detail" style="font-size:13px;color:var(--text2);margin-bottom:10px">${detail}</p>
    <div style="background:var(--card2);border:1px solid var(--border2);border-radius:6px;height:22px;overflow:hidden">
      <div id="gdrive-prog-bar" style="height:100%;width:0%;background:var(--accent);border-radius:6px;transition:width .3s ease"></div>
    </div>
    <p id="gdrive-prog-pct" style="text-align:center;font-size:12px;color:var(--text3);margin-top:6px;font-family:var(--mono)">0%</p>
  `);
}

function _driveProgressUpdate(pct, detail) {
  const bar = document.getElementById('gdrive-prog-bar');
  const pctEl = document.getElementById('gdrive-prog-pct');
  const detailEl = document.getElementById('gdrive-prog-detail');
  if (bar) bar.style.width = pct + '%';
  if (pctEl) pctEl.textContent = Math.round(pct) + '%';
  if (detail && detailEl) detailEl.textContent = detail;
}

function _driveDoneModal(title, message, type) {
  const icon = type === 'error' ? '⚠' : '☁';
  const color = type === 'error' ? '#e74c3c' : 'var(--accent)';
  openModal(`
    <h3 style="margin-bottom:12px">${icon} ${title}</h3>
    <p style="font-size:13px;color:var(--text2);margin-bottom:18px">${message}</p>
    <div class="modal-actions">
      <button class="btn btn-primary" onclick="closeModal()" style="min-width:100px;border-color:${color};background:${color}">Okay</button>
    </div>
  `);
}

async function gdriveSave() {
  const p = getProject();
  if (!p) return toast('No project open', 'error');
  _driveAuth(async () => {
    _driveProgressModal('☁ Saving to Google Drive', `Uploading "${esc(p.name)}"…`);
    try {
      const folderId = await _getOrCreateDriveFolder();
      _driveProgressUpdate(15);
      const fileName = p.name.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_') + '_netrack.json';
      const content  = JSON.stringify({ _netrack_version: 2, typeColors: state.typeColors || {}, globalVendors: state.globalVendors || [], project: p }, null, 2);
      const desc = _projectDescription(p);
      const q = encodeURIComponent(`name='${fileName}' and '${folderId}' in parents and trashed=false`);
      const search = await _driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`);
      const { files } = await search.json();
      _driveProgressUpdate(35);
      if (files?.length) {
        await _driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${files[0].id}?uploadType=media`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: content
        });
        _driveProgressUpdate(65);
        await _driveFetch(`https://www.googleapis.com/drive/v3/files/${files[0].id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: desc })
        });
      } else {
        const boundary = 'nrm' + Date.now();
        const meta = JSON.stringify({ name: fileName, parents: [folderId], mimeType: 'application/json', description: desc });
        const body = `--${boundary}\r\nContent-Type: application/json\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
        await _driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST',
          headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
          body
        });
        _driveProgressUpdate(65);
      }
      _driveProgressUpdate(80, 'Saving manufacturers & folders…');
      await _gdriveSaveManufacturers(folderId);
      _driveProgressUpdate(90);
      await _gdriveSaveFolders(folderId);
      _driveProgressUpdate(100);
      logChange('Project saved to Google Drive');
      save();
      _driveDoneModal('Save Complete', `"${esc(p.name)}" has been saved to Google Drive.`);
    } catch (err) {
      _driveDoneModal('Save Failed', 'Error: ' + esc(err.message), 'error');
    }
  });
}

async function gdriveSaveAll() {
  if (!state.projects.length) return toast('No projects to save', 'error');
  _driveAuth(async () => {
    const total = state.projects.length;
    _driveProgressModal('☁ Saving All to Google Drive', `Preparing to save ${total} project${total !== 1 ? 's' : ''}…`);
    try {
      const folderId = await _getOrCreateDriveFolder();
      let saved = 0, failed = 0;
      _driveProgressUpdate(5);
      for (let i = 0; i < state.projects.length; i++) {
        const p = state.projects[i];
        _driveProgressUpdate(5 + (i / total) * 80, `Saving "${esc(p.name)}" (${i + 1} of ${total})…`);
        try {
          const fileName = p.name.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_') + '_netrack.json';
          const content = JSON.stringify({ _netrack_version: 2, typeColors: state.typeColors || {}, globalVendors: state.globalVendors || [], project: p }, null, 2);
          const desc = _projectDescription(p);
          const q = encodeURIComponent(`name='${fileName}' and '${folderId}' in parents and trashed=false`);
          const search = await _driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`);
          const { files } = await search.json();
          if (files?.length) {
            await _driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${files[0].id}?uploadType=media`, {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: content
            });
            await _driveFetch(`https://www.googleapis.com/drive/v3/files/${files[0].id}`, {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description: desc })
            });
          } else {
            const boundary = 'nrm' + Date.now();
            const meta = JSON.stringify({ name: fileName, parents: [folderId], mimeType: 'application/json', description: desc });
            const body = `--${boundary}\r\nContent-Type: application/json\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
            await _driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
              method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body
            });
          }
          saved++;
        } catch (err) { failed++; }
      }
      _driveProgressUpdate(90, 'Saving manufacturers & folders…');
      await _gdriveSaveManufacturers(folderId);
      _driveProgressUpdate(95);
      await _gdriveSaveFolders(folderId);
      _driveProgressUpdate(100);
      const msg = failed
        ? `${saved} project${saved !== 1 ? 's' : ''} saved, ${failed} failed.`
        : `All ${saved} project${saved !== 1 ? 's' : ''} saved successfully.`;
      _driveDoneModal('Save Complete', msg, failed && !saved ? 'error' : undefined);
    } catch (err) {
      _driveDoneModal('Save Failed', 'Error: ' + esc(err.message), 'error');
    }
  });
}

async function gdriveLoad() {
  _driveAuth(async () => {
    try {
      const folderId = await _getOrCreateDriveFolder();
      // Load manufacturer list and folders from Drive
      try {
        const mfrMatched = await _gdriveLoadManufacturers(folderId);
        if (mfrMatched > 0) toast(`☁ Auto-matched ${mfrMatched} device${mfrMatched!==1?'s':''} from manufacturer list`, 'success');
      } catch(e) { /* non-fatal */ }
      try { await _gdriveLoadFolders(folderId); } catch(e) { /* non-fatal */ }
      const q = encodeURIComponent(`'${folderId}' in parents and name contains '_netrack.json' and trashed=false`);
      const r = await _driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime,size,description)&orderBy=modifiedTime+desc`);
      const { files } = await r.json();
      if (!files?.length) return toast('No NetRackManager files found in Google Drive.', 'error');

      _gdrivePendingFiles = files;
      openModal(`
        <h3>☁ Load from Google Drive</h3>
        <p style="font-size:13px;color:var(--text2);margin-bottom:14px">
          Click a project to download &amp; open it, or add all to your dashboard.
        </p>
        <div style="display:flex;flex-direction:column;gap:6px;max-height:52vh;overflow-y:auto">
          ${files.map(f => {
            const label = f.name.replace(/_netrack\.json$/,'').replace(/_/g,' ');
            const date  = new Date(f.modifiedTime).toLocaleString();
            const size  = f.size ? (f.size >= 1024000 ? (f.size/1048576).toFixed(1)+' MB' : (f.size/1024).toFixed(0)+' KB') : '';
            return `<div onclick="gdriveImportFile('${f.id}','${esc(f.name)}')"
              style="padding:10px 14px;background:var(--card2);border:1px solid var(--border2);border-radius:6px;cursor:pointer;transition:border-color .15s"
              onmouseover="this.style.borderColor='var(--accent)'"
              onmouseout="this.style.borderColor='var(--border2)'">
              <div style="font-size:13px;font-weight:600;color:var(--text)">${esc(label)}</div>
              <div style="font-size:11px;color:var(--text3);margin-top:3px;font-family:var(--mono)">
                Modified: ${esc(date)}${size ? ' · ' + size : ''}
              </div>
            </div>`;
          }).join('')}
        </div>
        <div class="modal-actions">
          <button class="btn btn-ghost btn-sm" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary btn-sm" onclick="gdriveAddAllToDashboard()">☁ Add All to Dashboard (${files.length})</button>
        </div>
      `, '500px');
    } catch (err) { toast('Drive load failed: ' + err.message, 'error'); }
  });
}

let _gdrivePendingFiles = [];

// Saves metadata only — no project data downloaded. Cards appear on the dashboard.
async function gdriveAddAllToDashboard() {
  const files = _gdrivePendingFiles;
  if (!files?.length) return;
  const index = files.map(f => {
    let counts = {};
    try { counts = JSON.parse(f.description || '{}'); } catch(e) {}
    return {
      driveFileId: f.id,
      name: f.name.replace(/_netrack\.json$/, '').replace(/_/g, ' '),
      fileName: f.name,
      modifiedTime: f.modifiedTime,
      size: f.size,
      devices: counts.devices || 0,
      racks: counts.racks || 0,
      photos: counts.photos || 0,
      folderId: counts.folderId || ''
    };
  });
  // Merge with existing drive index
  const merged = [...state.driveIndex];
  for (const entry of index) {
    const idx = merged.findIndex(e => e.driveFileId === entry.driveFileId);
    if (idx >= 0) merged[idx] = entry; else merged.push(entry);
  }
  state.driveIndex = merged;
  await _idbSaveConfig('driveIndex', merged);
  closeModal();
  if (typeof renderProjects === 'function') renderProjects();
  toast(`☁ ${files.length} project${files.length !== 1 ? 's' : ''} added — click one to download`, 'success');
}

// Downloads one project from Drive, saves to IDB, and opens it
async function openDriveProject(driveFileId) {
  if (!_driveToken) {
    _driveAuth(() => openDriveProject(driveFileId));
    return;
  }
  _driveProgressModal('☁ Downloading Project', 'Fetching project from Google Drive…');
  try {
    _driveProgressUpdate(10);
    const r = await _driveFetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`);
    const text = await r.text();
    _driveProgressUpdate(40, 'Processing project data…');
    let p = null, importedColors = null, importedVendors = null;
    const parsed = JSON.parse(text);
    if (parsed._netrack_version === 2 && parsed.project) {
      p = parsed.project; importedColors = parsed.typeColors; importedVendors = parsed.globalVendors;
    } else if (parsed.id && parsed.name) {
      p = parsed;
    } else { throw new Error('Unrecognised file format'); }
    if (!p.id || !p.name) throw new Error('Missing project id or name');
    migrateProject(p);
    _driveProgressUpdate(55, 'Saving to local storage…');
    await _idbSaveProject(p);
    const existing = state.projects.findIndex(x => x.id === p.id);
    if (existing >= 0) { state.projects[existing] = p; }
    else { state.projects.push(p); }
    if (importedColors) {
      state.typeColors = Object.assign({}, importedColors, state.typeColors);
      _idbSaveConfig('typeColors', state.typeColors).catch(() => {});
    }
    if (importedVendors && importedVendors.length > 0) {
      const existingNames = new Set(state.globalVendors.map(v => (v.name||'').toLowerCase()));
      importedVendors.forEach(v => { const k=(v.name||'').toLowerCase(); if(k&&!existingNames.has(k)){state.globalVendors.push({...v});existingNames.add(k);} });
      saveGlobalVendors();
    }
    _driveProgressUpdate(70, 'Syncing manufacturers & folders…');
    try {
      const folderId = await _getOrCreateDriveFolder();
      const mfrMatched = await _gdriveLoadManufacturers(folderId);
      if (mfrMatched > 0) toast(`☁ Auto-matched ${mfrMatched} device${mfrMatched!==1?'s':''} from manufacturer list`, 'success');
      await _gdriveLoadFolders(folderId);
    } catch(e) { /* non-fatal */ }
    _driveProgressUpdate(90);
    // Remove from drive index — it's now a local project
    state.driveIndex = state.driveIndex.filter(e => e.driveFileId !== driveFileId);
    _idbSaveConfig('driveIndex', state.driveIndex).catch(() => {});
    _driveProgressUpdate(100, 'Opening project…');
    state.currentProjectId = p.id;
    sessionStorage.setItem('netrack_current_project', p.id);
    try { localStorage.setItem('netrack_current_project', p.id); } catch(e) {}
    window.location.href = 'dashboard.html';
  } catch (err) {
    _driveDoneModal('Download Failed', 'Error: ' + esc(err.message), 'error');
  }
}

async function gdriveImportFile(fileId, fileName) {
  _driveProgressModal('☁ Downloading Project', 'Fetching project from Google Drive…');
  try {
    _driveProgressUpdate(10);
    const r = await _driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
    const text = await r.text();
    _driveProgressUpdate(40, 'Processing project data…');
    let p = null, importedColors = null, importedVendors = null;
    const parsed = JSON.parse(text);
    if (parsed._netrack_version === 2 && parsed.project) {
      p = parsed.project; importedColors = parsed.typeColors; importedVendors = parsed.globalVendors;
    } else if (parsed.id && parsed.name) {
      p = parsed;
    } else { throw new Error('Unrecognised file format'); }
    if (!p.id || !p.name) throw new Error('Missing project id or name');
    migrateProject(p);
    _driveProgressUpdate(55, 'Saving to local storage…');
    await _idbSaveProject(p);
    const existing = state.projects.findIndex(x => x.id === p.id);
    if (existing >= 0) { state.projects[existing] = p; }
    else { state.projects.push(p); }
    if (importedColors) {
      state.typeColors = Object.assign({}, importedColors, state.typeColors);
      _idbSaveConfig('typeColors', state.typeColors).catch(() => {});
    }
    if (importedVendors && importedVendors.length > 0) {
      const existingNames = new Set(state.globalVendors.map(v => (v.name||'').toLowerCase()));
      importedVendors.forEach(v => { const k=(v.name||'').toLowerCase(); if(k&&!existingNames.has(k)){state.globalVendors.push({...v});existingNames.add(k);} });
      saveGlobalVendors();
    }
    _driveProgressUpdate(70, 'Syncing manufacturers & folders…');
    try {
      const folderId = await _getOrCreateDriveFolder();
      const mfrMatched = await _gdriveLoadManufacturers(folderId);
      if (mfrMatched > 0) toast(`☁ Auto-matched ${mfrMatched} device${mfrMatched!==1?'s':''} from manufacturer list`, 'success');
      await _gdriveLoadFolders(folderId);
    } catch(e) { /* non-fatal */ }
    _driveProgressUpdate(90);
    save();
    _driveProgressUpdate(100, 'Opening project…');
    state.currentProjectId = p.id;
    sessionStorage.setItem('netrack_current_project', p.id);
    try { localStorage.setItem('netrack_current_project', p.id); } catch(e) {}
    window.location.href = 'dashboard.html';
  } catch (err) {
    _driveDoneModal('Download Failed', 'Error: ' + esc(err.message), 'error');
  }
}
