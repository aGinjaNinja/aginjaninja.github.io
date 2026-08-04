// ═══════════════════════════════════════════
//  CORE — Shared state, constants, persistence
// ═══════════════════════════════════════════

const LOGO_URI = "img/logo.jpg";

// Generate a small thumbnail from a data URL via offscreen canvas
function _generateThumb(dataUrl, maxW = 800) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

const DEVICE_TYPES = [
  'Modem','Router','Firewall','Switch','Patch Panel','Fiber Enclosure','AP','Server',
  'PC/Workstation','IP Phone','IP Camera','Access Control',
  'NAS','IoT Device','Printer','Fax Machine',
  'Smartphone/Tablet','APC/UPS','Misc.','Misc Rack-Mounted','Other'
];

const RACK_MOUNTABLE = new Set([
  'Modem','Router','Firewall','Switch','Patch Panel','Fiber Enclosure','Server','NAS','Access Control','APC/UPS','Misc Rack-Mounted'
]);

const PORT_CAPABLE = new Set([
  'Switch','Patch Panel','Fiber Enclosure','Router','Firewall','Server','NAS','Misc Rack-Mounted','Modem'
]);

// Panel-style devices: faceplate rendering + "patched to" semantics
const PANEL_LIKE = t => t === 'Patch Panel' || t === 'Fiber Enclosure';

// Standard 12-strand fiber color code (TIA-598)
const FIBER_COLORS = ['Blue','Orange','Green','Brown','Slate','White','Red','Black','Yellow','Violet','Rose','Aqua'];
const FIBER_HEX = {
  Blue:'#0a6cff', Orange:'#ff7a00', Green:'#00a344', Brown:'#8b5a2b',
  Slate:'#7d8a99', White:'#e8e8e8', Red:'#ff2b2b', Black:'#101010',
  Yellow:'#ffe600', Violet:'#8a2be2', Rose:'#ff8fb1', Aqua:'#00dcdc'
};
function fiberGrad(pair) {
  const [a, b] = String(pair || '').split('/');
  return `linear-gradient(90deg, ${FIBER_HEX[a] || '#555'} 50%, ${FIBER_HEX[b] || '#555'} 50%)`;
}
function fiberDotHtml(pair) {
  return `<span class="fiber-dot" style="background:${fiberGrad(pair)}" title="Fiber ${esc(pair)}"></span>`;
}

// Monochrome camera glyph — replaces the color 📷/📸 emoji so it inherits the
// surrounding text color exactly like the other line icons (⌂ ◈ ▤ ⊡).
const CAM_SVG = `<svg class="cam-ico" viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="M9.2 4c-.67 0-1.3.34-1.66.9L6.8 6H5a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V9a3 3 0 0 0-3-3h-1.8l-.74-1.1A2 2 0 0 0 14.8 4H9.2zM12 8.6a4.4 4.4 0 1 1 0 8.8 4.4 4.4 0 0 1 0-8.8zm0 2a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8z"/></svg>`;

const DEFAULT_TYPE_COLORS = {
  'Modem':           '#ff6b35',
  'Router':          '#00c8ff',
  'Firewall':        '#ff4455',
  'Switch':          '#00e87a',
  'Patch Panel':     '#e8a020',
  'Fiber Enclosure': '#ff44cc',
  'AP':              '#aa44ff',
  'Server':          '#4488ff',
  'PC/Workstation':  '#ffcc00',
  'IP Phone':        '#44ddaa',
  'IP Camera':       '#ff88bb',
  'Access Control':  '#ffdd44',
  'NAS':             '#8866ff',
  'IoT Device':      '#44ffcc',
  'Printer':         '#ff9933',
  'Fax Machine':     '#cc99ff',
  'Smartphone/Tablet': '#33ccff',
  'APC/UPS':         '#ffee44',
  'Misc.':           '#778899',
  'Misc Rack-Mounted': '#aabbcc',
  'Other':           '#c9a66b',
  'Uplink':          '#c8ff00'   // port-type override only, not a device type
};

function dtColor(deviceType) {
  return (state.typeColors && state.typeColors[deviceType]) || DEFAULT_TYPE_COLORS[deviceType] || '#778899';
}

function dtBadge(deviceType) {
  const c = dtColor(deviceType);
  const bg = c + '22';
  return `<span class="dt-badge" style="background:${bg};border-color:${c}40;color:${c}"><span class="dt-dot" style="background:${c}"></span>${esc(deviceType||'Misc.')}</span>`;
}

const STATUS_COLORS = { verified:'#00e87a', 'needs-label':'#ffaa00', 'needs-attention':'#ff4455', unknown:'#778899', decommission:'#445566' };
const STATUS_LABELS = { verified:'Verified', 'needs-label':'Needs Label', 'needs-attention':'Needs Attention', unknown:'Unknown', decommission:'Decommission' };

function statusBadge(status) {
  if (!status) return '';
  const c = STATUS_COLORS[status] || '#778899';
  const lbl = STATUS_LABELS[status] || status;
  const extraStyle = status === 'decommission' ? 'text-decoration:line-through;' : '';
  return `<span class="status-badge" style="background:${c}18;border:1px solid ${c}44;color:${c};${extraStyle}">${esc(lbl)}</span>`;
}

function migrateDevice(d) {
  if (!d.deviceType) {
    d.deviceType = d.type === 'switching' ? 'Switch' : 'Misc.';
  }
  if (!d.portAssignments) d.portAssignments = {};
  if (!d.portNotes) d.portNotes = {};
  if (!d.portVlans) d.portVlans = {};
  if (!d.portPeerPort) d.portPeerPort = {};
  if (!d.portPoe) d.portPoe = {};
  if (!d.portLabels) d.portLabels = {};
  if (!d.portEndDevice) d.portEndDevice = {};
  if (!d.portFiber) d.portFiber = {};
  if (!d.portTypeOverride) d.portTypeOverride = {};
  if (!d.ipHistory) d.ipHistory = [];
  if (d.parentDeviceId === undefined) d.parentDeviceId = null;
  if (!d.deviceUHeight) d.deviceUHeight = 1;
  if (d.status === undefined) d.status = '';
  if (!d.addedDate) d.addedDate = '';
  return d;
}

// ═══════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════
let state = {
  projects: [],
  currentProjectId: null,
  currentView: 'dashboard',
  dragDevice: null,
  dragFromRack: null,
  selectedSwitch: null,
  typeColors: {},
  searchDebounce: null,
  deviceStatusFilter: 'all',
  cableTypeFilter: 'all',
  cableRoomFilter: '',
  globalVendors: []
};

// Additive migration — old project files always load; unknown fields ride along untouched.
function migrateProject(p) {
  if (!p.devices) p.devices = [];
  if (!p.racks) p.racks = [];
  if (!p.changelog) p.changelog = [];
  if (!p.siteNotes) p.siteNotes = [];
  if (!p.company) p.company = '';
  if (!p.location) p.location = '';
  if (!p.contactMgmt) p.contactMgmt = '';
  if (!p.contactIT) p.contactIT = '';
  if (!p.photos) p.photos = [];
  if (!p.photoFolders) p.photoFolders = [];
  if (!p.cableRuns) p.cableRuns = [];
  // Legacy structural migrations kept so media in old files survives export/import cycles,
  // even though the site-map and cable-map views were removed.
  if (p.cableRunMap && !p.cableRunMaps) {
    const mapId = genId();
    const hasContent = p.cableRunMap.image || (p.cableRunMap.paths||[]).length > 0 || (p.cableRunMap.symbols||[]).length > 0;
    if (hasContent) {
      p.cableRunMaps = [{ id: mapId, name: 'Cable Run Map', image: null, thumb: p.cableRunMap.thumb || null, paths: p.cableRunMap.paths || [], symbols: p.cableRunMap.symbols || [] }];
      p._crLegacyMapId = mapId;
    } else {
      p.cableRunMaps = [];
    }
    delete p.cableRunMap;
  }
  if (!p.cableRunMaps) p.cableRunMaps = [];
  if (p.siteMap && !p.siteMapFloors) {
    const floorId = genId();
    p.siteMapFloors = [{ id: floorId, name: 'Floor 1', markers: p.siteMap.markers || [], cableLines: p.siteMap.cableLines || [] }];
    p._smLegacyFloorId = floorId;
    delete p.siteMap;
  }
  if (!p.siteMapFloors) p.siteMapFloors = [];
  if (p.folderId === undefined) p.folderId = '';
  // Deletion safety net: trashed items are kept 30 days, then purged for good
  if (!p.photoTrash) p.photoTrash = [];
  if (!p.deviceTrash) p.deviceTrash = [];
  const trashCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  p.photoTrash = p.photoTrash.filter(ph => {
    const keep = new Date(ph.deletedAt || 0).getTime() > trashCutoff;
    if (!keep && ph.id) _idbDeletePhotoData(ph.id).catch(() => {});
    return keep;
  });
  p.deviceTrash = p.deviceTrash.filter(d => new Date(d.deletedAt || 0).getTime() > trashCutoff);
  p.racks.forEach(r => { if (!r.uDirection) r.uDirection = 'desc'; });
  p.devices.forEach(migrateDevice);
  return p;
}

// Serializable copy without the heavy binaries — those live in the photoData
// store keyed by photo id / sitemap_<proj>_<floor>, which we keep alongside.
function _liteProject(p) {
  const lite = { ...p };
  if (lite.photos) lite.photos = lite.photos.map(ph => ph.data ? { ...ph, data: null } : ph);
  if (lite.photoTrash) lite.photoTrash = lite.photoTrash.map(ph => ph.data ? { ...ph, data: null } : ph);
  if (lite.siteMapFloors) lite.siteMapFloors = lite.siteMapFloors.map(f => { const { _data, data, ...rest } = f; return rest; });
  if (lite.cableRunMaps) lite.cableRunMaps = lite.cableRunMaps.map(m => m.image ? { ...m, image: null } : m);
  return lite;
}

// Log an IP change on a device (newest first). The first time a device's IP
// changes, the previous address is seeded in first so the chain is complete.
// The caller still assigns d.ip afterwards.
function recordIpChange(d, newIp, src, ts) {
  const oldIp = (d.ip || '').trim();
  const next = (newIp || '').trim();
  if (next === oldIp) return false;
  if (!d.ipHistory) d.ipHistory = [];
  if (oldIp && d.ipHistory.length === 0) {
    d.ipHistory.unshift({ ip: oldIp, ts: d.addedDate || '', src: 'first recorded' });
  }
  d.ipHistory.unshift({ ip: next, ts: ts || new Date().toISOString(), src: src || 'edit' });
  if (d.ipHistory.length > 50) d.ipHistory.length = 50;
  return true;
}

// ─── Safety snapshots — taken before Drive saves/loads and imports (last 5) ───
async function snapshotProject(p, reason) {
  try {
    const key = 'snapshots_' + p.id;
    const list = (await _idbGetConfig(key)) || [];
    list.unshift({ ts: new Date().toISOString(), reason: reason || '', data: JSON.stringify(_liteProject(p)) });
    while (list.length > 5) list.pop();
    await _idbSaveConfig(key, list);
  } catch (e) { console.warn('Snapshot failed', e); }
}

// ═══════════════════════════════════════════
//  PROJECT TRASH — a deleted project keeps its
//  full record AND its photo blobs for 30 days
// ═══════════════════════════════════════════
const TRASH_DAYS = 30;

// Every photoData key this project owns (photos, its own trashed photos,
// floor-plan images, legacy cable maps) — kept on trash, purged on erase.
function _projectPhotoKeys(p) {
  const keys = (p.photos || []).map(ph => ph.id).filter(Boolean);
  (p.photoTrash || []).forEach(ph => { if (ph.id) keys.push(ph.id); });
  (p.siteMapFloors || []).forEach(f => keys.push('sitemap_' + p.id + '_' + f.id));
  (p.cableRunMaps || []).forEach(m => keys.push('cablemap_' + p.id + '_' + m.id));
  keys.push('sitemap_' + p.id, 'cablemap_' + p.id); // legacy single-map keys
  return keys;
}

async function _loadProjectTrash() {
  try { return (await _idbGetConfig('projectTrash')) || []; } catch (e) { return []; }
}
async function _saveProjectTrash(list) {
  try { await _idbSaveConfig('projectTrash', list); } catch (e) { console.warn('Project trash save failed', e); }
}

async function trashProject(p) {
  const list = await _loadProjectTrash();
  list.unshift({
    id: p.id,
    name: p.name,
    deletedAt: new Date().toISOString(),
    counts: { devices: (p.devices || []).length, racks: (p.racks || []).length, photos: (p.photos || []).length },
    photoIds: _projectPhotoKeys(p),
    data: JSON.stringify(_liteProject(p))
  });
  await _saveProjectTrash(list);
}

// Erase one trashed project for good — its photos/maps go with it
async function purgeTrashedProject(id) {
  const list = await _loadProjectTrash();
  const entry = list.find(t => t.id === id);
  if (!entry) return;
  for (const key of (entry.photoIds || [])) {
    try { await _idbDeletePhotoData(key); } catch (e) {}
  }
  try { await _idbSaveConfig('snapshots_' + id, []); } catch (e) {}
  await _saveProjectTrash(list.filter(t => t.id !== id));
}

// Boot sweep: anything past the 30-day window is erased
async function purgeExpiredProjectTrash() {
  const list = await _loadProjectTrash();
  const cutoff = Date.now() - TRASH_DAYS * 86400000;
  const expired = list.filter(t => new Date(t.deletedAt || 0).getTime() <= cutoff);
  for (const t of expired) await purgeTrashedProject(t.id);
}

function logChange(msg) {
  const p = getProject();
  if (!p) return;
  if (!p.changelog) p.changelog = [];
  p.changelog.unshift({ ts: new Date().toISOString(), msg });
  // Lifetime history — at typical field usage (~60 entries/month) this cap is
  // ~35 years; it exists only as a runaway guard. IDB and Drive carry the
  // size comfortably; the localStorage fallback stores a trimmed copy instead.
  if (p.changelog.length > 25000) p.changelog.length = 25000;
}

function genId() {
  return 'id_' + Math.random().toString(36).substr(2, 9);
}

// ─── IndexedDB Storage (primary — effectively unlimited quota) ───
let _idbInstance = null;

function _idbOpen() {
  if (_idbInstance) return Promise.resolve(_idbInstance);
  return new Promise((res, rej) => {
    const req = indexedDB.open('netrack_projects', 2);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('config')) db.createObjectStore('config');
      if (!db.objectStoreNames.contains('photoData')) db.createObjectStore('photoData', { keyPath: 'id' });
    };
    req.onsuccess = e => { _idbInstance = e.target.result; res(_idbInstance); };
    req.onerror = () => rej(req.error);
    req.onblocked = () => { console.warn('IDB blocked — close other tabs'); };
  });
}

async function _idbSaveProject(project) {
  const db = await _idbOpen();
  // Strip heavy binary data — photos live in the separate 'photoData' store
  const lite = { ...project };
  if (lite.photos) lite.photos = lite.photos.map(ph => ph.data ? { ...ph, data: null } : ph);
  if (lite.siteMapFloors) lite.siteMapFloors = lite.siteMapFloors.map(f => { const { _data, ...rest } = f; return rest; });
  if (lite.cableRunMaps) lite.cableRunMaps = lite.cableRunMaps.map(m => m.image ? { ...m, image: null } : m);
  return new Promise((res, rej) => {
    const tx = db.transaction('projects', 'readwrite');
    tx.objectStore('projects').put(lite);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error || new Error('IDB transaction aborted'));
  });
}

async function _idbDeleteProject(id) {
  const db = await _idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction('projects', 'readwrite');
    tx.objectStore('projects').delete(id);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

async function _idbLoadAllProjects() {
  const db = await _idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction('projects', 'readonly');
    const req = tx.objectStore('projects').getAll();
    req.onsuccess = () => res(req.result || []);
    req.onerror = () => rej(req.error);
  });
}

async function _idbSaveConfig(key, value) {
  const db = await _idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction('config', 'readwrite');
    tx.objectStore('config').put(value, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

async function _idbGetConfig(key) {
  const db = await _idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction('config', 'readonly');
    const req = tx.objectStore('config').get(key);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

// ─── Photo Data Store (separate from project metadata for performance) ───

async function _idbSavePhotoData(id, dataUrl) {
  const db = await _idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction('photoData', 'readwrite');
    tx.objectStore('photoData').put({ id, data: dataUrl });
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

async function _idbGetPhotoData(id) {
  const db = await _idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction('photoData', 'readonly');
    const req = tx.objectStore('photoData').get(id);
    req.onsuccess = () => res(req.result?.data || null);
    req.onerror = () => rej(req.error);
  });
}

// Lazy photo loader: tries IDB first, falls back to Google Drive on demand
async function _lazyGetPhotoData(id) {
  const data = await _idbGetPhotoData(id);
  if (data) return data;
  if (typeof _driveToken === 'undefined' || !_driveToken || typeof _driveFetch !== 'function' || typeof _getDriveMap !== 'function') return null;
  let projectId, mapKey;
  if (id.startsWith('sitemap_')) {
    const rest = id.slice(8);
    const secondId = rest.indexOf('_id_', 3);
    if (secondId > 0) { projectId = rest.slice(0, secondId); mapKey = '_siteMap_' + rest.slice(secondId + 1); }
    else { projectId = rest; mapKey = '_siteMap'; }
  }
  else if (id.startsWith('cablemap_')) {
    const rest = id.slice(9);
    const idParts = rest.split('_id_');
    if (idParts.length > 1) { projectId = idParts[0]; mapKey = '_cableMap_id_' + idParts[1]; }
    else { projectId = rest; mapKey = '_cableMap'; }
  }
  else { const p = getProject(); if (!p) return null; projectId = p.id; mapKey = id; }
  const driveMap = _getDriveMap(projectId);
  const entry = driveMap[mapKey];
  if (!entry?.driveFileId) return null;
  try {
    const r = await _driveFetch(`https://www.googleapis.com/drive/v3/files/${entry.driveFileId}?alt=media`);
    const blob = await r.blob();
    const fetched = await new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result);
      reader.onerror = rej;
      reader.readAsDataURL(blob);
    });
    await _idbSavePhotoData(id, fetched);
    return fetched;
  } catch (e) {
    console.warn('Drive photo fetch failed:', id, e);
    return null;
  }
}

async function _idbDeletePhotoData(id) {
  const db = await _idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction('photoData', 'readwrite');
    tx.objectStore('photoData').delete(id);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

// ─── Persistence ───
let _autoBackupTimer = null;

function save() {
  // Primary: fire-and-forget async write to IndexedDB
  Promise.all(state.projects.map(p => _idbSaveProject(p)))
    .catch(e => console.warn('IDB save error:', e));
  _idbSaveConfig('typeColors', state.typeColors).catch(() => {});
  _idbSaveConfig('globalVendors', state.globalVendors).catch(() => {});

  // Secondary: localStorage fallback (may fail if full — fine, IDB is primary).
  // Changelogs are trimmed here so lifetime history can't blow the ~5MB quota;
  // the full log lives in IDB and rides Drive syncs/exports untouched.
  try {
    const lean = state.projects.map(p =>
      (p.changelog || []).length > 200 ? { ...p, changelog: p.changelog.slice(0, 200) } : p);
    localStorage.setItem('netrack_data', JSON.stringify(lean));
    localStorage.setItem('netrack_colors', JSON.stringify(state.typeColors));
  } catch(e) {}

  // Debounced auto-backup to the chosen local folder — fires 1.5s after last change
  clearTimeout(_autoBackupTimer);
  _autoBackupTimer = setTimeout(() => {
    const p = getProject();
    if (p) backupProjectLocal(p);
  }, 1500);

  // Queue background Google Drive sync (15s debounce)
  if (typeof _gdriveQueueAutoSync === 'function') _gdriveQueueAutoSync();
}

// Dynamically load JSZip from CDN if not already present
async function _ensureJSZip() {
  if (typeof JSZip !== 'undefined') return;
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Failed to load JSZip library'));
    document.head.appendChild(s);
  });
}

// Build project export as a ZIP: project.json (metadata) + individual media files.
// Exports ALL media (photos, legacy site-map floors, legacy cable maps) so nothing is lost.
async function _buildProjectZip(p) {
  await _ensureJSZip();
  const zip = new JSZip();

  const proj = {};
  for (const k of Object.keys(p)) {
    if (k === 'photos' && Array.isArray(p.photos)) {
      proj.photos = p.photos.map(ph => {
        const copy = { ...ph };
        delete copy.data;
        delete copy._editorSrc;
        return copy;
      });
    } else if (k === 'siteMapFloors' && p.siteMapFloors) {
      proj.siteMapFloors = p.siteMapFloors.map(f => { const { _data, ...rest } = f; return rest; });
    } else if (k === 'cableRunMaps' && p.cableRunMaps) {
      proj.cableRunMaps = p.cableRunMaps.map(m => { const { image, ...rest } = m; return rest; });
    } else {
      proj[k] = p[k];
    }
  }

  zip.file('project.json', JSON.stringify({
    _netrack_version: 2,
    typeColors: state.typeColors || {},
    globalVendors: state.globalVendors || [],
    project: proj
  }));

  for (const ph of (p.photos || [])) {
    if (!ph.id) continue;
    const data = ph.data || await _lazyGetPhotoData(ph.id);
    if (data) zip.file('media/photos/' + ph.id, data);
  }
  for (const f of (p.siteMapFloors || [])) {
    const smData = f._data || await _lazyGetPhotoData('sitemap_' + p.id + '_' + f.id);
    if (smData) zip.file('media/sitemap_' + f.id, smData);
  }
  for (const m of (p.cableRunMaps || [])) {
    const crData = m.image || await _lazyGetPhotoData('cablemap_' + p.id + '_' + m.id);
    if (crData) zip.file('media/cablemap_' + m.id, crData);
  }

  return zip.generateAsync({ type: 'blob' });
}

async function globalSave() {
 try {
  save();
  const p = getProject();
  if (p) {
    const defaultName = `${p.name.replace(/\s+/g, '_')}_netrack.zip`;
    const blob = await _buildProjectZip(p);
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    if (isMobile) {
      // Mobile: try Web Share API first, then show a tappable download modal
      const file = new File([blob], defaultName, { type: 'application/zip' });
      let shared = false;
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: p.name });
          shared = true;
          logChange('Project exported (Share)');
        }
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
      if (!shared) {
        const url = URL.createObjectURL(blob);
        openModal(`
          <h3>Save Project File</h3>
          <p style="font-size:13px;color:var(--text2);margin-bottom:16px">
            Tap the button below to download your project file.
          </p>
          <div class="modal-actions" style="flex-direction:column;gap:10px">
            <a href="${url}" download="${esc(defaultName)}"
               style="display:block;text-align:center;padding:12px 20px;background:var(--accent);color:#000;border-radius:6px;font-weight:600;text-decoration:none;font-size:14px"
               onclick="setTimeout(()=>{URL.revokeObjectURL('${url}');closeModal()},500)">
              Download ${esc(defaultName)}
            </a>
            <button class="btn btn-ghost btn-sm" onclick="URL.revokeObjectURL('${url}');closeModal()">Cancel</button>
          </div>
        `);
        logChange('Project exported (Save button)');
      }
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = defaultName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 300000);
      logChange('Project exported (Save button)');
    }
  }

  toast('Project exported', 'success');
 } catch (err) {
  console.error('globalSave error:', err);
  toast('Save failed: ' + err.message, 'error');
 }
}

// Migrate inline photo data to separate IDB store (runs once)
async function _migratePhotosToSeparateStore() {
  const done = await _idbGetConfig('photoMigrationDone');
  if (done) return;
  let migrated = false;
  for (const p of state.projects) {
    for (const ph of (p.photos || [])) {
      if (ph.data) {
        if (!ph.thumb) ph.thumb = await _generateThumb(ph.data) || '';
        if (!ph.dataLen) ph.dataLen = ph.data.length;
        await _idbSavePhotoData(ph.id, ph.data);
        ph.data = null;
        migrated = true;
      }
    }
    for (const f of (p.siteMapFloors || [])) {
      if (f._data || f.data) {
        await _idbSavePhotoData('sitemap_' + p.id + '_' + f.id, f._data || f.data);
        delete f._data; delete f.data;
        migrated = true;
      }
    }
    for (const m of (p.cableRunMaps || [])) {
      if (m.image) {
        await _idbSavePhotoData('cablemap_' + p.id + '_' + m.id, m.image);
        m.image = null;
        migrated = true;
      }
    }
  }
  if (migrated) {
    await Promise.all(state.projects.map(p => _idbSaveProject(p)));
    console.log('[Migration] Photo data moved to separate IDB store');
  }
  await _idbSaveConfig('photoMigrationDone', true);
}

async function load() {
  try {
    const projects = await _idbLoadAllProjects();
    if (projects.length > 0) {
      state.projects = projects;
      state.projects.forEach(migrateProject);
    } else {
      const d = localStorage.getItem('netrack_data');
      if (d) {
        state.projects = JSON.parse(d);
        state.projects.forEach(migrateProject);
        Promise.all(state.projects.map(p => _idbSaveProject(p))).catch(() => {});
      }
    }
  } catch(e) {
    try {
      const d = localStorage.getItem('netrack_data');
      if (d) { state.projects = JSON.parse(d); state.projects.forEach(migrateProject); }
    } catch(e2) {}
  }
  try {
    const colors = await _idbGetConfig('typeColors');
    if (colors) { state.typeColors = colors; }
    else {
      const c = localStorage.getItem('netrack_colors');
      if (c) state.typeColors = JSON.parse(c);
    }
  } catch(e) {
    try { const c = localStorage.getItem('netrack_colors'); if (c) state.typeColors = JSON.parse(c); } catch(e2) {}
  }
  try { state.globalVendors = (await _idbGetConfig('globalVendors')) || []; } catch(e) {}
  _migrateProjectVendorsToGlobal();
  await _migratePhotosToSeparateStore();
  await _migrateCableRunMaps();
}

async function _migrateCableRunMaps() {
  let changed = false;
  for (const p of state.projects) {
    if (p._crLegacyMapId && p.cableRunMaps?.[0]) {
      const oldData = await _idbGetPhotoData('cablemap_' + p.id);
      if (oldData) {
        await _idbSavePhotoData('cablemap_' + p.id + '_' + p._crLegacyMapId, oldData);
        await _idbDeletePhotoData('cablemap_' + p.id);
        changed = true;
      }
      delete p._crLegacyMapId;
      changed = true;
    }
  }
  if (changed) {
    await Promise.all(state.projects.map(p => _idbSaveProject(p)));
    console.log('[Migration] Cable run maps migrated to multi-map format');
  }
}

function getProject() {
  return state.projects.find(p => p.id === state.currentProjectId);
}

// ─── Global vendors (kept for data/export compatibility — no editing UI) ───
function saveGlobalVendors() {
  _idbSaveConfig('globalVendors', state.globalVendors).catch(() => {});
  try { localStorage.setItem('netrack_globalVendors', JSON.stringify(state.globalVendors)); } catch(e) {}
}

function _migrateProjectVendorsToGlobal() {
  let migrated = false;
  const existingNames = new Set(state.globalVendors.map(v => (v.name||'').toLowerCase()));
  state.projects.forEach(p => {
    if (!p.vendors || p.vendors.length === 0) return;
    p.vendors.forEach(v => {
      const key = (v.name||'').toLowerCase();
      if (key && !existingNames.has(key)) {
        state.globalVendors.push({ ...v });
        existingNames.add(key);
        migrated = true;
      }
    });
    p.vendors = [];
  });
  if (migrated) {
    saveGlobalVendors();
    Promise.all(state.projects.map(p => _idbSaveProject(p))).catch(() => {});
  }
}

// ─── File System Access: persisted backup-folder handle ───
function fsaOpenDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open('netrack_fsa', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('handles');
    req.onsuccess = e => res(e.target.result);
    req.onerror = () => rej(req.error);
  });
}
async function fsaStoreHandle(handle) {
  const db = await fsaOpenDB();
  return new Promise((res, rej) => {
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').put(handle, 'dirHandle');
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
async function fsaGetHandle() {
  try {
    const db = await fsaOpenDB();
    return new Promise((res, rej) => {
      const tx = db.transaction('handles', 'readonly');
      const req = tx.objectStore('handles').get('dirHandle');
      req.onsuccess = () => res(req.result || null);
      req.onerror = () => rej(req.error);
    });
  } catch(e) { return null; }
}
async function fsaEnsurePermission(handle) {
  if (!handle) return false;
  try {
    let perm = await handle.queryPermission({ mode: 'readwrite' });
    if (perm === 'granted') return true;
    perm = await handle.requestPermission({ mode: 'readwrite' });
    return perm === 'granted';
  } catch(e) { return false; }
}
// Opens folder picker, stores handle, updates display
async function fsaPickFolder() {
  if (!window.showDirectoryPicker) {
    toast('File System Access not supported — use Chrome or Edge', 'error');
    return;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'documents' });
    await fsaStoreHandle(handle);
    const cfg = loadBackupConfig();
    cfg.mode = 'local-fs';
    cfg.fsaDirName = handle.name;
    saveBackupConfig(cfg);
    const el = document.getElementById('gs-fsa-folder-name');
    if (el) {
      el.textContent = handle.name;
      el.style.color = 'var(--accent)';
    }
    toast('Backup folder set: ' + handle.name, 'success');
  } catch(e) {
    if (e.name !== 'AbortError') toast('Could not open folder: ' + e.message, 'error');
  }
}
// Write one project file to the chosen folder (named <ProjectName>.json — overwrites previous save)
async function fsaWriteProject(p, bundle, silent) {
  const handle = await fsaGetHandle();
  if (!handle) {
    if (!silent) toast('No backup folder chosen — open Settings to pick one', 'error');
    return;
  }
  const ok = await fsaEnsurePermission(handle);
  if (!ok) {
    if (!silent) toast('Folder permission denied — re-pick the folder in Settings to re-grant access', 'error');
    return;
  }
  const safeName = p.name.replace(/[^a-z0-9_\-. ]/gi, '_');
  const fileHandle = await handle.getFileHandle(safeName + '.json', { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(bundle));
  await writable.close();
}

// Auto-backup the project as one JSON file in the user's chosen local folder
async function backupProjectLocal(p, silent = true) {
  const cfg = loadBackupConfig();
  if ((cfg.mode || 'local-fs') === 'none') return;
  // Reconstitute legacy cable-map images from IDB so the backup file is complete
  const projCopy = { ...p };
  if (projCopy.cableRunMaps) {
    projCopy.cableRunMaps = await Promise.all(projCopy.cableRunMaps.map(async m => {
      if (m.image) return m;
      const crImg = await _lazyGetPhotoData('cablemap_' + p.id + '_' + m.id).catch(() => null);
      return crImg ? { ...m, image: crImg } : m;
    }));
  }
  const bundle = { _netrack_version: 2, typeColors: state.typeColors, globalVendors: state.globalVendors || [], project: projCopy };
  try {
    await fsaWriteProject(p, bundle, silent);
  } catch (_) { /* silent */ }
}

// ─── Backup config ───
function loadBackupConfig() {
  try { return JSON.parse(localStorage.getItem('netrack_backup_cfg') || '{}'); } catch(e) { return {}; }
}
function saveBackupConfig(cfg) {
  localStorage.setItem('netrack_backup_cfg', JSON.stringify(cfg));
  updateBackupStatusBadge();
}
function updateBackupStatusBadge() {
  const el = document.getElementById('proj-backup-status');
  if (!el) return;
  const cfg = loadBackupConfig();
  if ((cfg.mode || 'local-fs') === 'none') { el.textContent = '⊘ Auto-backup disabled'; return; }
  el.textContent = '📂 Auto-backup → ' + (cfg.fsaDirName || 'no folder chosen (pick one in Settings)');
}

async function gsBackupAllNow() {
  let ok = 0, fail = 0;
  for (const p of state.projects) { try { await backupProjectLocal(p, false); ok++; } catch(e) { fail++; } }
  toast('Backed up ' + ok + ' project' + (ok !== 1 ? 's' : '') + (fail ? ' (' + fail + ' failed)' : ''), ok ? 'success' : 'error');
}

// ─── Small utils ───
function fmtTs(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
  } catch(e) { return iso; }
}

// Resolve a port's full circuit. A port can hold a mirrored infra link
// (panel ↔ switch, both sides point at each other) AND an end device that
// rides that circuit (the camera behind the wall jack). The end device may
// be recorded on either side of the link — this checks both.
//   assigned — raw portAssignments target (link partner or plain device)
//   link     — {dev, port} when the assignment is mirrored back to us
//   end      — device riding the circuit (portEndDevice, either side)
//   content  — what the port "is": end device, else link partner, else assigned
function getPortCircuit(dev, portNum, p) {
  const rawId = (dev.portAssignments || {})[portNum] || null;
  const peerPort = (dev.portPeerPort || {})[portNum] || null;
  const assigned = rawId ? (p.devices.find(x => x.id === rawId) || null) : null;
  let link = null;
  if (assigned && peerPort &&
      (assigned.portAssignments || {})[peerPort] === dev.id &&
      (assigned.portPeerPort || {})[peerPort] == portNum) {
    link = { dev: assigned, port: +peerPort };
  }
  let endId = (dev.portEndDevice || {})[portNum] || null;
  if (!endId && link) endId = (link.dev.portEndDevice || {})[link.port] || null;
  const end = endId ? (p.devices.find(x => x.id === endId) || null) : null;
  return { assigned, link, end, content: end || (link ? link.dev : assigned) };
}

// Returns "PP-A-P21" style string for any patch panel ports this device
// lands on — directly assigned or riding a patched circuit.
function getPatchConnection(deviceId, p) {
  const hits = [];
  p.devices.forEach(d => {
    if (!PANEL_LIKE(d.deviceType)) return;
    for (let i = 1; i <= (d.ports || 0); i++) {
      const c = getPortCircuit(d, i, p);
      if ((c.end && c.end.id === deviceId) || (d.portAssignments || {})[i] === deviceId) {
        hits.push(`${d.name}-P${i}`);
      }
    }
  });
  return hits.join(', ');
}

function getVlanColor(vlan) {
  const VLAN_PALETTE = {
    '1':'#3a5a7a','10':'#00c8ff','20':'#00e87a','30':'#ffaa00',
    '40':'#ff6b35','50':'#cc44ff','60':'#ff4455','70':'#ff88bb',
    '100':'#e8d000','200':'#00d4aa','300':'#4488ff','400':'#ff3399'
  };
  if (!vlan || vlan === '0') return '#3a5a7a';
  if (VLAN_PALETTE[String(vlan)]) return VLAN_PALETTE[String(vlan)];
  let h = 0; for (const c of String(vlan)) h = (h*31 + c.charCodeAt(0)) & 0xFFFF;
  return `hsl(${h%360},70%,55%)`;
}

// ─── Printing: native Android bridge → system print dialog (Save as PDF) ───
// Injects the content into a screen-hidden #print-host; @media print CSS in
// styles.css shows only the host. Falls back to a pop-up window on desktop.
function _printHtml(title, bodyHtml, css) {
  document.getElementById('print-host')?.remove();
  if (window.AndroidPrint) {
    const host = document.createElement('div');
    host.id = 'print-host';
    host.innerHTML = `<style>${css}</style>${bodyHtml}`;
    document.body.appendChild(host);
    document.body.classList.add('printing');
    // Give images a beat to decode before the print adapter snapshots the page
    setTimeout(() => AndroidPrint.print(title), 400);
    return;
  }
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) { toast('Pop-up blocked — allow pop-ups to print', 'error'); return; }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${esc(title)}</title><style>${css}</style></head><body><div id="print-host">${bodyHtml}</div></body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 600);
}

// A sheet can register a hook that runs when the user DISMISSES it
// (scrim tap or swipe-down) rather than tapping an explicit button —
// the device editor uses it to save instead of silently discarding edits.
let _modalDismissHook = null;

function _dismissModal() {
  const hook = _modalDismissHook;
  _modalDismissHook = null;
  if (hook) { try { hook(); } catch (e) { console.warn('dismiss hook failed', e); } }
  closeModal();
}

function openModal(html, width) {
  _modalDismissHook = null;
  const box = document.getElementById('modal-content');
  box.innerHTML = '<div class="sheet-grip"></div>' + html;
  box.classList.remove('modal-wide');
  box.style.transform = '';
  box.style.transition = '';
  box.scrollTop = 0;
  box.style.width = width || '';
  box.style.maxWidth = width ? '98vw' : '';
  document.getElementById('modal-overlay').classList.add('open');
}

function closeModal() {
  _modalDismissHook = null;
  const box = document.getElementById('modal-content');
  box.classList.remove('modal-wide');
  box.style.transform = '';
  box.style.transition = '';
  document.getElementById('modal-overlay').classList.remove('open');
}

// ─── Sheet dismissal: tap the scrim or swipe the sheet down ───
(function _setupSheetDismiss() {
  const overlay = document.getElementById('modal-overlay');
  const box = document.getElementById('modal-content');
  if (!overlay || !box) return;

  // Tap outside the sheet closes it (saving first if a dismiss hook is set)
  overlay.addEventListener('click', (e) => { if (e.target === overlay) _dismissModal(); });

  // Drag the sheet down to dismiss (from the grip, or from the body when scrolled to top)
  let drag = null;
  box.addEventListener('pointerdown', (e) => {
    const fromGrip = !!(e.target.closest && e.target.closest('.sheet-grip'));
    if (!fromGrip) {
      if (box.scrollTop > 0) return;
      if (/^(TEXTAREA|INPUT|SELECT)$/.test(e.target.tagName)) return;
      // Don't hijack drags inside a nested scroller that isn't at its top
      let sc = e.target;
      while (sc && sc !== box) {
        if (sc.scrollTop > 0) return;
        sc = sc.parentElement;
      }
    }
    drag = { y: e.clientY, id: e.pointerId, on: false, fromGrip };
  });
  box.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = e.clientY - drag.y;
    if (!drag.on) {
      if (dy > 10 && (drag.fromGrip || box.scrollTop <= 0)) {
        drag.on = true;
        box.style.transition = 'none';
        try { box.setPointerCapture(drag.id); } catch(_) {}
      } else if (dy < -8) {
        drag = null; // scrolling up — not a dismiss gesture
      }
      return;
    }
    box.style.transform = dy > 0 ? `translateY(${dy}px)` : '';
    if (dy > 0) e.preventDefault();
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = e.clientY - drag.y;
    const wasDragging = drag.on;
    drag = null;
    box.style.transition = 'transform .18s ease-out';
    if (wasDragging && dy > 110) {
      box.style.transform = 'translateY(110%)';
      setTimeout(_dismissModal, 170);
    } else {
      box.style.transform = '';
    }
  };
  box.addEventListener('pointerup', endDrag);
  box.addEventListener('pointercancel', (e) => {
    if (drag && e.pointerId === drag.id) {
      drag = null;
      box.style.transition = '';
      box.style.transform = '';
    }
  });
})();

function setTopbarActions(html) {
  document.getElementById('topbar-actions').innerHTML = html;
}

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

let toastTimer;
function toast(msg, type) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'show' + (type ? ' ' + type : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, 2500);
}

// ─── Import / Export ───
async function exportData() {
  try {
    const p = getProject();
    const blob = await _buildProjectZip(p);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${p.name.replace(/\s+/g,'_')}_netrack.zip`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 300000);
    logChange('Project exported manually');
    toast('Project exported', 'success');
  } catch (err) {
    console.error('Export error:', err);
    toast('Export failed: ' + err.message, 'error');
  }
}

function importData() { document.getElementById('import-input')?.click(); }

// Memory-efficient JSON import: strips large data URIs into IDB one at a time,
// then parses the lightweight remaining JSON. Handles any file size.
async function _streamingJsonImport(file) {
  let tempCount = 0;
  try {
    let metaParts, tc;
    ({ metaParts, tempCount: tc } = await _chunkedJsonStrip(file));
    tempCount = tc;
    let reduced = metaParts.join('');
    metaParts = null;
    let parsed;
    try {
      parsed = JSON.parse(reduced);
    } catch (parseErr) {
      parsed = JSON.parse(_repairTruncatedJson(reduced));
    }
    return { parsed, tempCount };
  } catch (err) {
    for (let i = 0; i < tempCount; i++) {
      try { await _idbDeletePhotoData(`_import_temp_${i}`); } catch(e) {}
    }
    throw err;
  }
}

// Chunked stripping: reads 5MB slices, finds data-URI boundaries, saves each to IDB on the fly.
async function _chunkedJsonStrip(file) {
  const CHUNK = 5 * 1024 * 1024;
  const metaParts = [];
  let buffer = '';
  let inDataUri = false;
  let dataChunks = [];
  let fieldName = '';
  let tempCount = 0;
  const dataRe = /"data"\s*:\s*"data:image\//;
  const imageRe = /"image"\s*:\s*"data:image\//;
  const prefixRe = /^"(data|image)"\s*:\s*"/;

  for (let offset = 0; offset < file.size; offset += CHUNK) {
    const slice = file.slice(offset, Math.min(offset + CHUNK, file.size));
    buffer += await slice.text();

    for (;;) {
      if (inDataUri) {
        const q = buffer.indexOf('"');
        if (q >= 0) {
          dataChunks.push(buffer.substring(0, q));
          const tempKey = `_import_temp_${tempCount}`;
          await _idbSavePhotoData(tempKey, dataChunks.join(''));
          metaParts.push(`"${fieldName}":"${tempKey}"`);
          dataChunks = [];
          tempCount++;
          buffer = buffer.substring(q + 1);
          inDataUri = false;
        } else {
          dataChunks.push(buffer);
          buffer = '';
          break;
        }
      } else {
        const di = buffer.search(dataRe);
        const ii = buffer.search(imageRe);
        let matchIdx = -1;
        if (di >= 0 && (ii < 0 || di < ii)) { matchIdx = di; }
        else if (ii >= 0) { matchIdx = ii; }
        if (matchIdx >= 0) {
          metaParts.push(buffer.substring(0, matchIdx));
          const pm = buffer.substring(matchIdx).match(prefixRe);
          fieldName = pm[1];
          buffer = buffer.substring(matchIdx + pm[0].length);
          inDataUri = true;
          dataChunks = [];
        } else {
          if (buffer.length > 40) {
            metaParts.push(buffer.substring(0, buffer.length - 40));
            buffer = buffer.substring(buffer.length - 40);
          }
          break;
        }
      }
    }
  }
  if (buffer.length > 0) metaParts.push(buffer);
  return { metaParts, tempCount };
}

// Attempt to repair truncated JSON by closing unclosed strings and brackets
function _repairTruncatedJson(text) {
  let inStr = false, esc = false;
  const stack = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) { esc = false; }
      else if (c === '\\') { esc = true; }
      else if (c === '"') { inStr = false; }
    } else {
      if (c === '"') { inStr = true; }
      else if (c === '{' || c === '[') { stack.push(c === '{' ? '}' : ']'); }
      else if (c === '}' || c === ']') { if (stack.length) stack.pop(); }
    }
  }
  if (inStr) text += '"';
  if (/:\s*$/.test(text)) text += 'null';
  while (stack.length) text += stack.pop();
  return text;
}

async function _cleanupImportTemp(count) {
  for (let i = 0; i < count; i++) {
    try { await _idbDeletePhotoData(`_import_temp_${i}`); } catch(e) {}
  }
}

async function handleImport(e) {
  const file = e.target.files[0]; if (!file) return;
  let p = null, importedColors = null, importedVendors = null;
  let streamTempCount = 0;

  const isZip = file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip';

  try {
    if (isZip) {
      // ─── ZIP format: project.json + individual media files ───
      await _ensureJSZip();
      const zip = await JSZip.loadAsync(file);
      const projFile = zip.file('project.json');
      if (!projFile) throw new Error('ZIP does not contain project.json');
      const parsed = JSON.parse(await projFile.async('text'));

      if (parsed._netrack_version === 2 && parsed.project) {
        p = parsed.project;
        importedColors = parsed.typeColors;
        importedVendors = parsed.globalVendors;
      } else if (parsed.id && parsed.name) {
        p = parsed;
      } else {
        throw new Error('Unrecognised file format');
      }
      if (!p.id || !p.name) throw new Error('Missing project id or name');
      migrateProject(p);

      for (const ph of (p.photos || [])) {
        if (!ph.id) continue;
        const photoFile = zip.file('media/photos/' + ph.id);
        if (photoFile) {
          const data = await photoFile.async('text');
          if (!ph.thumb) ph.thumb = await _generateThumb(data) || '';
          if (!ph.dataLen) ph.dataLen = data.length;
          await _idbSavePhotoData(ph.id, data);
        }
        ph.data = null;
        delete ph._editorSrc;
      }
      for (const f of (p.siteMapFloors || [])) {
        const smFile = zip.file('media/sitemap_' + f.id) || (p._smLegacyFloorId === f.id ? zip.file('media/sitemap') : null);
        if (smFile) {
          await _idbSavePhotoData('sitemap_' + p.id + '_' + f.id, await smFile.async('text'));
        }
        delete f._data; delete f.data;
      }
      for (const m of (p.cableRunMaps || [])) {
        const crFile = zip.file('media/cablemap_' + m.id) || (p._crLegacyMapId === m.id ? zip.file('media/cablemap') : null);
        if (crFile) {
          await _idbSavePhotoData('cablemap_' + p.id + '_' + m.id, await crFile.async('text'));
          m.image = null;
        }
      }

    } else {
      // ─── JSON format (streamed to avoid memory crashes on huge legacy files) ───
      const result = await _streamingJsonImport(file);
      const parsed = result.parsed;
      streamTempCount = result.tempCount;

      if (parsed._netrack_version === 2 && parsed.project) {
        p = parsed.project;
        importedColors = parsed.typeColors;
        importedVendors = parsed.globalVendors;
      } else if (parsed.id && parsed.name) {
        p = parsed;
      } else {
        await _cleanupImportTemp(streamTempCount);
        throw new Error('Unrecognised file format');
      }
      if (!p.id || !p.name) {
        await _cleanupImportTemp(streamTempCount);
        throw new Error('Missing project id or name');
      }
      migrateProject(p);

      for (const ph of (p.photos || [])) {
        if (ph.data && typeof ph.data === 'string' && ph.data.startsWith('_import_temp_')) {
          const actualData = await _idbGetPhotoData(ph.data);
          if (actualData) {
            if (!ph.thumb) ph.thumb = await _generateThumb(actualData) || '';
            if (!ph.dataLen) ph.dataLen = actualData.length;
            await _idbSavePhotoData(ph.id, actualData);
          }
          await _idbDeletePhotoData(ph.data);
          ph.data = null;
        } else if (ph.data) {
          if (!ph.thumb) ph.thumb = await _generateThumb(ph.data) || '';
          if (!ph.dataLen) ph.dataLen = ph.data.length;
          await _idbSavePhotoData(ph.id, ph.data);
          ph.data = null;
        }
        delete ph._editorSrc;
      }
      for (const f of (p.siteMapFloors || [])) {
        if (f.data?.startsWith?.('_import_temp_')) {
          const d = await _idbGetPhotoData(f.data);
          if (d) await _idbSavePhotoData('sitemap_' + p.id + '_' + f.id, d);
          await _idbDeletePhotoData(f.data);
          f.data = null;
        } else if (f.data) {
          await _idbSavePhotoData('sitemap_' + p.id + '_' + f.id, f.data);
          f.data = null;
        }
        delete f._data;
      }
      for (const m of (p.cableRunMaps || [])) {
        if (m.image?.startsWith?.('_import_temp_')) {
          const d = await _idbGetPhotoData(m.image);
          if (d) await _idbSavePhotoData('cablemap_' + p.id + '_' + m.id, d);
          await _idbDeletePhotoData(m.image);
          m.image = null;
        } else if (m.image) {
          await _idbSavePhotoData('cablemap_' + p.id + '_' + m.id, m.image);
          m.image = null;
        }
      }

      await _cleanupImportTemp(streamTempCount);
    }
  } catch(err) {
    if (streamTempCount > 0) await _cleanupImportTemp(streamTempCount);
    toast(`Import failed: ${err.message || 'Invalid project file'}`, 'error');
    e.target.value = '';
    return;
  }

  const existing = state.projects.findIndex(x => x.id === p.id);
  if (existing >= 0) {
    if (!confirm(`Project "${p.name}" already exists. Overwrite?`)) { e.target.value = ''; return; }
    await snapshotProject(state.projects[existing], 'before import overwrote it');
    state.projects[existing] = p;
  } else {
    state.projects.push(p);
  }
  if (importedColors) {
    state.typeColors = Object.assign({}, importedColors, state.typeColors);
  }
  if (importedVendors && importedVendors.length > 0) {
    const existingNames = new Set(state.globalVendors.map(v => (v.name||'').toLowerCase()));
    importedVendors.forEach(v => {
      const key = (v.name||'').toLowerCase();
      if (key && !existingNames.has(key)) {
        state.globalVendors.push({ ...v });
        existingNames.add(key);
      }
    });
    saveGlobalVendors();
  }
  save();
  if (typeof renderProjects === 'function') renderProjects();
  toast('Project imported', 'success');
  e.target.value = '';
}
