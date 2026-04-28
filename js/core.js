// ═══════════════════════════════════════════
//  CORE - Shared state, constants, utilities
// ═══════════════════════════════════════════

const LOGO_URI = "img/logo.jpg";

// File handles for Save > Local (keyed by project ID) — allows overwriting the same file
const _localSaveHandles = new Map();

// Generate a small thumbnail from a data URL via offscreen canvas
function _generateThumb(dataUrl, maxW = 480) {
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
  'Smartphone/Tablet','APC/UPS','Misc.','Misc Rack-Mounted'
];

const RACK_MOUNTABLE = new Set([
  'Modem','Router','Firewall','Switch','Patch Panel','Fiber Enclosure','Server','NAS','Access Control','APC/UPS','Misc Rack-Mounted'
]);

const PORT_CAPABLE = new Set([
  'Switch','Patch Panel','Router','Firewall','Server','NAS','Misc Rack-Mounted','Modem'
]);

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
  'Misc Rack-Mounted': '#aabbcc'
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
  if (d.parentDeviceId === undefined) d.parentDeviceId = null;
  if (!d.webUser) d.webUser = '';
  if (!d.webPassword) d.webPassword = '';
  if (!d.webProtocol) d.webProtocol = 'https';
  if (!d.deviceUHeight) d.deviceUHeight = 1;
  // Feature 1: Status
  if (d.status === undefined) d.status = '';
  // Feature 2: Serial / Warranty / EOL
  if (d.serial === undefined) d.serial = '';
  if (d.warrantyExpiry === undefined) d.warrantyExpiry = '';
  if (d.eolDate === undefined) d.eolDate = '';
  if (!d.addedDate) d.addedDate = '';
  if (d.vendorId === undefined) d.vendorId = '';
  if (d.fiberPairs === undefined) d.fiberPairs = 0;
  if (!d.fiberLabels) d.fiberLabels = {};
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
  fcSelectedNode: null,
  typeColors: {},
  searchDebounce: null,
  activeTimer: null,
  deviceStatusFilter: 'all',
  cableTypeFilter: 'all',
  cableRoomFilter: '',
  driveIndex: [],
  globalVendors: [],
  projectFolders: []
};

function migrateProject(p) {
  if (!p.devices) p.devices = [];
  if (!p.racks) p.racks = [];
  if (!p.flowchart) p.flowchart = JSON.parse(JSON.stringify(DEFAULT_FLOWCHART));
  if (!p.changelog) p.changelog = [];
  if (!p.siteNotes) p.siteNotes = [];
  if (!p.company) p.company = '';
  if (!p.location) p.location = '';
  if (!p.contactMgmt) p.contactMgmt = '';
  if (!p.contactIT) p.contactIT = '';
  if (!p.fcNodePositions) p.fcNodePositions = {};
  if (!p.photos) p.photos = [];
  if (!p.photoFolders) p.photoFolders = [];
  // Feature 5: Vendors
  if (!p.vendors) p.vendors = [];
  // Feature 6: Checklist
  if (!p.checklist) p.checklist = getDefaultChecklist();
  // Feature 7: Time Log
  if (!p.timeLog) p.timeLog = [];
  // Feature 11: Cable Runs
  if (!p.cableRuns) p.cableRuns = [];
  if (!p.cableRunMap) p.cableRunMap = { image: null, thumb: null, paths: [], symbols: [] };
  if (!p.cableRunMap.paths) p.cableRunMap.paths = [];
  if (!p.cableRunMap.symbols) p.cableRunMap.symbols = [];
  // Feature 12: Locations
  if (!p.locations) p.locations = [];
  // Feature 13: Site Map
  if (!p.siteMap) p.siteMap = { data: null, markers: [], cableLines: [] };
  if (!p.siteMap.cableLines) p.siteMap.cableLines = [];
  if (!p.customTemplates) p.customTemplates = [];
  if (p.folderId === undefined) p.folderId = '';
  p.racks.forEach(r => { if (!r.uDirection) r.uDirection = 'desc'; });
  p.devices.forEach(migrateDevice);
  return p;
}

function getDefaultChecklist() {
  const items = [
    { cat:'Discovery', text:'Photograph all network closets' },
    { cat:'Discovery', text:'Document ISP hand-off point' },
    { cat:'Discovery', text:'Scan all subnets' },
    { cat:'Discovery', text:'Walk all floors/areas' },
    { cat:'Discovery', text:'Locate all patch panels' },
    { cat:'Inventory', text:'Document all switches with port counts' },
    { cat:'Inventory', text:'Document all routers/firewalls' },
    { cat:'Inventory', text:'Document all servers/NAS' },
    { cat:'Inventory', text:'Document all APs' },
    { cat:'Inventory', text:'Record all serial numbers' },
    { cat:'Cabling', text:'Label all patch panel ports' },
    { cat:'Cabling', text:'Document cable runs between closets' },
    { cat:'Cabling', text:'Verify all punch-downs are labeled' },
    { cat:'Cabling', text:'Photograph cable management' },
    { cat:'Verification', text:'Verify all IPs are documented' },
    { cat:'Verification', text:'Test internet connectivity' },
    { cat:'Verification', text:'Confirm VLAN config matches documentation' },
    { cat:'Verification', text:'Sign off with site contact' },
  ];
  return items.map(i => ({ id: genId(), text: i.text, done: false, category: i.cat }));
}

function logChange(msg) {
  const p = getProject();
  if (!p) return;
  if (!p.changelog) p.changelog = [];
  p.changelog.unshift({ id: genId(), ts: new Date().toISOString(), msg });
  // Keep log capped at 2000 entries
  if (p.changelog.length > 2000) p.changelog = p.changelog.slice(0, 2000);
}

const DEFAULT_FLOWCHART = {
  nodes: [
    { id:'n1', text:'Select Project', x:280, y:30, type:'start' },
    { id:'n2', text:'Local Network Scan', x:140, y:120, type:'process' },
    { id:'n3', text:'Rack View', x:380, y:120, type:'process' },
    { id:'n4', text:'Device List', x:140, y:210, type:'process' },
    { id:'n5', text:'Assign to Rack', x:380, y:210, type:'process' },
    { id:'n6', text:'Switch Devices', x:100, y:300, type:'process' },
    { id:'n7', text:'Non-Switch Devices', x:270, y:300, type:'process' },
    { id:'n8', text:'Port Lists', x:60, y:390, type:'process' },
    { id:'n9', text:'Port Assignment', x:200, y:390, type:'process' },
    { id:'n10', text:'New / Existing Rack', x:420, y:300, type:'decision' },
  ],
  edges: [
    { from:'n1', to:'n2' }, { from:'n1', to:'n3' },
    { from:'n2', to:'n4' }, { from:'n3', to:'n5' },
    { from:'n4', to:'n6' }, { from:'n4', to:'n7' },
    { from:'n5', to:'n10' }, { from:'n6', to:'n8' },
    { from:'n6', to:'n9' }
  ]
};

function genId() {
  return 'id_' + Math.random().toString(36).substr(2, 9);
}

// ─── IndexedDB Storage (primary — replaces localStorage, effectively unlimited) ───
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
  // Strip heavy binary data — photos stored in separate 'photoData' store
  const lite = { ...project };
  if (lite.photos) lite.photos = lite.photos.map(ph => ph.data ? { ...ph, data: null } : ph);
  if (lite.siteMap?.data) lite.siteMap = { ...lite.siteMap, data: null };
  if (lite.cableRunMap?.image) lite.cableRunMap = { ...lite.cableRunMap, image: null };
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
  // Try fetching from Drive if signed in
  if (typeof _driveToken === 'undefined' || !_driveToken || typeof _driveFetch !== 'function' || typeof _getDriveMap !== 'function') return null;
  let projectId, mapKey;
  if (id.startsWith('sitemap_')) { projectId = id.slice(8); mapKey = '_siteMap'; }
  else if (id.startsWith('cablemap_')) { projectId = id.slice(9); mapKey = '_cableMap'; }
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
  // Primary: fire-and-forget async write to IndexedDB (large quota)
  Promise.all(state.projects.map(p => _idbSaveProject(p)))
    .catch(e => console.warn('IDB save error:', e));
  _idbSaveConfig('typeColors', state.typeColors).catch(() => {});
  _idbSaveConfig('globalVendors', state.globalVendors).catch(() => {});

  // Secondary: try localStorage as a quick fallback (may fail if full)
  try {
    localStorage.setItem('netrack_data', JSON.stringify(state.projects));
    localStorage.setItem('netrack_colors', JSON.stringify(state.typeColors));
  } catch(e) { /* Quota exceeded — IDB is primary now, this is fine */ }

  // Debounced autosave to ./Projects/ via local agent — fires 1.5s after last change
  clearTimeout(_autoBackupTimer);
  _autoBackupTimer = setTimeout(() => {
    const p = getProject();
    if (p) backupProjectToAgent(p);
  }, 1500);
}

function toggleSidebarDropdown(id) {
  const all = ['save-dropdown', 'load-dropdown'];
  all.forEach(m => {
    const el = document.getElementById(m);
    if (!el) return;
    el.style.display = (m === id && el.style.display === 'none') ? 'block' : 'none';
  });
  if (document.getElementById(id)?.style.display === 'block') {
    const close = e => {
      const menu = document.getElementById(id);
      if (menu && !menu.contains(e.target) && !e.target.closest('[onclick*="toggleSidebarDropdown"]')) {
        menu.style.display = 'none';
      }
      document.removeEventListener('click', close);
    };
    setTimeout(() => document.addEventListener('click', close), 10);
  }
}
function closeSidebarDropdowns() {
  ['save-dropdown','load-dropdown'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

// Build project export as a Blob, pulling photo data from IDB on demand.
// Stringifies each photo individually to avoid V8 string-length limits.
async function _buildProjectBlob(p) {
  const parts = [];
  parts.push('{"_netrack_version":2,"typeColors":');
  parts.push(JSON.stringify(state.typeColors || {}));
  parts.push(',"globalVendors":');
  parts.push(JSON.stringify(state.globalVendors || []));
  parts.push(',"project":{');

  const keys = Object.keys(p);
  for (let ki = 0; ki < keys.length; ki++) {
    const k = keys[ki];
    if (ki > 0) parts.push(',');
    parts.push(JSON.stringify(k) + ':');

    if (k === 'photos' && Array.isArray(p.photos)) {
      // Reconstitute each photo's data from IDB individually
      parts.push('[');
      for (let i = 0; i < p.photos.length; i++) {
        if (i > 0) parts.push(',');
        const ph = { ...p.photos[i] };
        delete ph._editorSrc; // runtime-only, not for export
        if (!ph.data && ph.id) ph.data = await _lazyGetPhotoData(ph.id);
        parts.push(JSON.stringify(ph));
      }
      parts.push(']');
    } else if (k === 'siteMap' && p.siteMap) {
      const sm = { ...p.siteMap };
      if (!sm.data) sm.data = await _lazyGetPhotoData('sitemap_' + p.id);
      parts.push(JSON.stringify(sm));
    } else if (k === 'cableRunMap' && p.cableRunMap) {
      const cr = { ...p.cableRunMap };
      if (!cr.image) cr.image = await _lazyGetPhotoData('cablemap_' + p.id);
      parts.push(JSON.stringify(cr));
    } else {
      parts.push(JSON.stringify(p[k]));
    }
  }
  parts.push('}}');
  return new Blob(parts, { type: 'application/json' });
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

// Build project export as a ZIP: project.json (metadata) + individual photo files
async function _buildProjectZip(p) {
  await _ensureJSZip();
  const zip = new JSZip();

  // Build lightweight project metadata (strip photo binary data)
  const proj = {};
  for (const k of Object.keys(p)) {
    if (k === 'photos' && Array.isArray(p.photos)) {
      proj.photos = p.photos.map(ph => {
        const copy = { ...ph };
        delete copy.data;
        delete copy._editorSrc;
        return copy;
      });
    } else if (k === 'siteMap' && p.siteMap) {
      const sm = { ...p.siteMap };
      delete sm.data;
      proj.siteMap = sm;
    } else if (k === 'cableRunMap' && p.cableRunMap) {
      const cr = { ...p.cableRunMap };
      delete cr.image;
      proj.cableRunMap = cr;
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

  // Add each photo as a separate file (data URL text)
  for (const ph of (p.photos || [])) {
    if (!ph.id) continue;
    const data = ph.data || await _lazyGetPhotoData(ph.id);
    if (data) zip.file('media/photos/' + ph.id, data);
  }

  // Site map
  if (p.siteMap) {
    const smData = p.siteMap.data || await _lazyGetPhotoData('sitemap_' + p.id);
    if (smData) zip.file('media/sitemap', smData);
  }

  // Cable run map
  if (p.cableRunMap) {
    const crData = p.cableRunMap.image || await _lazyGetPhotoData('cablemap_' + p.id);
    if (crData) zip.file('media/cablemap', crData);
  }

  return zip.generateAsync({ type: 'blob' });
}

async function globalSave() {
 try {
  // Flush any in-flight photo editor caption/notes edits before saving
  const capEl = document.getElementById('photo-editor-caption');
  if (capEl && typeof _photoEditIdx !== 'undefined' && _photoEditIdx >= 0) {
    const ph = getProject()?.photos?.[_photoEditIdx];
    if (ph) ph.caption = capEl.value.trim();
  }
  // Flush any editable photo notes textareas
  document.querySelectorAll('[data-photo-note-devid]').forEach(ta => {
    const devId = ta.dataset.photoNoteDevid;
    const p = getProject();
    if (!p) return;
    const dev = p.devices.find(d => d.id === devId);
    if (dev) dev.notes = ta.value;
  });

  save();

  // Always export the current project as a JSON file
  const p = getProject();
  if (p) {
    const defaultName = `${p.name.replace(/\s+/g, '_')}_netrack.zip`;

    // Build ZIP with project.json + individual photo files to avoid memory limits
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
      // Desktop: direct download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = defaultName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      logChange('Project exported (Save button)');
    }
  }

  // Visual feedback on the button
  const btn = document.getElementById('global-save-btn');
  if (btn) {
    const orig = btn.innerHTML;
    btn.innerHTML = '✅ Saved';
    btn.style.color = '#00e87a';
    btn.style.borderColor = '#00e87a';
    setTimeout(() => { btn.innerHTML = orig; }, 2200);
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
    if (p.siteMap?.data) {
      await _idbSavePhotoData('sitemap_' + p.id, p.siteMap.data);
      p.siteMap.data = null;
      migrated = true;
    }
    if (p.cableRunMap?.image) {
      await _idbSavePhotoData('cablemap_' + p.id, p.cableRunMap.image);
      p.cableRunMap.image = null;
      migrated = true;
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
    // Primary: load from IndexedDB (large quota)
    const projects = await _idbLoadAllProjects();
    if (projects.length > 0) {
      state.projects = projects;
      state.projects.forEach(migrateProject);
    } else {
      // Fall back to localStorage (first run or migration)
      const d = localStorage.getItem('netrack_data');
      if (d) {
        state.projects = JSON.parse(d);
        state.projects.forEach(migrateProject);
        // Migrate existing data to IndexedDB
        Promise.all(state.projects.map(p => _idbSaveProject(p))).catch(() => {});
      }
    }
  } catch(e) {
    // IDB failed entirely — fall back to localStorage
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
  // Load Drive project index (lightweight metadata)
  try { state.driveIndex = (await _idbGetConfig('driveIndex')) || []; } catch(e) {}
  // Load global vendors
  try { state.globalVendors = (await _idbGetConfig('globalVendors')) || []; } catch(e) {}
  try { state.projectFolders = (await _idbGetConfig('projectFolders')) || []; } catch(e) {}
  // Migrate per-project vendors → global (one-time)
  _migrateProjectVendorsToGlobal();
  // Migrate inline photo data to separate store (one-time)
  await _migratePhotosToSeparateStore();
}

function getProject() {
  return state.projects.find(p => p.id === state.currentProjectId);
}

// ─── Global Vendors ───
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
    p.vendors = []; // clear per-project vendors after migration
  });
  if (migrated) {
    saveGlobalVendors();
    Promise.all(state.projects.map(p => _idbSaveProject(p))).catch(() => {});
  }
}

function getVendorById(id) {
  return state.globalVendors.find(v => v.id === id);
}

// ─── IndexedDB helpers for persisting FileSystemDirectoryHandle ───
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
async function fsaClearHandle() {
  const db = await fsaOpenDB();
  return new Promise((res, rej) => {
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').delete('dirHandle');
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
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
// Called from settings UI — opens folder picker, stores handle, updates display
async function fsaPickFolder() {
  if (!window.showDirectoryPicker) {
    toast('File System Access not supported — use Chrome or Edge', 'error');
    return;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'documents' });
    await fsaStoreHandle(handle);
    const cfg = loadBackupConfig();
    cfg.fsaDirName = handle.name;
    saveBackupConfig(cfg);
    // Update the folder display in the open modal
    const el = document.getElementById('gs-fsa-folder-name');
    if (el) {
      el.textContent = handle.name;
      el.style.color = 'var(--accent)';
    }
    const hint = document.getElementById('gs-fsa-hint');
    if (hint) hint.style.display = 'none';
    toast('Folder set: ' + handle.name, 'success');
  } catch(e) {
    if (e.name !== 'AbortError') toast('Could not open folder: ' + e.message, 'error');
  }
}
// Write one project file to the chosen folder
async function fsaWriteProject(p, bundle, silent) {
  const handle = await fsaGetHandle();
  if (!handle) {
    if (!silent) toast('No backup folder chosen — open Settings & Backup to pick one', 'error');
    return;
  }
  const ok = await fsaEnsurePermission(handle);
  if (!ok) {
    if (!silent) toast('Folder permission denied — re-open Settings & Backup to re-grant access', 'error');
    return;
  }
  const safeName = p.name.replace(/[^a-z0-9_\-. ]/gi, '_');
  const fileHandle = await handle.getFileHandle(safeName + '.json', { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(bundle));
  await writable.close();
}

async function backupProjectToAgent(p, silent = true) {
  const cfg = loadBackupConfig();
  const mode = cfg.mode || 'local-fs';
  if (mode === 'none') return;
  const bundle = { _netrack_version: 2, typeColors: state.typeColors, globalVendors: state.globalVendors || [], project: p };
  try {
    if (mode === 'local-fs') {
      await fsaWriteProject(p, bundle, silent);
    } else if (mode === 'agent') {
      await fetch('http://localhost:7734/save-project', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: p.name, data: bundle, dir: cfg.localDir || '' }),
        signal: AbortSignal.timeout(4000)
      });
    } else if (mode === 'server' && cfg.serverUrl) {
      await fetch(cfg.serverUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: p.name, data: bundle }),
        signal: AbortSignal.timeout(8000)
      });
    } else if (mode === 'gdrive' && cfg.gdriveUrl) {
      // Strip photo data for auto-save — full photos are synced via manual Drive save
      const lightP = { ...p };
      if (lightP.photos) lightP.photos = lightP.photos.map(({ data, ...rest }) => rest);
      if (lightP.siteMap) { const { data, ...sm } = lightP.siteMap; lightP.siteMap = sm; }
      const lightBundle = { _netrack_version: 2, typeColors: state.typeColors, globalVendors: state.globalVendors || [], project: lightP };
      await fetch(cfg.gdriveUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ filename: p.name.replace(/[^a-z0-9_\-. ]/gi,'_') + '.json', content: JSON.stringify(lightBundle) }),
        signal: AbortSignal.timeout(12000)
      });
    }
  } catch (_) { /* Silent */ }
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
  const m = cfg.mode || 'local-fs';
  if (m === 'none')     { el.textContent = '\u2298 Backup disabled'; return; }
  if (m === 'local-fs') { el.textContent = '\ud83d\udcc2 Auto-backup: USB / Local \u2192 ' + (cfg.fsaDirName || 'no folder chosen'); return; }
  if (m === 'agent')    { const dir = cfg.localDir || './Projects/'; el.textContent = '\ud83d\udcbe Auto-backup: Local Agent \u2192 ' + dir; return; }
  if (m === 'server')   { el.textContent = '\ud83c\udf10 Auto-backup: Custom Server'; return; }
  if (m === 'gdrive')   { el.textContent = '\u2601 Auto-backup: Google Drive'; return; }
}

// ─── Global Settings modal ───
function openGlobalSettings() {
  const cfg = loadBackupConfig();
  const mode = cfg.mode || 'local-fs';
  const localDir = cfg.localDir || '';
  const fsaDirName = cfg.fsaDirName || '';
  const fsaSupported = !!window.showDirectoryPicker;
  const opts = [
    ['local-fs', '\ud83d\udcc2 USB / Local Folder', 'Pick any folder on this machine or USB stick. No installs required. Works in Chrome & Edge.'],
    ['server',   '\ud83c\udf10 Custom Server / NAS', 'POST to any HTTP endpoint you control.'],
    ['agent',    '\ud83d\udcbe Local Agent (Node.js)','Legacy: requires Node.js + agent.js running on port 7734.'],
    ['none',     '\u2298 No Backup',                 "Store in browser localStorage only. Data is lost if you clear browser storage."],
  ];
  const radios = opts.map(([v,label,desc]) => `
    <label style="display:flex;gap:12px;align-items:flex-start;padding:10px 12px;border-radius:6px;border:1px solid ${mode===v?'var(--accent)':'var(--border)'};background:${mode===v?'rgba(0,200,255,.06)':'var(--card)'};cursor:pointer;margin-bottom:7px">
      <input type="radio" name="backup-mode" value="${v}" ${mode===v?'checked':''} onchange="gsOnModeChange()" style="margin-top:2px;accent-color:var(--accent)">
      <div><div style="font-weight:600;font-size:13px">${label}${v==='local-fs'&&!fsaSupported?' <span style="font-size:10px;color:var(--red);font-weight:400">(requires Chrome/Edge)</span>':''}</div><div style="font-size:11px;color:var(--text3);margin-top:2px">${desc}</div></div>
    </label>`).join('');

  openModal(`
    <h3>\u2699 Global Settings &amp; Backup</h3>
    <p style="color:var(--text2);font-size:12px;margin-bottom:16px">Automatic backups fire ~1.5s after any change. Stored as one <code>.json</code> file per project.</p>
    <div class="settings-section">
      <h4>Backup Destination</h4>
      ${radios}

      <div id="gs-local-fs-section" style="${mode==='local-fs'?'':'display:none'}">
        <div style="background:rgba(0,232,122,.04);border:1px solid rgba(0,232,122,.2);border-radius:6px;padding:14px;margin-top:4px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
            <span style="font-size:22px">\ud83d\udcc2</span>
            <div>
              <div style="font-size:11px;color:var(--text3);margin-bottom:2px">Current backup folder</div>
              <div id="gs-fsa-folder-name" style="font-size:13px;font-weight:600;font-family:var(--mono);color:${fsaDirName?'var(--accent)':'var(--text3)'}">${fsaDirName || 'No folder chosen yet'}</div>
            </div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="fsaPickFolder()" style="margin-bottom:10px">\ud83d\udcc1 ${fsaDirName?'Change Folder':'Choose Backup Folder'}</button>
          <div id="gs-fsa-hint" style="${fsaDirName?'display:none':''}; font-size:11px;color:var(--amber);margin-bottom:8px">
            \u26a0 You must choose a folder before backups will work.
          </div>
          <div style="font-size:11px;color:var(--text2);line-height:1.6">
            \u2022 Choose a folder on the USB stick to save alongside the app, or anywhere on this machine.<br>
            \u2022 Each project saves as <code style="color:var(--accent)">ProjectName.json</code> in that folder.<br>
            \u2022 <strong>First visit on a new machine:</strong> re-open Settings and click <em>Change Folder</em> to re-grant access — the browser will remember the folder but needs one click to confirm.<br>
            \u2022 Requires <strong>Chrome or Edge</strong>. Firefox is not supported.
          </div>
        </div>
      </div>


      <div id="gs-server-section" style="${mode==='server'?'':'display:none'}">
        <div class="form-row"><label>Server Endpoint URL</label>
          <input class="form-control" id="gs-server-url" value="${esc(cfg.serverUrl||'')}" placeholder="http://192.168.1.50:8080/save-project">
        </div>
        <div style="font-size:11px;color:var(--text3)">Must accept POST with JSON body <code>{ name, data }</code>.</div>
      </div>

      <div id="gs-agent-section" style="${mode==='agent'?'':'display:none'}">
        <div style="background:rgba(0,200,255,.04);border:1px solid var(--border);border-radius:6px;padding:14px;margin-top:4px">
          <div class="form-row" style="margin-bottom:8px">
            <label style="display:flex;align-items:center;justify-content:space-between">
              <span>Backup Folder Path</span>
              <span style="font-size:10px;color:var(--text3);font-weight:400">Leave blank to use default</span>
            </label>
            <input class="form-control" id="gs-local-dir" value="${esc(localDir)}" placeholder="./Projects/" style="font-family:var(--mono);font-size:12px">
            <div style="font-size:11px;color:var(--text3);margin-top:5px">
              Default is <code style="color:var(--accent)">./Projects/</code> next to the HTML file.<br>
              Absolute paths also work: <code style="color:var(--accent)">C:\\Backups\\VanNice</code>
            </div>
          </div>
          <div style="font-size:11px;color:var(--text2);border-top:1px solid var(--border);padding-top:10px">
            <strong style="color:#cce4f8">Requires:</strong> Node.js + <code style="color:var(--accent)">agent.js</code> running on port 7734.
          </div>
        </div>
      </div>

    </div>
    <div class="settings-section">
      <h4>Manual Backup</h4>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="gsBackupAllNow()">\u2601 Backup All Projects Now</button>
        <button class="btn btn-ghost btn-sm" onclick="exportData()">\u21e7 Export Current Project JSON</button>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="gsSaveSettings()">Save Settings</button>
    </div>`, '580px');
}

function gsOnModeChange() {
  const mode = document.querySelector('input[name="backup-mode"]:checked')?.value || 'local-fs';
  ['local-fs','agent','server'].forEach(m => {
    const el = document.getElementById('gs-' + m + '-section');
    if (el) el.style.display = mode === m ? '' : 'none';
  });
  document.querySelectorAll('input[name="backup-mode"]').forEach(r => {
    const lbl = r.closest('label');
    if (!lbl) return;
    lbl.style.borderColor = r.checked ? 'var(--accent)' : 'var(--border)';
    lbl.style.background  = r.checked ? 'rgba(0,200,255,.06)' : 'var(--card)';
  });
}

function gsSaveSettings() {
  const mode = document.querySelector('input[name="backup-mode"]:checked')?.value || 'local-fs';
  const cfg = {
    mode,
    fsaDirName: loadBackupConfig().fsaDirName || '',
    localDir:   document.getElementById('gs-local-dir')?.value?.trim()  || '',
    serverUrl:  document.getElementById('gs-server-url')?.value?.trim() || '',
    gdriveUrl:  ''
  };
  saveBackupConfig(cfg); closeModal(); toast('Backup settings saved', 'success');
}


async function gsBackupAllNow() {
  const cfg = loadBackupConfig();
  if ((cfg.mode || 'agent') === 'none') { toast('Backup is disabled \u2014 enable it in Settings first', 'error'); return; }
  let ok = 0, fail = 0;
  for (const p of state.projects) { try { await backupProjectToAgent(p, false); ok++; } catch(e) { fail++; } }
  toast('Backed up ' + ok + ' project' + (ok !== 1 ? 's' : '') + (fail ? ' (' + fail + ' failed)' : ''), ok ? 'success' : 'error');
}

// \u2500\u2500\u2500 Google Drive Walkthrough \u2500\u2500\u2500
function openGDriveWalkthrough() {
  const appsScript = [
    'function doPost(e) {',
    '  try {',
    '    var body     = JSON.parse(e.postData.contents);',
    '    var filename = body.filename || \'netrack-backup.json\';',
    '    var content  = body.content  || \'{}\';',
    '    // Saves into a folder called "Van Nice Backups" in your Drive:',
    '    var folderName = \'Van Nice Backups\';',
    '    var folders = DriveApp.getFoldersByName(folderName);',
    '    var folder  = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);',
    '    var files = folder.getFilesByName(filename);',
    '    if (files.hasNext()) {',
    '      files.next().setContent(content);',
    '    } else {',
    '      folder.createFile(filename, content, MimeType.PLAIN_TEXT);',
    '    }',
    '    return ContentService',
    '      .createTextOutput(JSON.stringify({ ok: true, file: filename }))',
    '      .setMimeType(ContentService.MimeType.JSON);',
    '  } catch(err) {',
    '    return ContentService',
    '      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))',
    '      .setMimeType(ContentService.MimeType.JSON);',
    '  }',
    '}'
  ].join('\n');

  const steps = [
    ['1','Open Google Apps Script',
     'Go to <a href="https://script.google.com" target="_blank" style="color:var(--accent)">script.google.com</a> and sign in. Click <strong>New project</strong> and name it <em>Van Nice Backup</em>.'],
    ['2','Paste the Apps Script code',
     'Delete all existing code in the editor, paste the script below, then click <strong>Save</strong> (Ctrl+S).<br><br>' +
     '<button class="btn btn-ghost btn-sm" style="font-size:10px;margin-bottom:6px" onclick="navigator.clipboard.writeText(document.getElementById(\'gd-script\').innerText).then(()=>toast(\'Copied!\',\'success\'))">\u29c8 Copy script</button>' +
     '<pre class="gs-code" id="gd-script" style="white-space:pre-wrap;font-size:10px;max-height:180px;overflow-y:auto">' + appsScript.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</pre>'],
    ['3','Deploy as a Web App',
     'Click <strong>Deploy \u2192 New deployment</strong>.<br>Under <em>Select type</em> choose <strong>Web app</strong>. Configure:<ul style="margin:6px 0 0 16px;font-size:12px;color:var(--text2)"><li><strong>Execute as:</strong> Me</li><li><strong>Who has access:</strong> Anyone</li></ul><br>Click <strong>Deploy</strong>, accept the Google permissions popup, then copy the <strong>Web app URL</strong>.'],
    ['4','Paste the URL &amp; save settings',
     'Click <strong>\u2190 Back to Settings</strong> below. Select <strong>Google Drive</strong>, paste the URL, and click <strong>Save Settings</strong>.'],
    ['5','Test the connection',
     'Click <strong>\u2601 Backup All Projects Now</strong> in the Settings modal. Then open <a href="https://drive.google.com" target="_blank" style="color:var(--accent)">drive.google.com</a> \u2014 you should see a <em>Van Nice Backups</em> folder with one <code>.json</code> file per project.'],
  ];

  openModal(`
    <h3>\u2601 Google Drive Backup \u2014 Setup Guide</h3>
    <p style="color:var(--text2);font-size:12px;margin-bottom:14px">One-time setup. Takes about 5 minutes. After this, every save in Van Nice Site Manager automatically backs up to your Drive.</p>
    <div style="max-height:450px;overflow-y:auto;padding-right:4px">
      ${steps.map(([n,title,body]) => `
        <div style="display:flex;gap:14px;margin-bottom:18px;align-items:flex-start">
          <div style="width:28px;height:28px;min-width:28px;border-radius:50%;background:var(--accent);color:#000;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center">${n}</div>
          <div>
            <div style="font-weight:600;font-size:13px;margin-bottom:5px">${title}</div>
            <div style="font-size:12px;color:var(--text2);line-height:1.65">${body}</div>
          </div>
        </div>`).join('')}
      <div style="background:rgba(255,170,0,.07);border:1px solid rgba(255,170,0,.25);border-radius:6px;padding:12px;font-size:11px;color:var(--text2)">
        <strong style="color:var(--amber)">\u26a0 Privacy note:</strong> Setting access to <em>Anyone</em> means anyone with the URL can write files to that Drive folder. Treat the URL like a password. To restrict access, set <em>Who has access</em> to <em>Only myself</em> and add a secret token check in the script.
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Close</button>
      <button class="btn btn-primary" onclick="closeModal();openGlobalSettings()">\u2190 Back to Settings</button>
    </div>`, '650px');
}

function fmtTs(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
  } catch(e) { return iso; }
}

// Returns "PP-A-P21" style string for any patch panel ports this device is assigned to
function getPatchConnection(deviceId, p) {
  const hits = [];
  p.devices.forEach(d => {
    if (d.deviceType !== 'Patch Panel') return;
    const assignments = d.portAssignments || {};
    Object.entries(assignments).forEach(([port, devId]) => {
      if (devId === deviceId) hits.push(`${d.name}-P${port}`);
    });
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


function openModal(html, width) {
  const box = document.getElementById('modal-content');
  box.innerHTML = html;
  box.classList.remove('modal-wide');
  box.style.width = width || '';
  box.style.maxWidth = width ? '98vw' : '';
  document.getElementById('modal-overlay').classList.add('open');
}

function showScreen(id) {
  // Multi-page: project screen is index.html, app screen is the current page
  if (id === 'screen-projects') {
    window.location.href = 'index.html';
    return;
  }
  // On app pages, the screen is already active
  const el = document.getElementById(id);
  if (el) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    el.classList.add('active');
  }
}

function closeModal() {
  document.getElementById('modal-content').classList.remove('modal-wide');
  document.getElementById('modal-overlay').classList.remove('open');
}

function toggleSidebar() {
  const sb = document.querySelector('.sidebar');
  const btn = document.getElementById('sidebar-toggle-btn');
  if (!sb) return;
  const collapsed = sb.classList.toggle('collapsed');
  if (btn) btn.title = collapsed ? 'Show menu' : 'Hide menu';
}

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

// Escape key no longer closes modals — use Cancel/Save/Close buttons only


async function lookupMacManufacturers() {
  const p = getProject();
  // Treat blank, n/a, N/A, [n/a], [N/A], unknown, - as "missing"
  function isMissing(m) {
    if (!m) return true;
    const v = m.trim().toLowerCase().replace(/[\[\]]/g,'');
    return !v || v === 'n/a' || v === 'unknown' || v === '-' || v === 'none';
  }
  const needsLookup = p.devices.filter(d => d.mac && isMissing(d.manufacturer));
  if (needsLookup.length === 0) return toast('No devices with missing manufacturer info', 'error');

  // First pass: check local manufacturer list (OUI matches from globalVendors/existing devices)
  let localMatched = 0;
  if (typeof _autoResolveByOUI === 'function') {
    localMatched = _autoResolveByOUI();
  }
  // Re-filter after local matches
  const stillNeeds = p.devices.filter(d => d.mac && isMissing(d.manufacturer));
  if (stillNeeds.length === 0) {
    save();
    if (typeof renderDevices === 'function') renderDevices();
    return toast(`Resolved all ${localMatched} device${localMatched!==1?'s':''} from local manufacturer list`, 'success');
  }

  toast(`Resolved ${localMatched} locally. Looking up ${stillNeeds.length} MAC address${stillNeeds.length!==1?'es':''} online…`);
  let updated = 0, failed = 0;

  // Helper: try fetching manufacturer via CORS-enabled proxy → macvendors.com
  async function fetchVendor(mac6) {
    // Strategy 1: codetabs.com CORS proxy (has Access-Control-Allow-Origin: *)
    try {
      const r = await fetch(`https://api.codetabs.com/v1/proxy/?quest=https://api.macvendors.com/${mac6}`, { signal: AbortSignal.timeout(10000) });
      if (r.ok) {
        const text = (await r.text()).trim();
        if (text && text.length < 200 && !text.toLowerCase().includes('not found') && !text.startsWith('<') && !text.startsWith('{')) return text;
      }
    } catch(e) {}
    // Strategy 2: allorigins.win JSON wrapper (backup)
    try {
      const proxyUrl = 'https://api.allorigins.win/get?url=' + encodeURIComponent('https://api.macvendors.com/' + mac6);
      const r = await fetch(proxyUrl, { signal: AbortSignal.timeout(10000) });
      if (r.ok) {
        const j = await r.json();
        if (j.status && j.status.http_code === 200 && j.contents) {
          const text = j.contents.trim();
          if (text && text.length < 200 && !text.toLowerCase().includes('not found') && !text.startsWith('<') && !text.startsWith('{')) return text;
        }
      }
    } catch(e) {}
    return null;
  }

  for (const dev of stillNeeds) {
    const mac = dev.mac.replace(/[^0-9a-fA-F]/g,'').slice(0,6).toUpperCase();
    if (mac.length < 6) { failed++; continue; }
    const vendor = await fetchVendor(mac);
    if (vendor) { dev.manufacturer = vendor; updated++; }
    else { failed++; }
    await new Promise(r => setTimeout(r, 1100));
  }
  save();
  toast(`Updated ${updated} manufacturer${updated!==1?'s':''}${failed?' ('+failed+' not found)':''}`, updated>0?'success':'error');
  if (typeof renderDevices === 'function') renderDevices();
}


// ─── Import / Export (needed from sidebar on every page) ───
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
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 5000);
    logChange('Project exported manually');
    toast('Project exported', 'success');
  } catch (err) {
    console.error('Export error:', err);
    toast('Export failed: ' + err.message, 'error');
  }
}

function importData() { document.getElementById('import-input')?.click(); }

// Memory-efficient JSON import: strips large data URIs from the raw text and
// saves each one to IDB individually, then parses the now-small JSON string.
// This avoids the 3-4x memory multiplier of JSON.parse on huge files.
async function _streamingJsonImport(file) {
  let text = await file.text();
  const dataPattern = /"(data|image)"\s*:\s*"(data:image\/[^"]*)"/g;
  const entries = [];
  let tempCount = 0;

  try {
    let m;
    while ((m = dataPattern.exec(text)) !== null) {
      const tempKey = `_import_temp_${tempCount}`;
      await _idbSavePhotoData(tempKey, m[2]);
      entries.push({ start: m.index, end: m.index + m[0].length, fieldName: m[1], tempKey });
      tempCount++;
    }

    // Rebuild text with small placeholders instead of huge data URIs
    const parts = [];
    let pos = 0;
    for (const e of entries) {
      parts.push(text.substring(pos, e.start));
      parts.push(`"${e.fieldName}":"${e.tempKey}"`);
      pos = e.end;
    }
    parts.push(text.substring(pos));
    text = null; // allow GC to reclaim the large string

    return { parsed: JSON.parse(parts.join('')), tempCount };
  } catch (err) {
    for (let i = 0; i < tempCount; i++) {
      try { await _idbDeletePhotoData(`_import_temp_${i}`); } catch(e) {}
    }
    throw err;
  }
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
      // ─── ZIP format: project.json + individual photo files ───
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

      // Extract photos from ZIP to IDB one at a time
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

      // Site map
      const smFile = zip.file('media/sitemap');
      if (smFile && p.siteMap) {
        await _idbSavePhotoData('sitemap_' + p.id, await smFile.async('text'));
        p.siteMap.data = null;
      }

      // Cable run map
      const crFile = zip.file('media/cablemap');
      if (crFile && p.cableRunMap) {
        await _idbSavePhotoData('cablemap_' + p.id, await crFile.async('text'));
        p.cableRunMap.image = null;
      }

    } else {
      // ─── JSON format (always use streaming to avoid memory crash) ───
      let parsed;
      const useStreaming = true;
      const result = await _streamingJsonImport(file);
      parsed = result.parsed;
      streamTempCount = result.tempCount;

      if (parsed._netrack_version === 2 && parsed.project) {
        p = parsed.project;
        importedColors = parsed.typeColors;
        importedVendors = parsed.globalVendors;
      } else if (parsed.id && parsed.name) {
        p = parsed;
      } else {
        if (useStreaming) await _cleanupImportTemp(streamTempCount);
        throw new Error('Unrecognised file format');
      }
      if (!p.id || !p.name) {
        if (useStreaming) await _cleanupImportTemp(streamTempCount);
        throw new Error('Missing project id or name');
      }
      migrateProject(p);

      // Extract/move photo data to IDB
      for (const ph of (p.photos || [])) {
        if (useStreaming && ph.data && typeof ph.data === 'string' && ph.data.startsWith('_import_temp_')) {
          // Streaming: move from temp IDB key to actual photo key
          const actualData = await _idbGetPhotoData(ph.data);
          if (actualData) {
            if (!ph.thumb) ph.thumb = await _generateThumb(actualData) || '';
            if (!ph.dataLen) ph.dataLen = actualData.length;
            await _idbSavePhotoData(ph.id, actualData);
          }
          await _idbDeletePhotoData(ph.data);
          ph.data = null;
        } else if (ph.data) {
          // Normal: save inline data directly
          if (!ph.thumb) ph.thumb = await _generateThumb(ph.data) || '';
          if (!ph.dataLen) ph.dataLen = ph.data.length;
          await _idbSavePhotoData(ph.id, ph.data);
          ph.data = null;
        }
        delete ph._editorSrc;
      }

      // Site map
      if (useStreaming && p.siteMap?.data?.startsWith?.('_import_temp_')) {
        const d = await _idbGetPhotoData(p.siteMap.data);
        if (d) await _idbSavePhotoData('sitemap_' + p.id, d);
        await _idbDeletePhotoData(p.siteMap.data);
        p.siteMap.data = null;
      } else if (p.siteMap?.data) {
        await _idbSavePhotoData('sitemap_' + p.id, p.siteMap.data);
        p.siteMap.data = null;
      }

      // Cable run map
      if (useStreaming && p.cableRunMap?.image?.startsWith?.('_import_temp_')) {
        const d = await _idbGetPhotoData(p.cableRunMap.image);
        if (d) await _idbSavePhotoData('cablemap_' + p.id, d);
        await _idbDeletePhotoData(p.cableRunMap.image);
        p.cableRunMap.image = null;
      } else if (p.cableRunMap?.image) {
        await _idbSavePhotoData('cablemap_' + p.id, p.cableRunMap.image);
        p.cableRunMap.image = null;
      }

      if (useStreaming) await _cleanupImportTemp(streamTempCount);
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
