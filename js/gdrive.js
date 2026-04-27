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

// Strip photo binary data from a project for metadata-only JSON
function _stripPhotoData(project) {
  const p = { ...project };
  if (p.photos) p.photos = p.photos.map(({ data, ...rest }) => rest);
  if (p.siteMap) { const { data, ...sm } = p.siteMap; p.siteMap = sm; }
  return p;
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
      const smData = p.siteMap?.data || await _lazyGetPhotoData('sitemap_' + p.id);
      const hasSiteMap = !!smData;
      const totalMedia = allPhotos.length + (hasSiteMap ? 1 : 0);
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

        // Upload site map if new/changed
        if (hasSiteMap) {
          const smEntry = driveMap._siteMap;
          if (!smEntry?.driveFileId || smEntry.dataLen !== smData.length) {
            _driveProgressUpdate(66, 'Uploading site map…');
            const blob = _dataUrlToBlob(smData);
            const ext = (blob.type.split('/')[1] || 'bin').replace('jpeg', 'jpg');
            const did = await _driveUploadBlob(mediaFolderId, 'sitemap.' + ext, blob, smEntry?.driveFileId);
            driveMap._siteMap = { driveFileId: did, dataLen: smData.length };
          }
        }

        // Delete Drive files for locally-deleted photos
        for (const [key, entry] of Object.entries(driveMap)) {
          if (key === 'folderId' || key === '_siteMap') continue;
          if (!localIds.has(key) && entry.driveFileId) {
            await _driveDeleteFile(entry.driveFileId);
            delete driveMap[key];
          }
        }
        _saveDriveMap(p.id, driveMap);
      }

      _driveProgressUpdate(70, 'Saving project metadata…');

      // ── Save metadata JSON (without photo data — photos are separate files) ──
      const stripped = _stripPhotoData(p);
      const bundle = { _netrack_version: 2, _separateMedia: true, _mediaFolderId: mediaFolderId, typeColors: state.typeColors || {}, globalVendors: state.globalVendors || [], project: stripped };
      const content = JSON.stringify(bundle);
      const desc = _projectDescription(p);
      const fileName = p.name.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_') + '_netrack.json';
      const q = encodeURIComponent(`name='${fileName}' and '${folderId}' in parents and trashed=false`);
      const search = await _driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`);
      const { files } = await search.json();
      _driveProgressUpdate(80);
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
          const smD = p.siteMap?.data || await _lazyGetPhotoData('sitemap_' + p.id);
          const hasSM = !!smD;
          const driveMap = _getDriveMap(p.id);
          let mediaFolderId = driveMap.folderId || null;
          if (allPh.length > 0 || hasSM) {
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
            if (hasSM) {
              const smEntry = driveMap._siteMap;
              if (!smEntry?.driveFileId || smEntry.dataLen !== smD.length) {
                const blob = _dataUrlToBlob(smD);
                const ext = (blob.type.split('/')[1] || 'bin').replace('jpeg', 'jpg');
                const did = await _driveUploadBlob(mediaFolderId, 'sitemap.' + ext, blob, smEntry?.driveFileId);
                driveMap._siteMap = { driveFileId: did, dataLen: smD.length };
              }
            }
            for (const [key, entry] of Object.entries(driveMap)) {
              if (key === 'folderId' || key === '_siteMap') continue;
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
  const hasSiteMap = project.siteMap && !project.siteMap.data && fileMap['sitemap'];
  const total = photos.length + (hasSiteMap ? 1 : 0);
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

  // Site map
  if (hasSiteMap) {
    try {
      const f = fileMap['sitemap'];
      const r = await _driveFetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`);
      const blob = await r.blob();
      const smDataUrl = await _blobToDataUrl(blob);
      await _idbSavePhotoData('sitemap_' + project.id, smDataUrl);
      project.siteMap.data = null;
      driveMap._siteMap = { driveFileId: f.id, dataLen: smDataUrl.length };
    } catch(e) {}
    done++;
    if (onProgress) onProgress(100, 'Photos downloaded');
  }
  _saveDriveMap(project.id, driveMap);
}

// Index photos in a Drive media folder without downloading them (lazy loading)
async function _indexDrivePhotos(project, mediaFolderId) {
  const files = await _listDriveFolder(mediaFolderId);
  const driveMap = { folderId: mediaFolderId };
  for (const f of files) {
    const name = f.name.replace(/\.[^.]+$/, '');
    if (name === 'sitemap') {
      driveMap._siteMap = { driveFileId: f.id, dataLen: parseInt(f.size) || 0 };
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
    if (p.siteMap?.data) {
      await _idbSavePhotoData('sitemap_' + p.id, p.siteMap.data);
      p.siteMap.data = null;
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
    if (p.siteMap?.data) {
      await _idbSavePhotoData('sitemap_' + p.id, p.siteMap.data);
      p.siteMap.data = null;
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
// the app will silently auto-sync every 5 minutes and when the tab/app goes to background.

let _autoSyncDirty = false;
let _autoSyncTimer = null;
const AUTO_SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Mark the project as needing a sync whenever local data is saved
const _origSave = typeof save === 'function' ? save : null;
if (_origSave) {
  window.save = function() {
    _origSave.apply(this, arguments);
    _autoSyncDirty = true;
  };
}

// Quiet background sync — no modals, no progress UI
async function _autoSyncToDrive() {
  if (!_autoSyncDirty || !_driveToken || !navigator.onLine) return;
  const p = getProject();
  if (!p) return;
  try {
    const folderId = await _getOrCreateDriveFolder();
    const allPh2 = (p.photos || []).filter(ph => ph.id);
    const smD2 = p.siteMap?.data || await _lazyGetPhotoData('sitemap_' + p.id);
    const hasSM2 = !!smD2;
    const driveMap = _getDriveMap(p.id);
    let mediaFolderId = driveMap.folderId || null;
    if (allPh2.length > 0 || hasSM2) {
      const safeName = p.name.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_');
      if (!mediaFolderId) mediaFolderId = await _getOrCreateSubFolder(folderId, safeName + '_media');
      driveMap.folderId = mediaFolderId;
      for (const ph of allPh2) {
        const entry = driveMap[ph.id];
        const len = ph.dataLen || 0;
        if (entry?.driveFileId && entry.dataLen === len && len > 0) continue;
        const phData = ph.data || await _lazyGetPhotoData(ph.id);
        if (!phData) continue;
        const blob = _dataUrlToBlob(phData);
        const ext = (blob.type.split('/')[1] || 'bin').replace('jpeg', 'jpg');
        const did = await _driveUploadBlob(mediaFolderId, ph.id + '.' + ext, blob, entry?.driveFileId);
        driveMap[ph.id] = { driveFileId: did, dataLen: phData.length };
      }
      if (hasSM2) {
        const smEntry = driveMap._siteMap;
        if (!smEntry?.driveFileId || smEntry.dataLen !== smD2.length) {
          const blob = _dataUrlToBlob(smD2);
          const ext = (blob.type.split('/')[1] || 'bin').replace('jpeg', 'jpg');
          const did = await _driveUploadBlob(mediaFolderId, 'sitemap.' + ext, blob, smEntry?.driveFileId);
          driveMap._siteMap = { driveFileId: did, dataLen: smD2.length };
        }
      }
      _saveDriveMap(p.id, driveMap);
    }
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
    await _gdriveSaveManufacturers(folderId);
    await _gdriveSaveFolders(folderId);
    _autoSyncDirty = false;
    console.log('[AutoSync] Synced to Google Drive');
  } catch (e) {
    console.warn('[AutoSync] Failed:', e.message);
  }
}

// Start the periodic auto-sync timer
function _startAutoSync() {
  if (_autoSyncTimer) return;
  _autoSyncTimer = setInterval(_autoSyncToDrive, AUTO_SYNC_INTERVAL);
}

// Sync when user leaves the app / switches tabs
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') _autoSyncToDrive();
});

// Start timer on load
_startAutoSync();
