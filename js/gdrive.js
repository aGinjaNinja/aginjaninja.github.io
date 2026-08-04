// ═══════════════════════════════════════════
//  GOOGLE DRIVE SYNC
// ═══════════════════════════════════════════

const GDRIVE_CLIENT_ID = '761585225303-f5pe1sfedqoksov4eepkh7o6ijm76v87.apps.googleusercontent.com';
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
  if (!document.querySelector('script[src*="accounts.google.com/gsi/client"]')) {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    document.head.appendChild(s);
  }
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 200));
    if (window.google?.accounts?.oauth2) return true;
  }
  return false;
}

function _initDriveClient() {
  if (_driveTokenClient) return true;
  if (!window.google?.accounts?.oauth2) return false;
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

async function _driveAuth(callback) {
  if (_driveToken) { callback(); return; }

  // Native Android sign-in via Capacitor plugin (if installed)
  if (window.Capacitor?.isNativePlatform?.() && window.Capacitor?.Plugins?.GoogleAuth) {
    try {
      toast('Signing in to Google…', 'info');
      const result = await window.Capacitor.Plugins.GoogleAuth.signIn();
      _driveToken = result.accessToken;
      toast('Signed in to Google Drive', 'success');
      callback();
      return;
    } catch (e) {
      toast('Google sign-in failed: ' + (e.message || e), 'error');
      return;
    }
  }

  // Web: Google Identity Services
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
  _driveTokenClient.requestAccessToken({ prompt: '' });
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

// Write (create or update) a JSON file by name inside a Drive folder
async function _driveWriteJson(folderId, fileName, content, description) {
  const q = encodeURIComponent(`name='${fileName}' and '${folderId}' in parents and trashed=false`);
  const search = await _driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`);
  const { files } = await search.json();
  if (files?.length) {
    await _driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${files[0].id}?uploadType=media`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: content
    });
    if (description) {
      await _driveFetch(`https://www.googleapis.com/drive/v3/files/${files[0].id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description })
      });
    }
    return files[0].id;
  }
  const boundary = 'nrm' + Date.now();
  const meta = JSON.stringify({ name: fileName, parents: [folderId], mimeType: 'application/json', ...(description ? { description } : {}) });
  const body = `--${boundary}\r\nContent-Type: application/json\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
  const r = await _driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body
  });
  return (await r.json()).id;
}

async function _driveDeleteFile(fileId) {
  try { await _driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, { method: 'DELETE' }); } catch(e) {}
}

// Per-project map tracking which media files are already on Drive
function _getDriveMap(projectId) {
  try { return JSON.parse(localStorage.getItem('netrack_drivemap_' + projectId) || '{}'); } catch(e) { return {}; }
}
function _saveDriveMap(projectId, map) {
  try { localStorage.setItem('netrack_drivemap_' + projectId, JSON.stringify(map)); } catch(e) {}
}

function _driveSafeName(p) {
  return p.name.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_');
}

// Strip photo binary data from a project for metadata-only JSON.
// Adds _driveSynced per photo (the "manifest") so the backup shows which
// photos exist but haven't been uploaded yet.
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
  if (p.photoTrash) p.photoTrash = p.photoTrash.map(({ data, _editorSrc, ...rest }) => rest);
  if (p.siteMapFloors) p.siteMapFloors = p.siteMapFloors.map(f => { const { _data, ...rest } = f; return rest; });
  if (p.cableRunMaps) p.cableRunMaps = p.cableRunMaps.map(m => m.image ? { ...m, image: null } : m);
  return p;
}

function _buildMetadataBundle(project, mediaFolderId) {
  const stripped = _stripPhotoData(project, true);
  const totalPhotos = (stripped.photos || []).length;
  const syncedPhotos = (stripped.photos || []).filter(ph => ph._driveSynced).length;
  return {
    _netrack_version: 2,
    _separateMedia: true,
    _mediaFolderId: mediaFolderId,
    _photoManifest: { total: totalPhotos, synced: syncedPhotos, pending: totalPhotos - syncedPhotos, lastSync: new Date().toISOString() },
    typeColors: state.typeColors || {},
    globalVendors: state.globalVendors || [],
    project: stripped
  };
}

function _projectDescription(p) {
  return JSON.stringify({ devices: (p.devices||[]).length, racks: (p.racks||[]).length, photos: (p.photos||[]).length, folderId: p.folderId || '' });
}

// Save the project metadata JSON (with photo manifest) to Drive
async function _gdriveSaveMetadata(p, folderId, mediaFolderId) {
  const bundle = _buildMetadataBundle(p, mediaFolderId);
  await _driveWriteJson(folderId, _driveSafeName(p) + '_netrack.json', JSON.stringify(bundle), _projectDescription(p));
}

// ═══════════════════════════════════════════
//  MEDIA SYNC — the single upload path used by
//  manual save, save-all, and background auto-sync
// ═══════════════════════════════════════════
// Uploads new/changed media (photos + legacy site-map/cable-map images) to the
// project's *_media folder, deletes Drive files for locally-removed media, and
// updates the drive map. Returns { mediaFolderId, changed }.
async function _syncProjectMedia(p, folderId, onProgress) {
  const driveMap = _getDriveMap(p.id);
  let mediaFolderId = driveMap.folderId || null;
  let changed = false;

  // Gather all media: photos + legacy floor plans + legacy cable maps
  const allPhotos = (p.photos || []).filter(ph => ph.id);
  const extras = []; // { key, fileBase, data }
  for (const f of (p.siteMapFloors || [])) {
    const d = f._data || await _lazyGetPhotoData('sitemap_' + p.id + '_' + f.id);
    if (d) extras.push({ key: '_siteMap_' + f.id, fileBase: 'sitemap_' + f.id, data: d });
  }
  for (const m of (p.cableRunMaps || [])) {
    const d = m.image || await _lazyGetPhotoData('cablemap_' + p.id + '_' + m.id);
    if (d) extras.push({ key: '_cableMap_' + m.id, fileBase: 'cablemap_' + m.id, data: d });
  }

  if (allPhotos.length === 0 && extras.length === 0) return { mediaFolderId, changed };

  if (!mediaFolderId) mediaFolderId = await _getOrCreateSubFolder(folderId, _driveSafeName(p) + '_media');
  driveMap.folderId = mediaFolderId;
  _saveDriveMap(p.id, driveMap);

  // Photos needing upload (skip unchanged by dataLen)
  const toUpload = allPhotos.filter(ph => {
    const entry = driveMap[ph.id];
    const len = ph.dataLen || 0;
    return !(entry?.driveFileId && entry.dataLen === len && len > 0);
  });
  const total = toUpload.length + extras.length;
  let done = 0;

  // Upload photos, 3 at a time
  const queue = [...toUpload];
  async function worker() {
    while (queue.length > 0) {
      const ph = queue.shift();
      try {
        const phData = ph.data || await _lazyGetPhotoData(ph.id);
        if (!phData) continue;
        const blob = _dataUrlToBlob(phData);
        const ext = (blob.type.split('/')[1] || 'bin').replace('jpeg', 'jpg');
        const entry = driveMap[ph.id];
        const did = await _driveUploadBlob(mediaFolderId, ph.id + '.' + ext, blob, entry?.driveFileId);
        driveMap[ph.id] = { driveFileId: did, dataLen: phData.length };
        if (!ph.dataLen) ph.dataLen = phData.length;
        changed = true;
      } catch (e) { console.warn('[Drive] Photo upload failed:', ph.id, e.message); }
      done++;
      if (onProgress) onProgress(done, total, `photo ${done}/${total}`);
    }
  }
  await Promise.all(Array(Math.min(3, queue.length || 1)).fill(null).map(() => worker()));

  // Upload legacy map images if new/changed
  for (const ex of extras) {
    const entry = driveMap[ex.key];
    if (!entry?.driveFileId || entry.dataLen !== ex.data.length) {
      try {
        const blob = _dataUrlToBlob(ex.data);
        const ext = (blob.type.split('/')[1] || 'bin').replace('jpeg', 'jpg');
        const did = await _driveUploadBlob(mediaFolderId, ex.fileBase + '.' + ext, blob, entry?.driveFileId);
        driveMap[ex.key] = { driveFileId: did, dataLen: ex.data.length };
        changed = true;
      } catch (e) { console.warn('[Drive] Media upload failed:', ex.fileBase, e.message); }
    }
    done++;
    if (onProgress) onProgress(done, total, ex.fileBase);
  }

  // Delete Drive files for locally-removed media. Photos sitting in the
  // 30-day trash keep their Drive copies — they're only removed here once
  // the trash purges (or is emptied) and they leave photoTrash too.
  const localIds = new Set([...allPhotos, ...(p.photoTrash || [])].map(ph => ph.id).filter(Boolean));
  const floorKeys = new Set((p.siteMapFloors || []).map(f => '_siteMap_' + f.id));
  const crMapKeys = new Set((p.cableRunMaps || []).map(m => '_cableMap_' + m.id));
  for (const [key, entry] of Object.entries(driveMap)) {
    if (key === 'folderId') continue;
    if (key === '_siteMap' || key === '_cableMap') continue; // legacy single-map keys — leave
    if (key.startsWith('_siteMap_')) { if (!floorKeys.has(key) && entry.driveFileId) { await _driveDeleteFile(entry.driveFileId); delete driveMap[key]; changed = true; } continue; }
    if (key.startsWith('_cableMap_')) { if (!crMapKeys.has(key) && entry.driveFileId) { await _driveDeleteFile(entry.driveFileId); delete driveMap[key]; changed = true; } continue; }
    if (!localIds.has(key) && entry.driveFileId) {
      await _driveDeleteFile(entry.driveFileId);
      delete driveMap[key];
      changed = true;
    }
  }
  _saveDriveMap(p.id, driveMap);
  return { mediaFolderId, changed };
}

// ═══════════════════════════════════════════
//  PROGRESS MODALS
// ═══════════════════════════════════════════
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

// ═══════════════════════════════════════════
//  SAVE / SAVE ALL / LOAD / OPEN
// ═══════════════════════════════════════════
async function gdriveSave() {
  const p = getProject();
  if (!p) return toast('No project open', 'error');
  _driveAuth(async () => {
    _driveProgressModal('☁ Saving to Google Drive', `Uploading "${esc(p.name)}"…`);
    try {
      await snapshotProject(p, 'before Drive save');
      const folderId = await _getOrCreateDriveFolder();
      _driveProgressUpdate(5);
      const { mediaFolderId } = await _syncProjectMedia(p, folderId, (done, total, label) => {
        _driveProgressUpdate(5 + (total ? (done / total) * 80 : 80), `Uploading ${label}…`);
      });
      _driveProgressUpdate(90, 'Saving project metadata…');
      await _gdriveSaveMetadata(p, folderId, mediaFolderId);
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
      for (let i = 0; i < state.projects.length; i++) {
        const p = state.projects[i];
        _driveProgressUpdate(5 + (i / total) * 90, `Saving "${esc(p.name)}" (${i + 1} of ${total})…`);
        try {
          await snapshotProject(p, 'before Drive save (all)');
          const { mediaFolderId } = await _syncProjectMedia(p, folderId);
          await _gdriveSaveMetadata(p, folderId, mediaFolderId);
          saved++;
        } catch (err) { failed++; }
      }
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
      const q = encodeURIComponent(`'${folderId}' in parents and name contains '_netrack.json' and trashed=false`);
      const r = await _driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime,size)&orderBy=modifiedTime+desc`);
      const { files } = await r.json();
      if (!files?.length) return toast('No NetRackManager files found in Google Drive.', 'error');

      _driveLoadFiles = files.map(f => f.id);
      openModal(`
        <h3>☁ Load from Google Drive</h3>
        <p style="font-size:13px;color:var(--text2);margin-bottom:14px">
          Tap a project to open it — or check several and add them all at once.
        </p>
        <div style="display:flex;flex-direction:column;gap:6px;max-height:48vh;overflow-y:auto">
          ${files.map(f => {
            const label = f.name.replace(/_netrack\.json$/,'').replace(/_/g,' ');
            const date  = new Date(f.modifiedTime).toLocaleString();
            const size  = f.size ? (f.size >= 1024000 ? (f.size/1048576).toFixed(1)+' MB' : (f.size/1024).toFixed(0)+' KB') : '';
            return `<div onclick="openDriveProject('${f.id}')"
              style="display:flex;align-items:center;gap:11px;padding:10px 12px;background:var(--card2);border:1px solid var(--border2);border-radius:6px;cursor:pointer;transition:border-color .15s"
              onmouseover="this.style.borderColor='var(--accent)'"
              onmouseout="this.style.borderColor='var(--border2)'">
              <input type="checkbox" class="gdl-check" data-id="${f.id}" onclick="event.stopPropagation()" onchange="_gdlCount()"
                style="width:19px;height:19px;accent-color:var(--accent);flex-shrink:0;margin:0">
              <div style="min-width:0">
                <div style="font-size:13px;font-weight:600;color:var(--text)">${esc(label)}</div>
                <div style="font-size:11px;color:var(--text3);margin-top:3px;font-family:var(--mono)">
                  Modified: ${esc(date)}${size ? ' · ' + size : ''}
                </div>
              </div>
            </div>`;
          }).join('')}
        </div>
        <div class="modal-actions">
          <button class="btn btn-ghost btn-sm" onclick="closeModal()">Cancel</button>
          <button class="btn btn-ghost btn-sm" onclick="driveAddAll()">⇩ Add All (${files.length})</button>
          <button class="btn btn-primary btn-sm" id="gdl-add-btn" onclick="driveAddChecked()">⇩ Add Checked</button>
        </div>
      `, '500px');
    } catch (err) { toast('Drive load failed: ' + err.message, 'error'); }
  });
}

// ── Multi-add from the Drive list ──
let _driveLoadFiles = [];

function _gdlChecked() {
  return [...document.querySelectorAll('.gdl-check:checked')].map(c => c.dataset.id);
}

function _gdlCount() {
  const btn = document.getElementById('gdl-add-btn');
  const n = _gdlChecked().length;
  if (btn) btn.textContent = n ? `⇩ Add Checked (${n})` : '⇩ Add Checked';
}

function driveAddChecked() {
  const ids = _gdlChecked();
  if (!ids.length) return toast('Check at least one project first', 'error');
  _driveAddProjects(ids);
}

function driveAddAll() {
  if (!_driveLoadFiles.length) return;
  _driveAddProjects([..._driveLoadFiles]);
}

// Download several projects and add them locally without opening them
async function _driveAddProjects(ids) {
  const n = ids.length;
  _driveProgressModal('☁ Adding Projects', `Downloading ${n} project${n !== 1 ? 's' : ''}…`);
  let added = 0, updated = 0, failed = 0;
  const names = [];
  for (let i = 0; i < n; i++) {
    const base = (i / n) * 100;
    try {
      const { project, replaced } = await _driveFetchAndStoreProject(ids[i], (pct, msg) =>
        _driveProgressUpdate(base + pct / n, `(${i + 1} of ${n}) ${msg}`));
      if (replaced) updated++; else added++;
      names.push(project.name);
    } catch (e) { failed++; console.warn('[Drive] Add failed:', ids[i], e.message); }
  }
  save();
  if (typeof renderProjects === 'function') renderProjects();
  _driveProgressUpdate(100);
  const parts = [];
  if (added) parts.push(`${added} added`);
  if (updated) parts.push(`${updated} updated from Drive`);
  if (failed) parts.push(`${failed} failed`);
  _driveDoneModal(failed && !added && !updated ? 'Add Failed' : 'Projects Added',
    `${parts.join(' · ')}${names.length ? '<br><span style="color:var(--text3);font-size:12px">' + names.map(esc).join(', ') + '</span>' : ''}`,
    failed && !added && !updated ? 'error' : undefined);
}

// Index media files in a Drive media folder without downloading (lazy loading —
// _lazyGetPhotoData in core.js fetches individual files on demand)
async function _indexDrivePhotos(project, mediaFolderId) {
  const files = await _listDriveFolder(mediaFolderId);
  const driveMap = { folderId: mediaFolderId };
  for (const f of files) {
    const name = f.name.replace(/\.[^.]+$/, '');
    if (name === 'cablemap') {
      driveMap['_cableMap'] = { driveFileId: f.id, dataLen: parseInt(f.size) || 0 };
    } else if (name.startsWith('cablemap_')) {
      driveMap['_cableMap_' + name.slice(9)] = { driveFileId: f.id, dataLen: parseInt(f.size) || 0 };
    } else if (name === 'sitemap' || name.startsWith('sitemap_')) {
      const smKey = name === 'sitemap' ? '_siteMap' : '_siteMap_' + name.slice(8);
      driveMap[smKey] = { driveFileId: f.id, dataLen: parseInt(f.size) || 0 };
    } else {
      driveMap[name] = { driveFileId: f.id, dataLen: parseInt(f.size) || 0 };
    }
  }
  _saveDriveMap(project.id, driveMap);
}

// Download one Drive metadata file, migrate it, and store it locally (state +
// IDB + colors/vendors merge). No modal, no save(), no open — callers do that.
// onStep(pct 0-100, message) reports progress. Returns { project, replaced }.
async function _driveFetchAndStoreProject(driveFileId, onStep) {
  const step = onStep || (() => {});
  step(10, 'Fetching from Google Drive…');
  const r = await _driveFetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`);
  const text = await r.text();
  step(25, 'Processing project data…');
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
    step(40, 'Indexing photos on Drive…');
    await _indexDrivePhotos(p, mediaFolderId);
  }

  // Extract any inline media to the IDB store (old format or embedded data)
  step(60, 'Extracting photo data…');
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
  for (const crm of (p.cableRunMaps || [])) {
    if (crm.image) { await _idbSavePhotoData('cablemap_' + p.id + '_' + crm.id, crm.image); crm.image = null; }
  }

  step(80, 'Saving to local storage…');
  await _idbSaveProject(p);
  const existing = state.projects.findIndex(x => x.id === p.id);
  const replaced = existing >= 0;
  if (replaced) { await snapshotProject(state.projects[existing], 'before Drive load replaced it'); state.projects[existing] = p; }
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
  return { project: p, replaced };
}

// Downloads one project from Drive, saves it locally, and opens it
async function openDriveProject(driveFileId) {
  if (!_driveToken) {
    _driveAuth(() => openDriveProject(driveFileId));
    return;
  }
  _driveProgressModal('☁ Downloading Project', 'Fetching project from Google Drive…');
  try {
    const { project } = await _driveFetchAndStoreProject(driveFileId, _driveProgressUpdate);
    save();
    _driveProgressUpdate(100, 'Opening project…');
    closeModal();
    openProject(project.id);
  } catch (err) {
    _driveDoneModal('Download Failed', 'Error: ' + esc(err.message), 'error');
  }
}

// ═══════════════════════════════════════════
//  BACKGROUND AUTO-SYNC
// ═══════════════════════════════════════════
// After one manual Drive save (which grants the OAuth token), the app silently
// auto-syncs 15s after the last change. Photo adds trigger a faster 5s sync so
// the manifest reaches Drive before binaries finish.

let _autoSyncDirty = false;
let _autoSyncTimer = null;
let _autoSyncing = false;

// Called from save() in core.js
function _gdriveQueueAutoSync() {
  if (!_driveToken || !navigator.onLine) return;
  _autoSyncDirty = true;
  clearTimeout(_autoSyncTimer);
  _autoSyncTimer = setTimeout(_gdriveAutoSync, 15000);
}

// Called when photos are added
function _gdriveQueuePhotoSync() {
  if (!_driveToken || !navigator.onLine) return;
  _autoSyncDirty = true;
  clearTimeout(_autoSyncTimer);
  _autoSyncTimer = setTimeout(_gdriveAutoSync, 5000);
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
    const driveMap = _getDriveMap(p.id);

    // STEP 1: metadata first (manifest lists all photos even before binaries land)
    _showDriveSyncStatus('syncing', 'manifest');
    await _gdriveSaveMetadata(p, folderId, driveMap.folderId || null);

    // STEP 2: media binaries
    const { mediaFolderId, changed } = await _syncProjectMedia(p, folderId, (done, total) => {
      _showDriveSyncStatus('syncing', `${done}/${total} files`);
    });

    // STEP 3: metadata again if media changed (updated sync status)
    if (changed) {
      _showDriveSyncStatus('syncing', 'updating manifest');
      await _gdriveSaveMetadata(p, folderId, mediaFolderId);
    }

    _showDriveSyncStatus('done');
    if (_autoSyncDirty) _autoSyncTimer = setTimeout(_gdriveAutoSync, 15000);
  } catch (err) {
    console.warn('[AutoSync] Failed:', err.message);
    if (err.message?.includes('Auth expired')) {
      _driveToken = null;
      _showDriveSyncStatus('auth');
    } else {
      _showDriveSyncStatus('error');
      _autoSyncDirty = true;
      _autoSyncTimer = setTimeout(_gdriveAutoSync, 120000);
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
    el.style.cssText = 'position:fixed;top:calc(6px + env(safe-area-inset-top, 0px));left:10px;font-size:11px;font-family:var(--mono);padding:5px 12px;border-radius:5px;z-index:100;transition:opacity .4s;pointer-events:none;border:1px solid;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)';
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

// Flush pending sync when the user leaves the app / switches tabs
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && _autoSyncDirty && _driveToken) _gdriveAutoSync();
});
