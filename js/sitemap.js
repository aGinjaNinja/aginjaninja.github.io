// ═══════════════════════════════════════════
//  SITE MAPS — floor plans, rack placement,
//  cable-run drawing, symbols & text
//  Data: p.siteMapFloors[] { id, name, thumb,
//    markers[], cableLines[], symbols[], texts[] }
//  Images in IDB: sitemap_<projectId>_<floorId>
// ═══════════════════════════════════════════

const SM_SYMBOLS = {
  floorup:   { icon: '⬆', label: 'Floor Up' },
  floordown: { icon: '⬇', label: 'Floor Down' },
  conduit:   { icon: '▭', label: 'Conduit' }
};

let _smFloorId = null;
let _smMode = 'view';            // view | draw | text | sym:<type> | rack:<id>
let _smColor = '#00c8ff';
let _smDraft = null;             // { points:[{x,y}] } while drawing
let _smPendingRun = null;        // cable run id waiting to be mapped
let _smUndo = [];                // [{kind:'line'|'symbol'|'text'|'marker', id}]
let _smZoom = 1, _smPan = { x: 0, y: 0 };
let _smDragP = null, _smPinch = null, _smLastTap = 0, _smMoved = false;
let _smElDrag = null;            // dragging a placed element
let _smAddName = '';             // pending name for new map image

function _smFloors() {
  const p = getProject();
  if (!p.siteMapFloors) p.siteMapFloors = [];
  p.siteMapFloors.forEach(f => {
    if (!f.markers) f.markers = [];
    if (!f.cableLines) f.cableLines = [];
    if (!f.symbols) f.symbols = [];
    if (!f.texts) f.texts = [];
  });
  return p.siteMapFloors;
}
function _smFloor() { return _smFloors().find(f => f.id === _smFloorId) || null; }
function _smImgKey(floorId) { return 'sitemap_' + getProject().id + '_' + floorId; }

// ═══════════════════════════════════════════
//  PHOTOS-PAGE SECTION
// ═══════════════════════════════════════════
function siteMapsSectionHtml() {
  const floors = _smFloors();
  const cards = floors.map(f => `
    <div class="sm-card" onclick="openMapStudio('${f.id}')">
      <div class="sm-card-thumb" style="${f.thumb ? `background-image:url('${f.thumb}')` : ''}">${f.thumb ? '' : '🗺'}</div>
      <div class="sm-card-name">${esc(f.name)}</div>
    </div>`).join('');
  return `
    <div class="section-hdr" style="margin-top:4px">
      <span class="sh-title">🗺 Site Maps & Floor Plans</span>
      <button class="btn btn-ghost btn-sm" onclick="smAddMapFlow()">+ Map</button>
    </div>
    <div class="sm-strip">
      ${cards || `<div class="sm-card sm-card-empty" onclick="smAddMapFlow()"><div class="sm-card-thumb">＋</div><div class="sm-card-name">Add floor plan</div></div>`}
    </div>`;
}

// ── Add a new map (name + image) ──
function smAddMapFlow() {
  openModal(`
    <h3>🗺 New Site Map</h3>
    <div class="form-row"><label>Name *</label>
      <input class="form-control" id="sm-new-name" placeholder="e.g. Lodge Floor 1" autofocus></div>
    <p style="font-size:12.5px;color:var(--text2);margin-bottom:6px">Pick a floor plan image — a photo of a blueprint works great.</p>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="smPickMapImage()">📁 Choose Image</button>
    </div>`);
  setTimeout(() => document.getElementById('sm-new-name')?.focus(), 50);
}

function smPickMapImage() {
  const name = document.getElementById('sm-new-name')?.value?.trim();
  if (!name) return toast('Enter a name first', 'error');
  _smAddName = name;
  document.getElementById('sitemap-upload')?.click();
}

async function handleSiteMapUpload(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const blob = await _convertHeicIfNeeded(file, file.name);
    const dataUrl = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
    const p = getProject();
    const floors = _smFloors();
    let floor = _smFloor();
    if (_smAddName || !floor) {
      floor = { id: genId(), name: _smAddName || ('Map ' + (floors.length + 1)), thumb: '', markers: [], cableLines: [], symbols: [], texts: [] };
      floors.push(floor);
    }
    await _idbSavePhotoData(_smImgKey(floor.id), dataUrl);
    floor.thumb = await _generateThumb(dataUrl, 400) || '';
    logChange(`Site map ${_smAddName ? 'added' : 'image replaced'}: "${floor.name}"`);
    _smAddName = '';
    save();
    if (typeof _gdriveQueuePhotoSync === 'function') _gdriveQueuePhotoSync();
    closeModal();
    openMapStudio(floor.id);
  } catch (err) {
    console.error('Site map upload error:', err);
    toast('Could not load that image', 'error');
  }
}

// ═══════════════════════════════════════════
//  MAP STUDIO (full-screen overlay)
// ═══════════════════════════════════════════
async function openMapStudio(floorId, opts = {}) {
  const p = getProject();
  const floors = _smFloors();
  if (floors.length === 0) { smAddMapFlow(); return; }
  const floor = floors.find(f => f.id === floorId) || floors[0];
  _smFloorId = floor.id;
  _smMode = opts.mode || 'view';
  _smPendingRun = opts.runId || null;
  _smDraft = null; _smUndo = [];
  _smZoom = 1; _smPan = { x: 0, y: 0 };

  closeMapStudio();
  const el = document.createElement('div');
  el.id = 'sm-studio';
  el.innerHTML = `
    <div class="sm-top">
      <button class="icon-btn" onclick="closeMapStudio()" title="Close">✕</button>
      <div class="sm-title" onclick="smFloorSheet()">
        <span id="sm-title-name">${esc(floor.name)}</span> <span style="color:var(--text3);font-size:11px">▾</span>
      </div>
      <input type="color" id="sm-color" value="${_smColor}" title="Drawing color" oninput="_smColor=this.value">
      <button class="icon-btn" onclick="smUndoLast()" title="Undo">↶</button>
    </div>
    <div class="sm-modebar" id="sm-modebar"></div>
    <div class="sm-stage" id="sm-stage">
      <div class="sm-transform" id="sm-transform">
        <img class="sm-img" id="sm-img" draggable="false">
        <svg class="sm-svg" id="sm-svg" viewBox="0 0 100 100" preserveAspectRatio="none"></svg>
        <div class="sm-overlays" id="sm-overlays"></div>
      </div>
      <div class="sm-loading" id="sm-loading">Loading map…</div>
      <div class="sm-drawbar" id="sm-drawbar" style="display:none">
        <button class="btn btn-ghost btn-sm" onclick="smCancelDraw()">✕ Cancel</button>
        <span id="sm-drawhint" style="font-size:11px;color:var(--text2);font-family:var(--mono)">Tap to add points</span>
        <button class="btn btn-primary btn-sm" onclick="smFinishDraw()">✓ Finish</button>
      </div>
      <div class="sm-hint" id="sm-hint"></div>
    </div>
    <div class="sm-rackstrip" id="sm-rackstrip" style="display:none"></div>
  `;
  el.addEventListener('contextmenu', e => e.preventDefault());
  document.body.appendChild(el);

  // Stage interactions (pan / zoom / tap)
  const stage = document.getElementById('sm-stage');
  stage.addEventListener('wheel', _smWheel, { passive: false });
  stage.addEventListener('pointerdown', _smPtrDown);
  stage.addEventListener('pointermove', _smPtrMove);
  stage.addEventListener('pointerup', _smPtrUp);
  stage.addEventListener('pointercancel', _smPtrCancel);
  stage.addEventListener('touchstart', _smTouchStart, { passive: false });
  stage.addEventListener('touchmove', _smTouchMove, { passive: false });
  stage.addEventListener('touchend', _smTouchEnd, { passive: true });

  smSetMode(_smMode);
  smRedraw();

  // Load the full-res floor image (IDB → Drive fallback)
  const img = document.getElementById('sm-img');
  const data = await _lazyGetPhotoData(_smImgKey(floor.id));
  const loading = document.getElementById('sm-loading');
  if (data) {
    img.onload = () => { if (loading) loading.style.display = 'none'; smRedraw(); };
    img.src = data;
  } else if (floor.thumb) {
    img.onload = () => { if (loading) loading.style.display = 'none'; smRedraw(); };
    img.src = floor.thumb;
    toast('Showing preview — full map loads from Drive when signed in', 'warning');
  } else {
    if (loading) loading.innerHTML = `No image for this map.<br><br><button class="btn btn-primary btn-sm" onclick="_smAddName='';document.getElementById('sitemap-upload').click()">📁 Choose Image</button>`;
  }

  if (_smPendingRun) {
    const run = (p.cableRuns || []).find(r => r.id === _smPendingRun);
    if (run) {
      if (run.color) { _smColor = run.color; const ci = document.getElementById('sm-color'); if (ci) ci.value = run.color; }
      smSetMode('draw');
      toast(`Draw the path for "${run.label || 'cable run'}" — tap to add points`, 'success');
    }
  }
}

function closeMapStudio() {
  document.getElementById('sm-studio')?.remove();
  _smDraft = null; _smElDrag = null; _smDragP = null; _smPinch = null;
}

// ── Mode bar ──
function smSetMode(mode) {
  _smMode = mode;
  // NOTE: an in-progress draft line survives mode switches — only
  // Cancel discards it and only Finish saves it.
  const bar = document.getElementById('sm-modebar');
  if (!bar) return;
  const chip = (m, ico, lbl) => `<div class="sm-chip ${_smMode === m ? 'on' : ''}" onclick="smSetMode('${m}')">${ico}<span>${lbl}</span></div>`;
  bar.innerHTML =
    chip('view', '✋', 'Move') +
    chip('draw', '✏️', 'Draw') +
    chip('sym:floorup', '⬆', 'Up') +
    chip('sym:floordown', '⬇', 'Down') +
    chip('sym:conduit', '▭', 'Conduit') +
    chip('text', '🅣', 'Text') +
    `<div class="sm-chip ${_smMode.startsWith('rack:') || _smMode.startsWith('dev:') ? 'on' : ''}" onclick="smToggleRackStrip()">▤<span>Place</span></div>`;
  const drawbar = document.getElementById('sm-drawbar');
  if (drawbar) drawbar.style.display = (mode === 'draw' && _smDraft) ? 'flex' : 'none';
  const hint = document.getElementById('sm-hint');
  if (hint) {
    hint.textContent =
      mode === 'draw' ? 'Tap to add points · two fingers to pan/zoom' :
      mode === 'text' ? 'Tap the map to place a text box' :
      mode.startsWith('sym:') ? `Tap the map to place: ${SM_SYMBOLS[mode.slice(4)]?.label || ''}` :
      mode.startsWith('rack:') ? 'Tap the map to place the rack' :
      mode.startsWith('dev:') ? 'Tap the map to place the device' :
      _smDraft ? 'Draft line kept — go to ✏️ Draw to continue it' :
      'Drag to pan · pinch to zoom · tap items to edit · hold to move them';
  }
}

function smToggleRackStrip() {
  const strip = document.getElementById('sm-rackstrip');
  if (!strip) return;
  if (strip.style.display !== 'none') { strip.style.display = 'none'; smSetMode('view'); return; }
  const p = getProject();
  const f = _smFloor();
  const placedRacks = new Set((f?.markers || []).filter(m => m.rackId).map(m => m.rackId));
  const placedDevs = new Set((f?.markers || []).filter(m => m.devId).map(m => m.devId));
  const racks = p.racks.filter(r => !placedRacks.has(r.id));
  // Wall-mount gear: unracked devices (cameras, APs, access control…) — racked
  // equipment is already located by its rack's marker.
  const devs = p.devices.filter(d => !d.rackId && !placedDevs.has(d.id))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const chip = (mode, color, radius, name) => `
    <div class="pool-chip" onclick="smSetMode('${mode}');document.querySelectorAll('#sm-rackstrip .pool-chip').forEach(c=>c.style.borderColor='');this.style.borderColor='var(--accent)'">
      <span class="pc-dot" style="background:${color};border-radius:${radius}"></span>
      <span class="pc-name">${esc(name)}</span>
    </div>`;
  strip.innerHTML = (racks.length === 0 && devs.length === 0)
    ? `<div style="font-size:11px;color:var(--text3);font-family:var(--mono);padding:8px 4px">All racks and unracked devices are placed on this map</div>`
    : `<div style="font-size:10px;color:var(--text3);font-family:var(--mono);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Tap an item, then tap its spot on the map</div>
       <div class="pool-strip">${racks.map(r => chip('rack:' + r.id, 'var(--accent)', '2px', r.name)).join('')}${devs.map(d => chip('dev:' + d.id, dtColor(d.deviceType || 'Misc.'), '50%', d.name)).join('')}</div>`;
  strip.style.display = 'block';
  smSetMode('view');
}

// ═══════════════════════════════════════════
//  RENDERING
// ═══════════════════════════════════════════
// Keep the SVG + overlay layers exactly on the rendered image box
function _smSyncLayers() {
  const img = document.getElementById('sm-img');
  const svg = document.getElementById('sm-svg');
  const ov = document.getElementById('sm-overlays');
  if (!img || !svg || !ov) return;
  const l = img.offsetLeft + 'px', t = img.offsetTop + 'px';
  const w = img.offsetWidth + 'px', h = img.offsetHeight + 'px';
  [svg, ov].forEach(x => { x.style.left = l; x.style.top = t; x.style.width = w; x.style.height = h; });
}
if (!window._smResizeWired) {
  window._smResizeWired = true;
  window.addEventListener('resize', () => { if (document.getElementById('sm-studio')) _smSyncLayers(); });
}

function smRedraw() {
  _smSyncLayers();
  const f = _smFloor();
  const svg = document.getElementById('sm-svg');
  const ov = document.getElementById('sm-overlays');
  if (!f || !svg || !ov) return;
  const p = getProject();

  // Cable lines (+ invisible fat hit lines) + draft.
  // A line currently being extended renders only as the draft.
  let s = '';
  f.cableLines.forEach(l => {
    if (_smDraft && _smDraft.editId === l.id) return;
    const pts = (l.points || []).map(pt => `${pt.x},${pt.y}`).join(' ');
    if (!pts) return;
    s += `<polyline points="${pts}" fill="none" stroke="${esc(l.color || '#00c8ff')}" stroke-width="3" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round" opacity=".92"/>`;
    s += `<polyline points="${pts}" fill="none" stroke="rgba(0,0,0,0.001)" stroke-width="18" vector-effect="non-scaling-stroke" style="pointer-events:stroke;cursor:pointer" onclick="smLineSheet('${l.id}')"/>`;
  });
  if (_smDraft && _smDraft.points.length) {
    const pts = _smDraft.points.map(pt => `${pt.x},${pt.y}`).join(' ');
    s += `<polyline points="${pts}" fill="none" stroke="${_smColor}" stroke-width="3" vector-effect="non-scaling-stroke" stroke-dasharray="6 5" stroke-linejoin="round" stroke-linecap="round"/>`;
    _smDraft.points.forEach(pt => {
      s += `<circle cx="${pt.x}" cy="${pt.y}" r="0.9" fill="${_smColor}" stroke="#000" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    });
  }
  svg.innerHTML = s;

  // Line labels + markers + symbols + texts (HTML layer)
  let o = '';
  f.cableLines.forEach(l => {
    if (_smDraft && _smDraft.editId === l.id) return;
    if (!l.label || !(l.points || []).length) return;
    const mid = l.points[Math.floor(l.points.length / 2)];
    o += `<div class="sm-linelbl" style="left:${mid.x}%;top:${mid.y}%;color:${esc(l.color || '#00c8ff')}" onclick="smLineSheet('${l.id}')">${esc(l.label)}</div>`;
  });
  f.markers.filter(m => m.rackId).forEach(m => {
    const rack = p.racks.find(r => r.id === m.rackId);
    if (!rack) return;
    o += `<div class="sm-el sm-rackmark" style="left:${m.x}%;top:${m.y}%" onpointerdown="smElDown(event,'marker','${m.id}')">
      <div class="sm-rackbox">▤</div><div class="sm-ellbl">${esc(rack.name)}</div>
    </div>`;
  });
  f.markers.filter(m => m.devId).forEach(m => {
    const dev = p.devices.find(d => d.id === m.devId);
    if (!dev) return;
    const c = dtColor(dev.deviceType || 'Misc.');
    o += `<div class="sm-el sm-devmark" style="left:${m.x}%;top:${m.y}%" onpointerdown="smElDown(event,'marker','${m.id}')">
      <div class="sm-devdot" style="background:${c};box-shadow:0 0 9px ${c}99"></div><div class="sm-ellbl">${esc(dev.name)}</div>
    </div>`;
  });
  f.symbols.forEach(sy => {
    const def = SM_SYMBOLS[sy.type] || { icon: '?' };
    o += `<div class="sm-el sm-sym" style="left:${sy.x}%;top:${sy.y}%" onpointerdown="smElDown(event,'symbol','${sy.id}')">
      <div class="sm-symbox" style="border-color:${esc(sy.color || '#00c8ff')};color:${esc(sy.color || '#00c8ff')}">${def.icon}</div>
      ${sy.label ? `<div class="sm-ellbl">${esc(sy.label)}</div>` : ''}
    </div>`;
  });
  f.texts.forEach(t => {
    o += `<div class="sm-el sm-text" style="left:${t.x}%;top:${t.y}%;color:${esc(t.color || '#fff')}" onpointerdown="smElDown(event,'text','${t.id}')">${esc(t.text)}</div>`;
  });
  ov.innerHTML = o;

  const drawbar = document.getElementById('sm-drawbar');
  if (drawbar) drawbar.style.display = (_smMode === 'draw' && _smDraft) ? 'flex' : 'none';
}

// ═══════════════════════════════════════════
//  PAN / ZOOM / TAP ENGINE
// ═══════════════════════════════════════════
function _smApply() {
  const t = document.getElementById('sm-transform');
  if (t) t.style.transform = `translate(${_smPan.x}px, ${_smPan.y}px) scale(${_smZoom})`;
}
function _smStagePoint(cx, cy) {
  const stage = document.getElementById('sm-stage');
  const r = stage.getBoundingClientRect();
  return { x: cx - r.left - r.width / 2, y: cy - r.top - r.height / 2 };
}
function _smSetZoom(z, cx, cy) {
  z = Math.max(0.5, Math.min(12, z));
  const k = z / _smZoom;
  _smPan.x = cx - k * (cx - _smPan.x);
  _smPan.y = cy - k * (cy - _smPan.y);
  _smZoom = z;
  _smApply();
}
function _smWheel(e) {
  e.preventDefault();
  const pt = _smStagePoint(e.clientX, e.clientY);
  _smSetZoom(_smZoom * (e.deltaY > 0 ? 0.85 : 1.18), pt.x, pt.y);
}
function _smEventPct(cx, cy) {
  const img = document.getElementById('sm-img');
  if (!img || img.offsetWidth < 4) return null;
  const r = img.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  const x = (cx - r.left) / r.width * 100;
  const y = (cy - r.top) / r.height * 100;
  if (x < -2 || x > 102 || y < -2 || y > 102) return null;
  return { x: Math.max(0, Math.min(100, +x.toFixed(2))), y: Math.max(0, Math.min(100, +y.toFixed(2))) };
}

function _smPtrDown(e) {
  if (_smElDrag) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (e.pointerType !== 'mouse' && e.isPrimary === false) return;
  _smDragP = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY };
  _smMoved = false;
}
function _smPtrMove(e) {
  if (_smElDrag) { _smElMove(e); return; }
  if (!_smDragP || _smPinch) return;
  const dx = e.clientX - _smDragP.x, dy = e.clientY - _smDragP.y;
  if (Math.abs(e.clientX - _smDragP.sx) > 6 || Math.abs(e.clientY - _smDragP.sy) > 6) _smMoved = true;
  if (_smMoved) {
    _smPan.x += dx; _smPan.y += dy;
    _smDragP.x = e.clientX; _smDragP.y = e.clientY;
    _smApply();
  }
}
function _smPtrUp(e) {
  if (_smElDrag) { _smElUp(e); return; }
  if (!_smDragP) return;
  const wasMoved = _smMoved;
  _smDragP = null;
  if (wasMoved || _smPinch) return;
  _smTap(e.clientX, e.clientY);
}
function _smPtrCancel() { _smDragP = null; _smMoved = false; }

function _smTouchStart(e) {
  if (e.touches.length === 2) {
    e.preventDefault();
    const [a, b] = e.touches;
    _smPinch = { dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), zoom: _smZoom };
    _smDragP = null;
  } else if (e.touches.length === 1) {
    const now = Date.now();
    if (now - _smLastTap < 300 && _smMode === 'view') {
      e.preventDefault();
      const t = e.touches[0];
      const pt = _smStagePoint(t.clientX, t.clientY);
      _smSetZoom(_smZoom > 1 ? 1 : 2.5, pt.x, pt.y);
      if (_smZoom === 1) { _smPan = { x: 0, y: 0 }; _smApply(); }
      _smLastTap = 0;
      return;
    }
    _smLastTap = now;
  }
}
function _smTouchMove(e) {
  if (_smPinch && e.touches.length === 2) {
    e.preventDefault();
    const [a, b] = e.touches;
    const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const midX = (a.clientX + b.clientX) / 2, midY = (a.clientY + b.clientY) / 2;
    const mid = _smStagePoint(midX, midY);
    _smSetZoom(_smPinch.zoom * (dist / _smPinch.dist), mid.x, mid.y);
    _smMoved = true;
  } else if (e.touches.length === 1 && _smDragP) {
    e.preventDefault(); // we pan manually in pointermove
  }
}
function _smTouchEnd(e) {
  if (e.touches.length < 2) _smPinch = null;
}

// Tap dispatch by mode
function _smTap(cx, cy) {
  const pct = _smEventPct(cx, cy);
  if (!pct) return;
  const f = _smFloor();
  if (!f) return;

  if (_smMode === 'draw') {
    if (!_smDraft) _smDraft = { points: [] };
    _smDraft.points.push(pct);
    smRedraw();
    return;
  }
  if (_smMode.startsWith('sym:')) {
    const type = _smMode.slice(4);
    const sy = { id: genId(), type, x: pct.x, y: pct.y, color: _smColor, label: '' };
    f.symbols.push(sy);
    _smUndo.push({ kind: 'symbol', id: sy.id });
    logChange(`Map symbol placed: ${SM_SYMBOLS[type]?.label || type} on "${f.name}"`);
    save(); smRedraw();
    return;
  }
  if (_smMode === 'text') {
    _smPendingTextAt = pct;
    openModal(`
      <h3>🅣 Text Box</h3>
      <div class="form-row"><label>Text *</label>
        <input class="form-control" id="smt-text" placeholder="e.g. IDF closet behind panel" autofocus></div>
      <div class="form-row" style="max-width:130px"><label>Color</label>
        <input type="color" class="form-control" id="smt-color" value="${_smColor}" style="height:46px;padding:4px"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="smSaveNewText()">Place</button>
      </div>`);
    setTimeout(() => document.getElementById('smt-text')?.focus(), 60);
    return;
  }
  if (_smMode.startsWith('rack:')) {
    const rackId = _smMode.slice(5);
    const p = getProject();
    const rack = p.racks.find(r => r.id === rackId);
    if (!rack) { smSetMode('view'); return; }
    const m = { id: genId(), type: 'idf', rackId, x: pct.x, y: pct.y, label: rack.name, color: '#00c8ff', size: 1 };
    f.markers.push(m);
    _smUndo.push({ kind: 'marker', id: m.id });
    logChange(`Rack placed on map "${f.name}": ${rack.name}`);
    save(); smRedraw(); smSetMode('view');
    const strip = document.getElementById('sm-rackstrip');
    if (strip) strip.style.display = 'none';
    toast(`${rack.name} placed — drag it to fine-tune`, 'success');
    return;
  }
  if (_smMode.startsWith('dev:')) {
    const devId = _smMode.slice(4);
    const p = getProject();
    const dev = p.devices.find(d => d.id === devId);
    if (!dev) { smSetMode('view'); return; }
    const m = { id: genId(), type: 'dev', devId, x: pct.x, y: pct.y, label: dev.name };
    f.markers.push(m);
    _smUndo.push({ kind: 'marker', id: m.id });
    logChange(`Device placed on map "${f.name}": ${dev.name}`);
    save(); smRedraw(); smSetMode('view');
    const strip = document.getElementById('sm-rackstrip');
    if (strip) strip.style.display = 'none';
    toast(`${dev.name} placed — hold & drag to fine-tune`, 'success');
    return;
  }
}

let _smPendingTextAt = null;
function smSaveNewText() {
  const text = document.getElementById('smt-text')?.value?.trim();
  if (!text) return toast('Enter some text', 'error');
  const color = document.getElementById('smt-color')?.value || _smColor;
  const f = _smFloor();
  if (!f || !_smPendingTextAt) { closeModal(); return; }
  const t = { id: genId(), x: _smPendingTextAt.x, y: _smPendingTextAt.y, text, color };
  f.texts.push(t);
  _smUndo.push({ kind: 'text', id: t.id });
  logChange(`Map text added on "${f.name}": "${text}"`);
  _smPendingTextAt = null;
  save(); closeModal(); smRedraw(); smSetMode('view');
}

// ═══════════════════════════════════════════
//  DRAW — finish / cancel / save line
// ═══════════════════════════════════════════
function smCancelDraw() { _smDraft = null; smRedraw(); smSetMode('view'); }

function smFinishDraw() {
  if (!_smDraft || _smDraft.points.length < 2) return toast('Tap at least two points first', 'error');
  // Extending an existing line: just update its geometry, keep its details
  if (_smDraft.editId) {
    const f = _smFloor();
    const l = f?.cableLines.find(x => x.id === _smDraft.editId);
    if (l) {
      l.points = _smDraft.points;
      logChange(`Cable path extended on "${f.name}"${l.label ? ': ' + l.label : ''}`);
    }
    _smDraft = null;
    save(); smRedraw(); smSetMode('view');
    toast('Path updated', 'success');
    return;
  }
  const p = getProject();
  const run = _smPendingRun ? (p.cableRuns || []).find(r => r.id === _smPendingRun) : null;
  const typeOpts = CABLE_TYPES.map(t => `<option value="${t}" ${(run?.type || 'Cat6') === t ? 'selected' : ''}>${t}</option>`).join('');
  const runOpts = (p.cableRuns || []).map(r =>
    `<option value="${r.id}" ${_smPendingRun === r.id ? 'selected' : ''}>${esc(r.label || '(unlabeled)')} — ${esc(r.fromRoom || '?')}→${esc(r.toRoom || '?')}</option>`).join('');
  openModal(`
    <h3>Save Cable Path</h3>
    <div class="form-row-inline">
      <div class="form-row"><label>Label</label>
        <input class="form-control" id="sml-label" value="${esc(run?.label || '')}" placeholder="e.g. CR-001"></div>
      <div class="form-row" style="flex:0 0 110px"><label>Color</label>
        <input type="color" class="form-control" id="sml-color" value="${run?.color || _smColor}" style="height:46px;padding:4px"></div>
    </div>
    <div class="form-row"><label>Cable Type</label>
      <select class="form-control" id="sml-type">${typeOpts}</select></div>
    <div class="form-row"><label>Link to Cable Run <span style="color:var(--text3)">(optional)</span></label>
      <select class="form-control" id="sml-run">
        <option value="">— Not linked —</option>
        ${runOpts}
      </select></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="smSaveLine()">Save Path</button>
    </div>`);
}

function smSaveLine() {
  const f = _smFloor();
  if (!f || !_smDraft) { closeModal(); return; }
  const line = {
    id: genId(),
    points: _smDraft.points,
    label: document.getElementById('sml-label')?.value?.trim() || '',
    color: document.getElementById('sml-color')?.value || _smColor,
    cableType: document.getElementById('sml-type')?.value || 'Cat6',
    linkedRunId: document.getElementById('sml-run')?.value || ''
  };
  f.cableLines.push(line);
  _smUndo.push({ kind: 'line', id: line.id });
  logChange(`Cable path drawn on "${f.name}"${line.label ? ': ' + line.label : ''}`);
  _smDraft = null;
  _smPendingRun = null;
  save(); closeModal(); smRedraw(); smSetMode('view');
  toast('Cable path saved', 'success');
}

// Edit an existing line
function smLineSheet(lineId) {
  const f = _smFloor();
  const l = f?.cableLines.find(x => x.id === lineId);
  if (!l) return;
  const p = getProject();
  const run = l.linkedRunId ? (p.cableRuns || []).find(r => r.id === l.linkedRunId) : null;
  const typeOpts = CABLE_TYPES.map(t => `<option value="${t}" ${(l.cableType || 'Cat6') === t ? 'selected' : ''}>${t}</option>`).join('');
  openModal(`
    <h3>Cable Path${run ? ` <span style="font-size:11px;color:var(--text3);font-family:var(--mono)">↔ ${esc(run.label || 'run')}</span>` : ''}</h3>
    <div class="form-row-inline">
      <div class="form-row"><label>Label</label>
        <input class="form-control" id="sme-label" value="${esc(l.label || '')}"></div>
      <div class="form-row" style="flex:0 0 110px"><label>Color</label>
        <input type="color" class="form-control" id="sme-color" value="${l.color || '#00c8ff'}" style="height:46px;padding:4px"></div>
    </div>
    <div class="form-row"><label>Cable Type</label>
      <select class="form-control" id="sme-type">${typeOpts}</select></div>
    <div class="modal-actions">
      <button class="btn btn-danger" style="margin-right:auto;flex:0 0 auto;min-width:0" onclick="smDeleteLine('${l.id}')">✕</button>
      <button class="btn btn-ghost" onclick="smExtendLine('${l.id}')">➕ Extend</button>
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="smUpdateLine('${l.id}')">Save</button>
    </div>`);
}

// Resume drawing an existing line — its points load into the draft
function smExtendLine(lineId) {
  const f = _smFloor();
  const l = f?.cableLines.find(x => x.id === lineId);
  if (!l) return;
  _smDraft = { points: (l.points || []).map(pt => ({ ...pt })), editId: lineId };
  closeModal();
  smSetMode('draw');
  smRedraw();
  toast('Tap to add points · ↶ removes the last one · ✓ Finish saves', 'success');
}

function smUpdateLine(lineId) {
  const f = _smFloor();
  const l = f?.cableLines.find(x => x.id === lineId);
  if (!l) { closeModal(); return; }
  l.label = document.getElementById('sme-label')?.value?.trim() || '';
  l.color = document.getElementById('sme-color')?.value || l.color;
  l.cableType = document.getElementById('sme-type')?.value || l.cableType;
  save(); closeModal(); smRedraw();
}

function smDeleteLine(lineId) {
  const f = _smFloor();
  if (!f) return;
  f.cableLines = f.cableLines.filter(x => x.id !== lineId);
  logChange(`Cable path deleted from "${f.name}"`);
  save(); closeModal(); smRedraw();
  toast('Path deleted');
}

// ═══════════════════════════════════════════
//  PLACED ELEMENT DRAG + EDIT (markers/symbols/texts)
// ═══════════════════════════════════════════
// Elements are ANCHORED: a quick tap opens their sheet, and only a
// press-and-hold (~350ms without moving) picks one up to reposition it.
// Swipes across an element never move it.
function smElDown(e, kind, id) {
  e.stopPropagation();
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  const d = { kind, id, sx: e.clientX, sy: e.clientY, moved: false, dragging: false, el: e.currentTarget, pid: e.pointerId, last: null };
  d.timer = setTimeout(() => {
    if (_smElDrag !== d || d.moved) return;
    d.dragging = true;
    d.el.classList.add('sm-el-lift');
    try { d.el.setPointerCapture(d.pid); } catch (err) {}
    if (navigator.vibrate) { try { navigator.vibrate(12); } catch (err) {} }
  }, 350);
  _smElDrag = d;
}
function _smElMove(e) {
  const d = _smElDrag;
  if (!d || e.pointerId !== d.pid) return;
  if (!d.dragging) {
    // Moved before the hold completed → not a move gesture; stay anchored
    if (Math.abs(e.clientX - d.sx) > 7 || Math.abs(e.clientY - d.sy) > 7) {
      d.moved = true;
      clearTimeout(d.timer);
      _smElDrag = null;
    }
    return;
  }
  e.preventDefault();
  const pct = _smEventPct(e.clientX, e.clientY);
  if (!pct) return;
  d.el.style.left = pct.x + '%';
  d.el.style.top = pct.y + '%';
  d.last = pct;
}
function _smElUp(e) {
  const d = _smElDrag;
  if (!d || e.pointerId !== d.pid) return;
  clearTimeout(d.timer);
  _smElDrag = null;
  d.el.classList.remove('sm-el-lift');
  const f = _smFloor();
  if (!f) return;
  if (d.dragging) {
    if (d.last) {
      const arr = d.kind === 'marker' ? f.markers : d.kind === 'symbol' ? f.symbols : f.texts;
      const item = arr.find(x => x.id === d.id);
      if (item) { item.x = d.last.x; item.y = d.last.y; save(); }
    }
    return;
  }
  if (d.moved) return;
  // Quick tap → edit sheet
  if (d.kind === 'marker') smMarkerSheet(d.id);
  else if (d.kind === 'symbol') smSymbolSheet(d.id);
  else smTextSheet(d.id);
}

// Element pointermove/up need document-level fallback (capture keeps them on the element)
document.addEventListener('pointermove', (e) => { if (_smElDrag) _smElMove(e); });
document.addEventListener('pointerup', (e) => { if (_smElDrag) _smElUp(e); });

function smMarkerSheet(markerId) {
  const f = _smFloor();
  const m = f?.markers.find(x => x.id === markerId);
  if (!m) return;
  if (m.devId) {
    const dev = getProject().devices.find(d => d.id === m.devId);
    const c = dev ? dtColor(dev.deviceType || 'Misc.') : '#888';
    openModal(`
      <h3><span style="color:${c}">●</span> ${esc(dev ? dev.name : 'Device marker')}</h3>
      ${dev ? `<p style="font-size:12.5px;color:var(--text2);margin-bottom:6px">${esc(dev.deviceType || '')}${dev.ip ? ' · ' + esc(dev.ip) : ''}</p>` : ''}
      <p style="font-size:12.5px;color:var(--text2);margin-bottom:14px">Press and hold the marker on the map to move it — it stays anchored otherwise.</p>
      <div class="modal-actions">
        <button class="btn btn-danger" style="margin-right:auto;flex:0 0 auto;min-width:0" onclick="smRemoveMarker('${m.id}')">✕ Remove</button>
        ${dev ? `<button class="btn btn-ghost" onclick="closeModal();closeMapStudio();editDevice('${dev.id}')">Device →</button>` : ''}
        <button class="btn btn-primary" onclick="closeModal()">Done</button>
      </div>`);
    return;
  }
  const rack = getProject().racks.find(r => r.id === m.rackId);
  openModal(`
    <h3>▤ ${esc(rack ? rack.name : 'Rack marker')}</h3>
    <p style="font-size:12.5px;color:var(--text2);margin-bottom:14px">Press and hold the marker on the map to move it — it stays anchored otherwise.</p>
    <div class="modal-actions">
      <button class="btn btn-danger" style="margin-right:auto;flex:0 0 auto;min-width:0" onclick="smRemoveMarker('${m.id}')">✕ Remove</button>
      ${rack ? `<button class="btn btn-ghost" onclick="closeModal();closeMapStudio();sessionStorage.setItem('netrack_focus_rack','${rack.id}');setView('racks')">Go to rack →</button>` : ''}
      <button class="btn btn-primary" onclick="closeModal()">Done</button>
    </div>`);
}
function smRemoveMarker(markerId) {
  const f = _smFloor();
  if (!f) return;
  f.markers = f.markers.filter(x => x.id !== markerId);
  save(); closeModal(); smRedraw();
  toast('Marker removed');
}

function smSymbolSheet(symbolId) {
  const f = _smFloor();
  const sy = f?.symbols.find(x => x.id === symbolId);
  if (!sy) return;
  const def = SM_SYMBOLS[sy.type] || { icon: '?', label: sy.type };
  openModal(`
    <h3>${def.icon} ${esc(def.label)}</h3>
    <div class="form-row"><label>Label <span style="color:var(--text3)">(optional)</span></label>
      <input class="form-control" id="sms-label" value="${esc(sy.label || '')}" placeholder="e.g. to 2nd floor IDF"></div>
    <div class="form-row" style="max-width:130px"><label>Color</label>
      <input type="color" class="form-control" id="sms-color" value="${sy.color || '#00c8ff'}" style="height:46px;padding:4px"></div>
    <div class="modal-actions">
      <button class="btn btn-danger" style="margin-right:auto;flex:0 0 auto;min-width:0" onclick="smDeleteSymbol('${sy.id}')">✕</button>
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="smUpdateSymbol('${sy.id}')">Save</button>
    </div>`);
}
function smUpdateSymbol(symbolId) {
  const f = _smFloor();
  const sy = f?.symbols.find(x => x.id === symbolId);
  if (!sy) { closeModal(); return; }
  sy.label = document.getElementById('sms-label')?.value?.trim() || '';
  sy.color = document.getElementById('sms-color')?.value || sy.color;
  save(); closeModal(); smRedraw();
}
function smDeleteSymbol(symbolId) {
  const f = _smFloor();
  if (!f) return;
  f.symbols = f.symbols.filter(x => x.id !== symbolId);
  save(); closeModal(); smRedraw();
}

function smTextSheet(textId) {
  const f = _smFloor();
  const t = f?.texts.find(x => x.id === textId);
  if (!t) return;
  openModal(`
    <h3>🅣 Text Box</h3>
    <div class="form-row"><label>Text *</label>
      <input class="form-control" id="smt2-text" value="${esc(t.text || '')}"></div>
    <div class="form-row" style="max-width:130px"><label>Color</label>
      <input type="color" class="form-control" id="smt2-color" value="${t.color || '#ffffff'}" style="height:46px;padding:4px"></div>
    <div class="modal-actions">
      <button class="btn btn-danger" style="margin-right:auto;flex:0 0 auto;min-width:0" onclick="smDeleteText('${t.id}')">✕</button>
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="smUpdateText('${t.id}')">Save</button>
    </div>`);
}
function smUpdateText(textId) {
  const f = _smFloor();
  const t = f?.texts.find(x => x.id === textId);
  if (!t) { closeModal(); return; }
  const txt = document.getElementById('smt2-text')?.value?.trim();
  if (!txt) return toast('Enter some text', 'error');
  t.text = txt;
  t.color = document.getElementById('smt2-color')?.value || t.color;
  save(); closeModal(); smRedraw();
}
function smDeleteText(textId) {
  const f = _smFloor();
  if (!f) return;
  f.texts = f.texts.filter(x => x.id !== textId);
  save(); closeModal(); smRedraw();
}

// ── Undo last placed element ──
function smUndoLast() {
  const f = _smFloor();
  if (!f) return;
  if (_smDraft && _smDraft.points.length > 0) {
    _smDraft.points.pop();
    if (_smDraft.points.length === 0) _smDraft = null;
    smRedraw();
    return;
  }
  const last = _smUndo.pop();
  if (!last) return toast('Nothing to undo');
  if (last.kind === 'line') f.cableLines = f.cableLines.filter(x => x.id !== last.id);
  else if (last.kind === 'symbol') f.symbols = f.symbols.filter(x => x.id !== last.id);
  else if (last.kind === 'text') f.texts = f.texts.filter(x => x.id !== last.id);
  else if (last.kind === 'marker') f.markers = f.markers.filter(x => x.id !== last.id);
  save(); smRedraw();
  toast('Undone');
}

// ═══════════════════════════════════════════
//  FLOOR MANAGEMENT SHEET
// ═══════════════════════════════════════════
function smFloorSheet() {
  const floors = _smFloors();
  openModal(`
    <h3>🗺 Site Maps</h3>
    ${floors.map(f => `
      <div style="display:flex;align-items:center;gap:9px;padding:9px 4px;border-bottom:1px solid var(--border)">
        <div class="sm-card-thumb" style="width:52px;height:38px;border-radius:8px;font-size:16px;flex-shrink:0;${f.thumb ? `background-image:url('${f.thumb}')` : ''}">${f.thumb ? '' : '🗺'}</div>
        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:${f.id === _smFloorId ? '800' : '400'};color:${f.id === _smFloorId ? 'var(--accent)' : 'var(--text)'}" onclick="closeModal();openMapStudio('${f.id}')">${esc(f.name)}</span>
        <button class="btn btn-ghost btn-sm btn-icon" onclick="smRenameFloor('${f.id}')">✎</button>
        <button class="btn btn-danger btn-sm btn-icon" onclick="smDeleteFloor('${f.id}')">✕</button>
      </div>`).join('')}
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal();_smAddName='';document.getElementById('sitemap-upload').click()" title="Replace this map's image">🖼 Replace Image</button>
      <button class="btn btn-primary" onclick="closeModal();smAddMapFlow()">+ New Map</button>
    </div>`);
}

function smRenameFloor(floorId) {
  const f = _smFloors().find(x => x.id === floorId);
  if (!f) return;
  openModal(`
    <h3>Rename Map</h3>
    <div class="form-row"><label>Name</label>
      <input class="form-control" id="smr-name" value="${esc(f.name)}" autofocus></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="smSaveRenameFloor('${f.id}')">Save</button>
    </div>`);
  setTimeout(() => { const el = document.getElementById('smr-name'); el?.focus(); el?.select(); }, 60);
}
function smSaveRenameFloor(floorId) {
  const f = _smFloors().find(x => x.id === floorId);
  const name = document.getElementById('smr-name')?.value?.trim();
  if (!f || !name) return toast('Enter a name', 'error');
  logChange(`Site map renamed: "${f.name}" → "${name}"`);
  f.name = name;
  save(); closeModal();
  const t = document.getElementById('sm-title-name');
  if (t && f.id === _smFloorId) t.textContent = name;
  if (state.currentView === 'photos' && !document.getElementById('sm-studio')) renderPhotos();
}

function smDeleteFloor(floorId) {
  const f = _smFloors().find(x => x.id === floorId);
  if (!f) return;
  if (!confirm(`Delete map "${f.name}"? Its drawings, symbols and rack markers will be removed.`)) return;
  const p = getProject();
  p.siteMapFloors = p.siteMapFloors.filter(x => x.id !== floorId);
  _idbDeletePhotoData(_smImgKey(floorId)).catch(() => {});
  logChange(`Site map deleted: "${f.name}"`);
  save(); closeModal();
  if (_smFloorId === floorId) {
    closeMapStudio();
    if (p.siteMapFloors.length) openMapStudio(p.siteMapFloors[0].id);
    else if (state.currentView === 'photos') renderPhotos();
  }
  toast('Map deleted');
}

// ═══════════════════════════════════════════
//  CABLE RUN INTEGRATION — "Map this run"
// ═══════════════════════════════════════════
function smMapRun(runId) {
  const floors = _smFloors();
  if (floors.length === 0) {
    toast('Add a site map first (Photos → Site Maps)', 'warning');
    smAddMapFlow();
    return;
  }
  if (floors.length === 1) {
    openMapStudio(floors[0].id, { runId, mode: 'draw' });
    return;
  }
  openModal(`
    <h3>Draw on which map?</h3>
    ${floors.map(f => `
      <div class="sheet-item" onclick="closeModal();openMapStudio('${f.id}',{runId:'${runId}',mode:'draw'})">
        <span class="si-ico">🗺</span> ${esc(f.name)}
      </div>`).join('')}
    <div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button></div>`);
}

// Returns floors containing a path linked to this run
function smRunMappedFloors(runId) {
  return _smFloors().filter(f => (f.cableLines || []).some(l => l.linkedRunId === runId));
}

// Wire the hidden site map file input once
document.getElementById('sitemap-upload')?.addEventListener('change', handleSiteMapUpload);
