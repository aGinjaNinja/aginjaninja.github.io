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

// Pick up token from manual OAuth redirect flow (Capacitor/WebView fallback)
(function _checkManualToken() {
  try {
    const t = localStorage.getItem('_gdrive_manual_token');
    const exp = parseInt(localStorage.getItem('_gdrive_manual_token_expiry') || '0');
    if (t && exp > Date.now()) {
      _driveToken = t;
      localStorage.removeItem('_gdrive_manual_token');
      localStorage.removeItem('_gdrive_manual_token_expiry');
      setTimeout(() => { if (typeof toast === 'function') toast('Signed in to Google Drive', 'success'); }, 500);
    } else if (t) {
      localStorage.removeItem('_gdrive_manual_token');
      localStorage.removeItem('_gdrive_manual_token_expiry');
    }
  } catch(e) {}
})();

async function _ensureGisLoaded() {
  if (window.google?.accounts?.oauth2) return true;
  // Try loading the script dynamically if not present
  if (!document.querySelector('script[src*="accounts.google.com/gsi/client"]')) {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    document.head.appendChild(s);
  }
  // Wait up to 8 seconds for it to load
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 200));
    if (window.google?.accounts?.oauth2) return true;
  }
  return false;
}

function _initDriveClient() {
  if (_driveTokenClient) return true;
  if (!window.google?.accounts?.oauth2) return false;
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
      _gdriveAutoSyncEnabled = true;
      if (_driveCallback) { const cb = _driveCallback; _driveCallback = null; cb(); }
    }
  });
  return true;
}

async function _driveAuth(callback) {
  // If we already have a token (including from manual flow), just use it
  if (_driveToken) { callback(); return; }

  // Native Android sign-in via Capacitor plugin
  if (window.Capacitor?.isNativePlatform?.()) {
    try {
      toast('Signing in to Google…', 'info');
      const result = await window.Capacitor.Plugins.GoogleAuth.signIn();
      _driveToken = result.accessToken;
      _gdriveAutoSyncEnabled = true;
      toast('Signed in to Google Drive', 'success');
      callback();
    } catch (e) {
      toast('Google sign-in failed: ' + (e.message || e), 'error');
    }
    return;
  }

  // Web: use Google Identity Services
  _driveCallback = callback;
  if (!_initDriveClient()) {
    toast('Loading Google services…', 'info');
    const loaded = await _ensureGisLoaded();
    if (!loaded) {
      toast('Could not load Google Identity Services', 'error');
      return;
    }
    if (!_initDriveClient()) return;
  }
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

// ── Separate photo storage helpers ───────────────────────────────────────────
function _dataUrlToBlob(dataUrl) {
  const ci = dataUrl.indexOf(',');
  const mime = dataUrl.substring(5, dataUrl.indexOf(';'));
  const b64 = dataUrl.substring(ci + 1);
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function _blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

async function _getOrCreateSubFolder(parentId, name) {
  const q = encodeURIComponent(`name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const r = await _driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`);
  const { files } = await r.json();
  if (files?.length) return files[0].id;
  const cr = await _driveFetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, parents: [parentId], mimeType: 'application/vnd.google-apps.folder' })
  });
  return (await cr.json()).id;
}

async function _listDriveFolder(parentId) {
  const q = encodeURIComponent(`'${parentId}' in parents and trashed=false`);
  const r = await _driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,size)&pageSize=1000`);
  const { files } = await r.json();
  return files || [];
}

async function _driveUploadBlob(parentId, fileName, blob, existingFileId) {
  if (existingFileId) {
    await _driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=media`, {
      method: 'PATCH', headers: { 'Content-Type': blob.type }, body: blob
    });
    return existingFileId;
  }
  const boundary = 'nrp' + Date.now() + Math.random().toString(36).slice(2, 8);
  const meta = JSON.stringify({ name: fileName, parents: [parentId] });
  const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${blob.type}\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;
  const body = new Blob([head, blob, tail]);
  const r = await _driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body
  });
  return (await r.json()).id;
}

async function _driveDeleteFile(fileId) {
  try { await _driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, { method: 'DELETE' }); } catch(e) {}
}

// Per-project map tracking which photos are already on Drive
function _getDriveMap(projectId) {
  try { return JSON.parse(localStorage.getItem('netrack_drivemap_' + projectId) || '{}'); } catch(e) { return {}; }
}
function _saveDriveMap(projectId, map) {
  try { localStorage.setItem('netrack_drivemap_' + projectId, JSON.stringify(map)); } catch(e) {}
}

// Strip photo binary data from a project for metadata-only JSON.
// Adds _driveSynced per photo so the backup always shows which photos
// exist but haven't been uploaded yet (the "manifest").
function _stripPhotoData(project, includeSyncStatus) {
  const p = { ...project };
  if (p.photos) {
    const driveMap = includeSyncStatus ? _getDriveMap(project.id) : null;
    p.photos = p.photos.map(({ data, _editorSrc, ...rest }) => {
      const ph = { ...rest };
      if (driveMap) {
        const entry = driveMap[ph.id];
        const len = ph.dataLen || 0;
        ph._driveSynced = !!(entry?.driveFileId && entry.dataLen === len && len > 0);
      }
      return ph;
    });
  }
  if (p.siteMapFloors) p.siteMapFloors = p.siteMapFloors.map(f => { const { _data, ...rest } = f; return rest; });
  if (p.cableRunMap?.image) p.cableRunMap = { ...p.cableRunMap, image: null };
  return p;
}

// Build the metadata bundle with photo manifest (sync status per photo)
function _buildMetadataBundle(project, mediaFolderId) {
  const stripped = _stripPhotoData(project, true);
  const totalPhotos = (stripped.photos || []).length;
  const syncedPhotos = (stripped.photos || []).filter(ph => ph._driveSynced).length;
  const pendingPhotos = totalPhotos - syncedPhotos;
  return {
    _netrack_version: 2,
    _separateMedia: true,
    _mediaFolderId: mediaFolderId,
    _photoManifest: { total: totalPhotos, synced: syncedPhotos, pending: pendingPhotos, lastSync: new Date().toISOString() },
    typeColors: state.typeColors || {},
    globalVendors: state.globalVendors || [],
    project: stripped
  };
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
      _driveProgressUpdate(5);

      // ── Upload photos as individual binary files ──
      const allPhotos = (p.photos || []).filter(ph => ph.id);
      const floors = p.siteMapFloors || [];
      const floorImages = [];
      for (const f of floors) {
        const d = f._data || await _lazyGetPhotoData('sitemap_' + p.id + '_' + f.id);
        if (d) floorImages.push({ floor: f, data: d });
      }
      const totalMedia = allPhotos.length + floorImages.length;
      const driveMap = _getDriveMap(p.id);
      let mediaFolderId = driveMap.folderId || null;

      if (totalMedia > 0) {
        const safeName = p.name.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_');
        if (!mediaFolderId) mediaFolderId = await _getOrCreateSubFolder(folderId, safeName + '_media');
        driveMap.folderId = mediaFolderId;
        _driveProgressUpdate(10);

        // Upload new or changed photos (skip already-uploaded unchanged ones)
        const localIds = new Set();
        let processed = 0;
        for (const ph of allPhotos) {
          localIds.add(ph.id);
          const entry = driveMap[ph.id];
          const len = ph.dataLen || 0;
          if (entry?.driveFileId && entry.dataLen === len && len > 0) { processed++; continue; }
          const phData = ph.data || await _lazyGetPhotoData(ph.id);
          if (!phData) { processed++; continue; }
          _driveProgressUpdate(10 + (processed / totalMedia) * 55, `Uploading photo ${processed + 1} of ${totalMedia}…`);
          const blob = _dataUrlToBlob(phData);
          const ext = (blob.type.split('/')[1] || 'bin').replace('jpeg', 'jpg');
          const did = await _driveUploadBlob(mediaFolderId, ph.id + '.' + ext, blob, entry?.driveFileId);
          driveMap[ph.id] = { driveFileId: did, dataLen: phData.length };
          if (!ph.dataLen) ph.dataLen = phData.length;
          processed++;
        }

        // Upload floor map images
        for (const { floor: fl, data: smData } of floorImages) {
          const smKey = '_siteMap_' + fl.id;
          const smEntry = driveMap[smKey];
          if (!smEntry?.driveFileId || smEntry.dataLen !== smData.length) {
            _driveProgressUpdate(66, `Uploading floor map: ${fl.name}…`);
            const blob = _dataUrlToBlob(smData);
            const ext = (blob.type.split('/')[1] || 'bin').replace('jpeg', 'jpg');
            const did = await _driveUploadBlob(mediaFolderId, 'sitemap_' + fl.id + '.' + ext, blob, smEntry?.driveFileId);
            driveMap[smKey] = { driveFileId: did, dataLen: smData.length };
          }
        }

        // Delete Drive files for locally-deleted photos
        const floorKeys = new Set(floors.map(f => '_siteMap_' + f.id));
        for (const [key, entry] of Object.entries(driveMap)) {
          if (key === 'folderId' || key === '_siteMap' || key.startsWith('_siteMap_')) { if (key.startsWith('_siteMap_') && !floorKeys.has(key) && entry.driveFileId) { await _driveDeleteFile(entry.driveFileId); delete driveMap[key]; } continue; }
          if (!localIds.has(key) && entry.driveFileId) {
            await _driveDeleteFile(entry.driveFileId);
            delete driveMap[key];
          }
        }
        _saveDriveMap(p.id, driveMap);
      }

      _driveProgressUpdate(70, 'Saving project metadata with photo manifest…');

      // ── Save metadata JSON with photo manifest (sync status per photo) ──
      await _gdriveSaveMetadata(p, folderId, mediaFolderId);

      _driveProgressUpdate(85, 'Saving manufacturers & folders…');
      await _gdriveSaveManufacturers(folderId);
      _driveProgressUpdate(92);
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
          // Upload photos as separate binary files
          const allPh = (p.photos || []).filter(ph => ph.id);
          const flrs = p.siteMapFloors || [];
          const flrImgs = [];
          for (const f of flrs) { const d = f._data || await _lazyGetPhotoData('sitemap_' + p.id + '_' + f.id); if (d) flrImgs.push({ floor: f, data: d }); }
          const driveMap = _getDriveMap(p.id);
          let mediaFolderId = driveMap.folderId || null;
          if (allPh.length > 0 || flrImgs.length > 0) {
            const safeName = p.name.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_');
            if (!mediaFolderId) mediaFolderId = await _getOrCreateSubFolder(folderId, safeName + '_media');
            driveMap.folderId = mediaFolderId;
            const localIds = new Set();
            for (const ph of allPh) {
              localIds.add(ph.id);
              const entry = driveMap[ph.id];
              const len = ph.dataLen || 0;
              if (entry?.driveFileId && entry.dataLen === len && len > 0) continue;
              const phData = ph.data || await _lazyGetPhotoData(ph.id);
              if (!phData) continue;
              const blob = _dataUrlToBlob(phData);
              const ext = (blob.type.split('/')[1] || 'bin').replace('jpeg', 'jpg');
              const did = await _driveUploadBlob(mediaFolderId, ph.id + '.' + ext, blob, entry?.driveFileId);
              driveMap[ph.id] = { driveFileId: did, dataLen: phData.length };
              if (!ph.dataLen) ph.dataLen = phData.length;
            }
            for (const { floor: fl, data: smD } of flrImgs) {
              const smKey = '_siteMap_' + fl.id;
              const smEntry = driveMap[smKey];
              if (!smEntry?.driveFileId || smEntry.dataLen !== smD.length) {
                const blob = _dataUrlToBlob(smD);
                const ext = (blob.type.split('/')[1] || 'bin').replace('jpeg', 'jpg');
                const did = await _driveUploadBlob(mediaFolderId, 'sitemap_' + fl.id + '.' + ext, blob, smEntry?.driveFileId);
                driveMap[smKey] = { driveFileId: did, dataLen: smD.length };
              }
            }
            const floorKeys = new Set(flrs.map(f => '_siteMap_' + f.id));
            for (const [key, entry] of Object.entries(driveMap)) {
              if (key === 'folderId' || key === '_siteMap' || key.startsWith('_siteMap_')) { if (key.startsWith('_siteMap_') && !floorKeys.has(key) && entry.driveFileId) { await _driveDeleteFile(entry.driveFileId); delete driveMap[key]; } continue; }
              if (!localIds.has(key) && entry.driveFileId) { await _driveDeleteFile(entry.driveFileId); delete driveMap[key]; }
            }
            _saveDriveMap(p.id, driveMap);
          }
          // Save metadata JSON without photo data
          const stripped = _stripPhotoData(p);
          const bundle = { _netrack_version: 2, _separateMedia: true, _mediaFolderId: mediaFolderId, typeColors: state.typeColors || {}, globalVendors: state.globalVendors || [], project: stripped };
          const content = JSON.stringify(bundle);
          const desc = _projectDescription(p);
          const fileName = p.name.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_') + '_netrack.json';
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

// Download photos from a separate media folder on Drive (parallel, up to 4 concurrent)
async function _downloadDrivePhotos(project, mediaFolderId, onProgress) {
  const files = await _listDriveFolder(mediaFolderId);
  const fileMap = {};
  files.forEach(f => { fileMap[f.name.replace(/\.[^.]+$/, '')] = f; });
  const photos = (project.photos || []).filter(ph => !ph.data && fileMap[ph.id]);
  const floors = project.siteMapFloors || [];
  const floorFiles = floors.filter(f => fileMap['sitemap_' + f.id] || (project._smLegacyFloorId === f.id && fileMap['sitemap']));
  const hasCableMap = !!fileMap['cablemap'];
  const total = photos.length + floorFiles.length + (hasCableMap ? 1 : 0);
  if (total === 0) return;

  let done = 0;
  const queue = [...photos];
  const driveMap = { folderId: mediaFolderId };

  async function worker() {
    while (queue.length > 0) {
      const ph = queue.shift();
      const f = fileMap[ph.id];
      try {
        const r = await _driveFetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`);
        const blob = await r.blob();
        const dataUrl = await _blobToDataUrl(blob);
        await _idbSavePhotoData(ph.id, dataUrl);
        ph.data = null;
        ph.dataLen = dataUrl.length;
        ph.size = blob.size;
        if (!ph.thumb) ph.thumb = await _generateThumb(dataUrl) || '';
        driveMap[ph.id] = { driveFileId: f.id, dataLen: dataUrl.length };
      } catch(e) { console.warn('Photo download failed:', ph.id, e); }
      done++;
      if (onProgress) onProgress((done / total) * 100, `Downloading photo ${done} of ${total}…`);
    }
  }
  await Promise.all(Array(Math.min(4, queue.length || 1)).fill(null).map(() => worker()));

  // Floor maps
  for (const fl of floorFiles) {
    try {
      const f = fileMap['sitemap_' + fl.id] || fileMap['sitemap'];
      const r = await _driveFetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`);
      const blob = await r.blob();
      const smDataUrl = await _blobToDataUrl(blob);
      await _idbSavePhotoData('sitemap_' + project.id + '_' + fl.id, smDataUrl);
      driveMap['_siteMap_' + fl.id] = { driveFileId: f.id, dataLen: smDataUrl.length };
    } catch(e) {}
    done++;
    if (onProgress) onProgress((done / total) * 100, `Downloading floor map ${done} of ${total}…`);
  }

  // Cable run map
  if (hasCableMap) {
    try {
      const f = fileMap['cablemap'];
      const r = await _driveFetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`);
      const blob = await r.blob();
      const crDataUrl = await _blobToDataUrl(blob);
      await _idbSavePhotoData('cablemap_' + project.id, crDataUrl);
      driveMap['_cableMap'] = { driveFileId: f.id, dataLen: crDataUrl.length };
    } catch(e) { console.warn('Cable map download failed:', e); }
    done++;
    if (onProgress) onProgress((done / total) * 100, `Downloading cable map…`);
  }
  _saveDriveMap(project.id, driveMap);
}

// Index photos in a Drive media folder without downloading them (lazy loading)
async function _indexDrivePhotos(project, mediaFolderId) {
  const files = await _listDriveFolder(mediaFolderId);
  const driveMap = { folderId: mediaFolderId };
  for (const f of files) {
    const name = f.name.replace(/\.[^.]+$/, '');
    if (name === 'cablemap') {
      driveMap['_cableMap'] = { driveFileId: f.id, dataLen: parseInt(f.size) || 0 };
    } else if (name === 'sitemap' || name.startsWith('sitemap_')) {
      const smKey = name === 'sitemap' ? '_siteMap' : '_siteMap_' + name.slice(8);
      driveMap[smKey] = { driveFileId: f.id, dataLen: parseInt(f.size) || 0 };
    } else {
      driveMap[name] = { driveFileId: f.id, dataLen: parseInt(f.size) || 0 };
    }
  }
  _saveDriveMap(project.id, driveMap);
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
    _driveProgressUpdate(20, 'Processing project data…');
    let p = null, importedColors = null, importedVendors = null, mediaFolderId = null;
    const parsed = JSON.parse(text);
    if (parsed._netrack_version === 2 && parsed.project) {
      p = parsed.project; importedColors = parsed.typeColors; importedVendors = parsed.globalVendors;
      mediaFolderId = parsed._mediaFolderId;
    } else if (parsed.id && parsed.name) {
      p = parsed;
    } else { throw new Error('Unrecognised file format'); }
    if (!p.id || !p.name) throw new Error('Missing project id or name');
    migrateProject(p);

    // Index photos on Drive (lazy — full data fetched on demand when viewed)
    if (parsed._separateMedia && mediaFolderId) {
      _driveProgressUpdate(30, 'Indexing photos on Drive…');
      await _indexDrivePhotos(p, mediaFolderId);
    }

    // Extract inline photo data to separate IDB store (old format or embedded data)
    _driveProgressUpdate(60, 'Extracting photo data…');
    for (const ph of (p.photos || [])) {
      if (ph.data) {
        if (!ph.thumb) ph.thumb = await _generateThumb(ph.data) || '';
        if (!ph.dataLen) ph.dataLen = ph.data.length;
        await _idbSavePhotoData(ph.id, ph.data);
        ph.data = null;
      }
    }
    for (const f of (p.siteMapFloors || [])) {
      if (f.data || f._data) { await _idbSavePhotoData('sitemap_' + p.id + '_' + f.id, f.data || f._data); delete f.data; delete f._data; }
    }
    if (p.cableRunMap?.image) {
      await _idbSavePhotoData('cablemap_' + p.id, p.cableRunMap.image);
      p.cableRunMap.image = null;
    }

    _driveProgressUpdate(65, 'Saving to local storage…');
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
    _driveProgressUpdate(75, 'Syncing manufacturers & folders…');
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
    _driveProgressUpdate(20, 'Processing project data…');
    let p = null, importedColors = null, importedVendors = null, mediaFolderId = null;
    const parsed = JSON.parse(text);
    if (parsed._netrack_version === 2 && parsed.project) {
      p = parsed.project; importedColors = parsed.typeColors; importedVendors = parsed.globalVendors;
      mediaFolderId = parsed._mediaFolderId;
    } else if (parsed.id && parsed.name) {
      p = parsed;
    } else { throw new Error('Unrecognised file format'); }
    if (!p.id || !p.name) throw new Error('Missing project id or name');
    migrateProject(p);

    // Index photos on Drive (lazy — full data fetched on demand when viewed)
    if (parsed._separateMedia && mediaFolderId) {
      _driveProgressUpdate(30, 'Indexing photos on Drive…');
      await _indexDrivePhotos(p, mediaFolderId);
    }

    // Extract inline photo data to separate IDB store (old format or embedded data)
    _driveProgressUpdate(60, 'Extracting photo data…');
    for (const ph of (p.photos || [])) {
      if (ph.data) {
        if (!ph.thumb) ph.thumb = await _generateThumb(ph.data) || '';
        if (!ph.dataLen) ph.dataLen = ph.data.length;
        await _idbSavePhotoData(ph.id, ph.data);
        ph.data = null;
      }
    }
    for (const f of (p.siteMapFloors || [])) {
      if (f.data || f._data) { await _idbSavePhotoData('sitemap_' + p.id + '_' + f.id, f.data || f._data); delete f.data; delete f._data; }
    }
    if (p.cableRunMap?.image) {
      await _idbSavePhotoData('cablemap_' + p.id, p.cableRunMap.image);
      p.cableRunMap.image = null;
    }

    _driveProgressUpdate(65, 'Saving to local storage…');
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
    _driveProgressUpdate(75, 'Syncing manufacturers & folders…');
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

// ═══════════════════════════════════════════
//  BACKGROUND AUTO-SYNC TO GOOGLE DRIVE
// ═══════════════════════════════════════════
// After the user does at least one manual Google Drive save (which grants an OAuth token),
// the app will silently auto-sync 15s after the last change. Photos upload 3-at-a-time
// in parallel for speed. A small indicator shows sync status — no blocking modals.

let _autoSyncDirty = false;
let _autoSyncTimer = null;
let _autoSyncing = false;
let _gdriveAutoSyncEnabled = false;

// Called from save() in core.js — debounces a background sync 15s after last change
function _gdriveQueueAutoSync() {
  if (!_driveToken || !navigator.onLine) return;
  _autoSyncDirty = true;
  clearTimeout(_autoSyncTimer);
  _autoSyncTimer = setTimeout(_gdriveAutoSync, 15000);
}

// Called when photos are added — triggers sync faster (5s) so the manifest
// gets to Drive quickly even before binaries finish uploading
function _gdriveQueuePhotoSync() {
  if (!_driveToken || !navigator.onLine) return;
  _autoSyncDirty = true;
  clearTimeout(_autoSyncTimer);
  _autoSyncTimer = setTimeout(_gdriveAutoSync, 5000);
}

// Helper: save metadata JSON to Drive (with photo manifest showing sync status)
async function _gdriveSaveMetadata(p, folderId, mediaFolderId) {
  const bundle = _buildMetadataBundle(p, mediaFolderId);
  const content = JSON.stringify(bundle);
  const desc = _projectDescription(p);
  const fileName = p.name.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_') + '_netrack.json';
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
}

async function _gdriveAutoSync() {
  if (_autoSyncing || !_autoSyncDirty || !_driveToken || !navigator.onLine) return;
  const p = getProject();
  if (!p) return;
  _autoSyncing = true;
  _autoSyncDirty = false;
  _showDriveSyncStatus('syncing');

  try {
    const folderId = await _getOrCreateDriveFolder();
    const allPhotos = (p.photos || []).filter(ph => ph.id);
    const floors = p.siteMapFloors || [];
    const floorImgs = [];
    for (const f of floors) { const d = f._data || await _lazyGetPhotoData('sitemap_' + p.id + '_' + f.id); if (d) floorImgs.push({ floor: f, data: d }); }
    const driveMap = _getDriveMap(p.id);
    let mediaFolderId = driveMap.folderId || null;

    // Cable run map image
    let crMapData = null;
    if (p.cableRunMap) {
      crMapData = p.cableRunMap.image || await _lazyGetPhotoData('cablemap_' + p.id);
    }

    // Ensure media folder exists if we have any photos
    if (allPhotos.length > 0 || floorImgs.length > 0 || crMapData) {
      const safeName = p.name.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_');
      if (!mediaFolderId) mediaFolderId = await _getOrCreateSubFolder(folderId, safeName + '_media');
      driveMap.folderId = mediaFolderId;
      _saveDriveMap(p.id, driveMap);
    }

    // ── STEP 1: Save metadata FIRST with photo manifest ──
    // This ensures the backup file always knows about ALL photos,
    // even if the binary upload hasn't happened yet.
    _showDriveSyncStatus('syncing', 'manifest');
    await _gdriveSaveMetadata(p, folderId, mediaFolderId);

    // ── STEP 2: Upload photo binaries in background ──
    let photosChanged = false;
    if (allPhotos.length > 0 || floorImgs.length > 0) {
      const toUpload = allPhotos.filter(ph => {
        const entry = driveMap[ph.id];
        const len = ph.dataLen || 0;
        return !(entry?.driveFileId && entry.dataLen === len && len > 0);
      });

      // Upload in parallel batches of 3 for speed
      const BATCH = 3;
      let uploaded = 0;
      for (let i = 0; i < toUpload.length; i += BATCH) {
        const batch = toUpload.slice(i, i + BATCH);
        await Promise.all(batch.map(async (ph) => {
          try {
            const phData = ph.data || await _lazyGetPhotoData(ph.id);
            if (!phData) return;
            const blob = _dataUrlToBlob(phData);
            const ext = (blob.type.split('/')[1] || 'bin').replace('jpeg', 'jpg');
            const entry = driveMap[ph.id];
            const did = await _driveUploadBlob(mediaFolderId, ph.id + '.' + ext, blob, entry?.driveFileId);
            driveMap[ph.id] = { driveFileId: did, dataLen: phData.length };
            if (!ph.dataLen) ph.dataLen = phData.length;
            uploaded++;
            photosChanged = true;
            _showDriveSyncStatus('syncing', `${uploaded}/${toUpload.length} photos`);
          } catch (e) { console.warn('[AutoSync] Photo upload failed:', ph.id, e.message); }
        }));
      }

      // Upload floor map images if new/changed
      for (const { floor: fl, data: smData } of floorImgs) {
        const smKey = '_siteMap_' + fl.id;
        const smEntry = driveMap[smKey];
        if (!smEntry?.driveFileId || smEntry.dataLen !== smData.length) {
          const blob = _dataUrlToBlob(smData);
          const ext = (blob.type.split('/')[1] || 'bin').replace('jpeg', 'jpg');
          const did = await _driveUploadBlob(mediaFolderId, 'sitemap_' + fl.id + '.' + ext, blob, smEntry?.driveFileId);
          driveMap[smKey] = { driveFileId: did, dataLen: smData.length };
          photosChanged = true;
        }
      }

      // Upload cable run map image if new/changed
      if (crMapData) {
        const crKey = '_cableMap';
        const crEntry = driveMap[crKey];
        if (!crEntry?.driveFileId || crEntry.dataLen !== crMapData.length) {
          _showDriveSyncStatus('syncing', 'cable map');
          const blob = _dataUrlToBlob(crMapData);
          const ext = (blob.type.split('/')[1] || 'bin').replace('jpeg', 'jpg');
          const did = await _driveUploadBlob(mediaFolderId, 'cablemap.' + ext, blob, crEntry?.driveFileId);
          driveMap[crKey] = { driveFileId: did, dataLen: crMapData.length };
          photosChanged = true;
        }
      }

      // Clean up deleted photos from Drive
      const localIds = new Set(allPhotos.map(ph => ph.id));
      const floorKeys = new Set(floors.map(f => '_siteMap_' + f.id));
      for (const [key, entry] of Object.entries(driveMap)) {
        if (key === 'folderId' || key === '_cableMap' || key === '_siteMap' || key.startsWith('_siteMap_')) { if (key.startsWith('_siteMap_') && !floorKeys.has(key) && entry.driveFileId) { await _driveDeleteFile(entry.driveFileId); delete driveMap[key]; photosChanged = true; } continue; }
        if (!localIds.has(key) && entry.driveFileId) {
          await _driveDeleteFile(entry.driveFileId);
          delete driveMap[key];
          photosChanged = true;
        }
      }
      _saveDriveMap(p.id, driveMap);
    }

    // ── STEP 3: Save metadata AGAIN if photos changed (updated sync status) ──
    if (photosChanged) {
      _showDriveSyncStatus('syncing', 'updating manifest');
      await _gdriveSaveMetadata(p, folderId, mediaFolderId);
    }

    await _gdriveSaveManufacturers(folderId);
    await _gdriveSaveFolders(folderId);

    _showDriveSyncStatus('done');

    // If more changes happened during sync, queue another round
    if (_autoSyncDirty) _autoSyncTimer = setTimeout(_gdriveAutoSync, 15000);
  } catch (err) {
    console.warn('[AutoSync] Failed:', err.message);
    if (err.message?.includes('Auth expired')) {
      _driveToken = null;
      _showDriveSyncStatus('auth');
    } else {
      _showDriveSyncStatus('error');
      _autoSyncDirty = true;
      _autoSyncTimer = setTimeout(_gdriveAutoSync, 120000); // retry in 2 min
    }
  } finally {
    _autoSyncing = false;
  }
}

function _showDriveSyncStatus(status, detail) {
  let el = document.getElementById('gdrive-sync-indicator');
  if (!el) {
    el = document.createElement('div');
    el.id = 'gdrive-sync-indicator';
    el.style.cssText = 'position:fixed;bottom:10px;right:10px;font-size:11px;font-family:var(--mono);padding:5px 12px;border-radius:5px;z-index:100;transition:opacity .4s;pointer-events:none;border:1px solid';
    document.body.appendChild(el);
  }
  el.style.opacity = '1';
  el.style.pointerEvents = 'none';
  if (status === 'syncing') {
    el.textContent = '☁ Syncing' + (detail ? ` (${detail})` : '...');
    el.style.background = 'rgba(66,133,244,.12)'; el.style.color = '#4285f4'; el.style.borderColor = 'rgba(66,133,244,.3)';
  } else if (status === 'done') {
    el.textContent = '☁ Synced';
    el.style.background = 'rgba(0,200,122,.12)'; el.style.color = '#00c87a'; el.style.borderColor = 'rgba(0,200,122,.3)';
    setTimeout(() => { el.style.opacity = '0'; }, 3000);
  } else if (status === 'error') {
    el.textContent = '☁ Sync error — will retry';
    el.style.background = 'rgba(255,77,79,.12)'; el.style.color = '#ff4d4f'; el.style.borderColor = 'rgba(255,77,79,.3)';
    setTimeout(() => { el.style.opacity = '0'; }, 5000);
  } else if (status === 'auth') {
    el.textContent = '☁ Token expired — save to Drive to re-auth';
    el.style.background = 'rgba(255,170,0,.12)'; el.style.color = '#ffaa00'; el.style.borderColor = 'rgba(255,170,0,.3)';
    el.style.pointerEvents = 'auto'; el.style.cursor = 'pointer';
    el.onclick = () => { el.style.opacity = '0'; el.style.pointerEvents = 'none'; };
    setTimeout(() => { el.style.opacity = '0'; el.style.pointerEvents = 'none'; }, 8000);
  }
}

// Also sync when user leaves the app / switches tabs
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && _autoSyncDirty && _driveToken) _gdriveAutoSync();
});
