const CABLE_TYPES = ['Cat5e','Cat6','Cat6A','Fiber SM','Fiber MM','Coax','Other'];

// ═══════════════════════════════════════════
//  CABLE RUN MAP — state
// ═══════════════════════════════════════════
let _crView = 'table'; // 'table' | 'map'
let _crPan = {x:0,y:0}, _crZoom = 1;
let _crDragging = false, _crDragStart = {x:0,y:0}, _crPanStart = {x:0,y:0};
let _crEditMode = false;
let _crDrawing = false;
let _crCurrentLine = null;
let _crPlacingSymbol = null; // symbol type string or null
let _crDragSymbol = null;    // { id, offX, offY }

// SVG symbol definitions (viewBox 0 0 24 24)
const CR_SYMBOLS = {
  conduit:     { label: 'Conduit',          icon: `<path d="M2 8h20M2 16h20" stroke="#ffaa00" stroke-width="2.5" fill="none"/>` },
  junction:    { label: 'Junction Box',     icon: `<rect x="4" y="4" width="16" height="16" rx="2" stroke="#00c8ff" stroke-width="2" fill="rgba(0,200,255,.15)"/>` },
  underground: { label: 'Goes Underground', icon: `<path d="M12 3v12M8 11l4 4 4-4" stroke="#ff6b35" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 20h16" stroke="#ff6b35" stroke-width="2" stroke-dasharray="3,2"/>` },
  levelup:     { label: 'Level Up',         icon: `<path d="M12 21V9M8 13l4-4 4 4" stroke="#00e87a" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 5h16" stroke="#00e87a" stroke-width="2"/>` },
  leveldown:   { label: 'Level Down',       icon: `<path d="M12 3v12M8 11l4 4 4-4" stroke="#ff4455" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 19h16" stroke="#ff4455" stroke-width="2"/>` },
  splice:      { label: 'Splice',           icon: `<path d="M6 6l12 12M18 6L6 18" stroke="#ce93d8" stroke-width="2.5" stroke-linecap="round"/><circle cx="12" cy="12" r="3" fill="#ce93d8" opacity=".4"/>` },
  wallpen:     { label: 'Wall Penetration', icon: `<rect x="10" y="2" width="4" height="20" fill="rgba(255,255,255,.15)" stroke="#aabbcc" stroke-width="1.5"/><path d="M3 12h18" stroke="#ffcc00" stroke-width="2" stroke-linecap="round"/><path d="M18 9l3 3-3 3" stroke="#ffcc00" stroke-width="1.5" fill="none" stroke-linejoin="round"/>` },
  riser:       { label: 'Riser',            icon: `<path d="M12 22V2M8 6l4-4 4 4M8 18l4 4 4-4" stroke="#4fc3f7" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` },
};

// ═══════════════════════════════════════════
//  RENDER — entry point
// ═══════════════════════════════════════════
function renderCableRuns() {
  if (_crView === 'map') { renderCableRunMap(); return; }
  renderCableRunTable();
}

// ═══════════════════════════════════════════
//  TABLE VIEW (original)
// ═══════════════════════════════════════════
function renderCableRunTable() {
  const p = getProject();
  if (!p.cableRuns) p.cableRuns=[];
  const runs = p.cableRuns;
  const filterType = state.cableTypeFilter||'all';
  const filterRoom = (state.cableRoomFilter||'').toLowerCase();

  setTopbarActions(`
    <div class="cr-view-toggle">
      <button class="active" onclick="crSetView('table')">Table</button>
      <button onclick="crSetView('map')">Map</button>
    </div>
    <button class="btn btn-primary btn-sm" onclick="addCableRun()">+ Add Cable Run</button>
  `);

  let filtered = runs.filter(r=>{
    if(filterType!=='all' && r.type!==filterType) return false;
    if(filterRoom && !(r.fromRoom||'').toLowerCase().includes(filterRoom) && !(r.toRoom||'').toLowerCase().includes(filterRoom) && !(r.label||'').toLowerCase().includes(filterRoom) && !(r.notes||'').toLowerCase().includes(filterRoom)) return false;
    return true;
  });

  const byType={};
  runs.forEach(r=>{ byType[r.type||'Other']=(byType[r.type||'Other']||0)+1; });

  document.getElementById('view-area').innerHTML = `
    <div style="margin-bottom:14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <div class="search-box" style="max-width:200px">
        <span style="color:var(--text3)">⌕</span>
        <input placeholder="Search runs..." value="${esc(state.cableRoomFilter||'')}" oninput="state.cableRoomFilter=this.value;renderCableRuns()">
      </div>
      <div class="filter-tabs">
        <div class="filter-tab ${filterType==='all'?'active':''}" onclick="state.cableTypeFilter='all';renderCableRuns()">All (${runs.length})</div>
        ${CABLE_TYPES.filter(t=>byType[t]).map(t=>`<div class="filter-tab ${filterType===t?'active':''}" onclick="state.cableTypeFilter='${t}';renderCableRuns()">${esc(t)} (${byType[t]||0})</div>`).join('')}
      </div>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
      <div class="stat-card"><div class="sv">${runs.length}</div><div class="sl">Total Runs</div></div>
      ${Object.entries(byType).map(([t,c])=>`<div class="stat-card"><div class="sv accent" style="font-size:18px">${c}</div><div class="sl">${esc(t)}</div></div>`).join('')}
      <div class="stat-card"><div class="sv green">${runs.filter(r=>r.verified).length}</div><div class="sl">Verified</div></div>
    </div>
    ${filtered.length===0 ? `<div class="empty-state"><div class="empty-icon">⇄</div><h3>No cable runs yet</h3><p>Add cable runs to track physical connections between rooms and patch panels.</p></div>` : `
    <div class="devices-table-scroll">
      <table>
        <thead><tr>
          <th>Label</th><th>From</th><th>To</th><th>Type</th><th>Length</th><th>Color</th><th>Verified</th><th>Notes</th><th></th>
        </tr></thead>
        <tbody>
          ${filtered.map(r=>`<tr>
            <td style="font-weight:600;font-family:var(--mono)">${esc(r.label||'—')}</td>
            <td>${esc(r.fromRoom||'—')}${r.fromPort?`<span style="color:var(--text3)"> P${esc(r.fromPort)}</span>`:''}</td>
            <td>${esc(r.toRoom||'—')}${r.toPort?`<span style="color:var(--text3)"> P${esc(r.toPort)}</span>`:''}</td>
            <td><span class="cable-type-badge">${esc(r.type||'—')}</span></td>
            <td class="mono">${esc(r.length||'—')}</td>
            <td>${r.color?`<span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${esc(r.color)};border:1px solid rgba(255,255,255,.2);vertical-align:middle"></span>`:''}</td>
            <td><input type="checkbox" ${r.verified?'checked':''} onchange="toggleCableVerified('${r.id}',this.checked)" title="Mark verified"></td>
            <td style="color:var(--text2);font-size:12px">${esc(r.notes||'')}</td>
            <td><div class="td-actions">
              <button class="btn btn-ghost btn-sm btn-icon" onclick="editCableRun('${r.id}')">✎</button>
              <button class="btn btn-danger btn-sm btn-icon" onclick="deleteCableRun('${r.id}')">✕</button>
            </div></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`}`;
}

function crSetView(v) { _crView = v; renderCableRuns(); }

// ═══════════════════════════════════════════
//  MAP VIEW
// ═══════════════════════════════════════════
function renderCableRunMap() {
  const p = getProject();
  const m = p.cableRunMap;

  setTopbarActions(`
    <div class="cr-view-toggle">
      <button onclick="crSetView('table')">Table</button>
      <button class="active" onclick="crSetView('map')">Map</button>
    </div>
    <button class="btn btn-sm ${_crEditMode?'btn-primary':'btn-ghost'}" onclick="crToggleEdit()"
      style="${_crEditMode?'border-color:var(--amber);background:rgba(255,170,0,.15);color:var(--amber)':''}">
      ${_crEditMode?'🔓 Edit Mode ON':'🔒 View Only'}
    </button>
    ${m.image?`<button class="btn btn-ghost btn-sm" onclick="crClearImage()">✕ Clear Image</button>`:''}
  `);

  if (!m.image) {
    const existingPhotos = (p.photos || []).filter(ph => ph.data);
    document.getElementById('view-area').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🗺</div>
        <h3>No cable run map image</h3>
        <p>Upload a floor plan or select an existing site photo to draw cable runs on.</p>
        <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;justify-content:center">
          <label class="btn btn-primary" style="cursor:pointer">
            📁 Upload Image
            <input type="file" accept="image/*" style="display:none" onchange="crUploadImage(event)">
          </label>
          ${existingPhotos.length > 0 ? `<button class="btn btn-ghost" onclick="crPickExistingPhoto()">📷 Use Existing Photo (${existingPhotos.length})</button>` : ''}
        </div>
      </div>`;
    return;
  }

  const paths = m.paths || [];
  const symbols = m.symbols || [];
  const canEdit = _crEditMode;
  const cursor = !canEdit ? 'grab' : (_crDrawing ? 'crosshair' : (_crPlacingSymbol ? 'copy' : 'crosshair'));

  // Build SVG paths
  const svgPaths = paths.map(line => {
    if (!line.points || line.points.length < 2) return '';
    const pts = line.points.map((pt,i) => `${i===0?'M':'L'} ${pt.x} ${pt.y}`).join(' ');
    const color = line.color || '#ffaa00';
    return `<g onclick="event.stopPropagation();crPathClick('${line.id}')" style="cursor:pointer">
      <path d="${pts}" stroke="${color}" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.85" vector-effect="non-scaling-stroke" pointer-events="stroke"/>
      <path d="${pts}" stroke="transparent" stroke-width="8" vector-effect="non-scaling-stroke" fill="none" pointer-events="stroke"/>
      ${line.label ? (() => { const mid = line.points[Math.floor(line.points.length/2)]; return `<text x="${mid.x}" y="${mid.y}" font-size="2.5" font-family="monospace" fill="${color}" text-anchor="middle" dy="-1" pointer-events="none">${esc(line.label)}</text>`; })() : ''}
    </g>`;
  }).join('');

  // In-progress drawing
  const drawingLine = (_crDrawing && _crCurrentLine && _crCurrentLine.points.length > 0) ? (() => {
    const pts = _crCurrentLine.points.map((pt,i) => `${i===0?'M':'L'} ${pt.x} ${pt.y}`).join(' ');
    return `<path d="${pts}" stroke="${_crCurrentLine.color||'#ffaa00'}" stroke-width="2" fill="none" opacity="0.6" vector-effect="non-scaling-stroke"/>`;
  })() : '';

  // Symbol palette HTML
  const paletteHtml = Object.entries(CR_SYMBOLS).map(([key, sym]) =>
    `<button class="cr-symbol-btn ${_crPlacingSymbol===key?'active':''}" onclick="crSelectSymbol('${key}')" ${!canEdit?'disabled':''}>
      <svg width="20" height="20" viewBox="0 0 24 24">${sym.icon}</svg>
      ${sym.label}
    </button>`
  ).join('');

  // Paths list
  const pathsList = paths.map(line =>
    `<div class="cr-path-item" onclick="crPathClick('${line.id}')">
      <span style="width:16px;height:3px;border-radius:2px;background:${line.color||'#ffaa00'};flex-shrink:0"></span>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(line.label||'Cable Run')}</span>
      ${canEdit?`<button class="btn btn-danger btn-sm btn-icon" onclick="event.stopPropagation();crDeletePath('${line.id}')" style="font-size:9px;padding:1px 4px">✕</button>`:''}
    </div>`
  ).join('');

  // Symbols list
  const symbolsList = symbols.map(s => {
    const def = CR_SYMBOLS[s.type];
    return `<div class="cr-path-item" onclick="crSymbolClick('${s.id}')"
      onmouseenter="crHighlightSymbol('${s.id}',true)" onmouseleave="crHighlightSymbol('${s.id}',false)">
      <svg width="14" height="14" viewBox="0 0 24 24">${def?def.icon:''}</svg>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.label || def?.label || s.type)}</span>
      ${canEdit?`<button class="btn btn-danger btn-sm btn-icon" onclick="event.stopPropagation();crDeleteSymbol('${s.id}')" style="font-size:9px;padding:1px 4px">✕</button>`:''}
    </div>`;
  }).join('');

  document.getElementById('view-area').innerHTML = `
    <div class="cr-map-wrap">
      <div class="cr-map-toolbar">
        ${canEdit ? `
          <div class="cr-toolbar-section">Draw</div>
          <div style="display:flex;gap:4px;align-items:center">
            <input type="color" id="cr-draw-color" value="${_crCurrentLine?.color||'#ffaa00'}" style="width:32px;height:28px;padding:1px;border:1px solid var(--border);border-radius:4px;background:var(--card2);cursor:pointer" title="Path color">
            ${!_crDrawing
              ? `<button class="btn btn-ghost btn-sm" style="flex:1;font-size:11px" onclick="crStartDraw()">✏ Draw Cable Path</button>`
              : `<button class="btn btn-danger btn-sm" style="flex:1;font-size:11px" onclick="crCancelDraw()">✕ Cancel Drawing</button>`
            }
          </div>
          <div class="cr-toolbar-section">Symbols</div>
          ${paletteHtml}
          ${_crPlacingSymbol ? `<button class="btn btn-danger btn-sm" style="width:100%;font-size:10px;margin-top:2px" onclick="crCancelSymbol()">✕ Cancel Placement</button>` : ''}
        ` : ''}
        <div class="cr-toolbar-section">Paths (${paths.length})</div>
        ${pathsList || `<div style="font-size:11px;color:var(--text3);padding:4px 0">${canEdit?'Draw a path on the map':'No paths yet'}</div>`}
        <div class="cr-toolbar-section">Symbols (${symbols.length})</div>
        ${symbolsList || `<div style="font-size:11px;color:var(--text3);padding:4px 0">${canEdit?'Select a symbol above, then click the map':'No symbols yet'}</div>`}
        <div style="margin-top:auto;padding-top:8px;border-top:1px solid var(--border)">
          <label class="btn btn-ghost btn-sm" style="width:100%;font-size:10px;cursor:pointer">
            🔄 Replace Image
            <input type="file" accept="image/*" style="display:none" onchange="crUploadImage(event)">
          </label>
        </div>
      </div>
      <div class="cr-map-canvas ${canEdit?'edit-mode':''}" id="cr-canvas"
        style="cursor:${cursor}"
        onmousedown="crMouseDown(event)" onmousemove="crMouseMove(event)" onmouseup="crMouseUp(event)"
        onclick="crCanvasClick(event)" ondblclick="crDblClick(event)" onwheel="crWheel(event)">
        ${canEdit ? `<div class="cr-edit-badge">✎ EDIT${_crDrawing ? ' · DRAWING — click to add points, dbl-click to finish' : _crPlacingSymbol ? ' · Click map to place ' + (CR_SYMBOLS[_crPlacingSymbol]?.label||'') : ''}</div>` : ''}
        ${canEdit && _crDrawing ? `<div class="cr-draw-hint">Click: add point &nbsp;|&nbsp; Double-click: finish &nbsp;|&nbsp; ESC: cancel</div>` : ''}
        <div id="cr-pan" style="position:absolute;top:0;left:0;transform-origin:0 0;transform:translate(${_crPan.x}px,${_crPan.y}px) scale(${_crZoom})">
          <img id="cr-img" src="${m.image}" style="display:block;max-width:none;pointer-events:none" draggable="false">
          <svg id="cr-svg" style="position:absolute;top:0;left:0;width:100%;height:100%;overflow:visible;pointer-events:none"
            viewBox="0 0 100 100" preserveAspectRatio="none">
            ${svgPaths}
            ${drawingLine}
          </svg>
          <div id="cr-symbols-layer" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none">
            ${symbols.map(s => {
              const def = CR_SYMBOLS[s.type];
              if (!def) return '';
              const rot = s.rotation || 0;
              const sz = s.size || 1;
              const pxSize = Math.round(28 * sz);
              return `<div class="cr-symbol-marker" data-sym-id="${s.id}" style="left:${s.x}%;top:${s.y}%;pointer-events:all"
                title="${esc(s.label || def.label)}"
                onclick="event.stopPropagation();crSymbolClick('${s.id}')"
                onmousedown="event.stopPropagation();crSymbolDragStart(event,'${s.id}')">
                <svg width="${pxSize}" height="${pxSize}" viewBox="0 0 24 24" style="transform:rotate(${rot}deg)">${def.icon}</svg>
                ${s.label ? `<div style="position:absolute;top:100%;left:50%;transform:translateX(-50%);font-size:${Math.max(7,Math.round(9*sz))}px;font-family:var(--mono);color:#fff;background:rgba(0,0,0,.7);padding:1px 4px;border-radius:2px;white-space:nowrap;margin-top:1px">${esc(s.label)}</div>` : ''}
              </div>`;
            }).join('')}
          </div>
        </div>
        <div style="position:absolute;bottom:8px;left:8px;display:flex;gap:4px;z-index:15">
          <button class="btn btn-ghost btn-sm" onclick="crZoomIn()">+</button>
          <button class="btn btn-ghost btn-sm" onclick="crZoomOut()">−</button>
          <button class="btn btn-ghost btn-sm" onclick="crResetView()">⟳</button>
        </div>
      </div>
    </div>`;

  // ESC key handler
  document.addEventListener('keydown', _crKeyHandler);
}

function _crKeyHandler(e) {
  if (e.key === 'Escape') {
    if (_crDrawing) { crCancelDraw(); e.preventDefault(); }
    else if (_crPlacingSymbol) { crCancelSymbol(); e.preventDefault(); }
  }
}

// ═══════════════════════════════════════════
//  MAP — image management
// ═══════════════════════════════════════════
function crUploadImage(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async ev => {
    const p = getProject();
    p.cableRunMap.image = ev.target.result;
    p.cableRunMap.thumb = await _generateThumb(ev.target.result) || '';
    _crPan = {x:0,y:0}; _crZoom = 1;
    logChange('Cable run map image uploaded');
    save(); renderCableRunMap(); toast('Map image uploaded','success');
  };
  reader.readAsDataURL(file);
}

function crPickExistingPhoto() {
  const p = getProject();
  const photos = (p.photos || []).filter(ph => ph.data);
  if (photos.length === 0) return toast('No photos available','error');
  const grid = photos.map((ph, i) =>
    `<div style="cursor:pointer;border:1px solid var(--border);border-radius:6px;overflow:hidden;aspect-ratio:4/3;background-size:cover;background-position:center;background-image:url('${ph.thumb||ph.data}')"
      onclick="crUseExistingPhoto(${i})" title="${esc(ph.caption||ph.name||'Photo '+(i+1))}">
    </div>`
  ).join('');
  openModal(`
    <h3>Select Photo for Cable Map</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;max-height:400px;overflow-y:auto;margin:10px 0">
      ${grid}
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    </div>
  `, '600px');
}

function crUseExistingPhoto(idx) {
  const p = getProject();
  const ph = p.photos[idx];
  if (!ph?.data) return;
  p.cableRunMap.image = ph.data;
  p.cableRunMap.thumb = ph.thumb || '';
  _crPan = {x:0,y:0}; _crZoom = 1;
  logChange('Cable run map: using existing photo');
  save(); closeModal(); renderCableRunMap(); toast('Photo loaded as map','success');
}

function crClearImage() {
  if (!confirm('Clear the map image? Paths and symbols will be kept.')) return;
  const p = getProject();
  p.cableRunMap.image = null;
  p.cableRunMap.thumb = null;
  logChange('Cable run map image cleared');
  save(); renderCableRunMap();
}

// ═══════════════════════════════════════════
//  MAP — pan / zoom
// ═══════════════════════════════════════════
function crMouseDown(e) {
  if (_crDragSymbol) return;
  if (e.button !== 0) return;
  if (_crDrawing || _crPlacingSymbol) return;
  _crDragging = true;
  _crDragStart = {x:e.clientX, y:e.clientY};
  _crPanStart = {..._crPan};
  const c = document.getElementById('cr-canvas');
  if (c) c.style.cursor = 'grabbing';
}
function crMouseMove(e) {
  if (_crDragSymbol) { crSymbolDragMove(e); return; }
  if (!_crDragging) return;
  _crPan.x = _crPanStart.x + (e.clientX - _crDragStart.x);
  _crPan.y = _crPanStart.y + (e.clientY - _crDragStart.y);
  const pan = document.getElementById('cr-pan');
  if (pan) pan.style.transform = `translate(${_crPan.x}px,${_crPan.y}px) scale(${_crZoom})`;
}
function crMouseUp(e) {
  if (_crDragSymbol) { crSymbolDragEnd(e); return; }
  _crDragging = false;
  const c = document.getElementById('cr-canvas');
  if (c) c.style.cursor = _crEditMode ? (_crDrawing ? 'crosshair' : (_crPlacingSymbol ? 'copy' : 'crosshair')) : 'grab';
}
function crWheel(e) {
  e.preventDefault();
  const delta = e.deltaY < 0 ? 1.1 : 0.9;
  _crZoom = Math.max(0.2, Math.min(5, _crZoom * delta));
  const pan = document.getElementById('cr-pan');
  if (pan) pan.style.transform = `translate(${_crPan.x}px,${_crPan.y}px) scale(${_crZoom})`;
}
function crZoomIn() { _crZoom = Math.min(5, _crZoom * 1.2); const p = document.getElementById('cr-pan'); if (p) p.style.transform = `translate(${_crPan.x}px,${_crPan.y}px) scale(${_crZoom})`; }
function crZoomOut() { _crZoom = Math.max(0.2, _crZoom / 1.2); const p = document.getElementById('cr-pan'); if (p) p.style.transform = `translate(${_crPan.x}px,${_crPan.y}px) scale(${_crZoom})`; }
function crResetView() { _crPan = {x:0,y:0}; _crZoom = 1; const p = document.getElementById('cr-pan'); if (p) p.style.transform = 'translate(0px,0px) scale(1)'; }

function crToggleEdit() {
  _crEditMode = !_crEditMode;
  if (!_crEditMode) { _crDrawing = false; _crCurrentLine = null; _crPlacingSymbol = null; }
  renderCableRunMap();
}

// ═══════════════════════════════════════════
//  MAP — coordinate helpers
// ═══════════════════════════════════════════
function crEventToImgPct(e) {
  const img = document.getElementById('cr-img');
  if (!img) return null;
  const rect = img.getBoundingClientRect();
  const x = parseFloat(((e.clientX - rect.left) / rect.width * 100).toFixed(2));
  const y = parseFloat(((e.clientY - rect.top) / rect.height * 100).toFixed(2));
  return { x, y };
}

// ═══════════════════════════════════════════
//  MAP — path drawing
// ═══════════════════════════════════════════
function crStartDraw() {
  _crDrawing = true;
  _crPlacingSymbol = null;
  const colorEl = document.getElementById('cr-draw-color');
  const color = colorEl ? colorEl.value : '#ffaa00';
  _crCurrentLine = { points: [], color, label: '' };
  renderCableRunMap();
}
function crCancelDraw() {
  _crDrawing = false;
  _crCurrentLine = null;
  renderCableRunMap();
}

function crCanvasClick(e) {
  if (!_crEditMode) return;

  // Placing a symbol
  if (_crPlacingSymbol) {
    const pt = crEventToImgPct(e);
    if (!pt) return;
    crPlaceSymbolAt(pt.x, pt.y);
    return;
  }

  // Drawing a path
  if (!_crDrawing || !_crCurrentLine) return;
  const pt = crEventToImgPct(e);
  if (!pt) return;
  _crCurrentLine.points.push(pt);
  crRedrawSvg();
}

function crDblClick(e) {
  if (!_crEditMode) return;
  if (_crPlacingSymbol) return;
  if (_crDrawing && _crCurrentLine) {
    const pt = crEventToImgPct(e);
    if (pt) _crCurrentLine.points.push(pt);
    crFinishDraw();
  }
}

function crRedrawSvg() {
  const p = getProject();
  const paths = p.cableRunMap?.paths || [];
  const svgPaths = paths.map(line => {
    if (!line.points || line.points.length < 2) return '';
    const pts = line.points.map((pt,i) => `${i===0?'M':'L'} ${pt.x} ${pt.y}`).join(' ');
    const color = line.color || '#ffaa00';
    return `<g onclick="event.stopPropagation();crPathClick('${line.id}')" style="cursor:pointer">
      <path d="${pts}" stroke="${color}" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.85" vector-effect="non-scaling-stroke" pointer-events="stroke"/>
      <path d="${pts}" stroke="transparent" stroke-width="8" vector-effect="non-scaling-stroke" fill="none" pointer-events="stroke"/>
      ${line.label ? (() => { const mid = line.points[Math.floor(line.points.length/2)]; return `<text x="${mid.x}" y="${mid.y}" font-size="2.5" font-family="monospace" fill="${color}" text-anchor="middle" dy="-1" pointer-events="none">${esc(line.label)}</text>`; })() : ''}
    </g>`;
  }).join('');
  const drawingLine = (_crDrawing && _crCurrentLine && _crCurrentLine.points.length > 0) ? (() => {
    const pts = _crCurrentLine.points.map((pt,i) => `${i===0?'M':'L'} ${pt.x} ${pt.y}`).join(' ');
    return `<path d="${pts}" stroke="${_crCurrentLine.color||'#ffaa00'}" stroke-width="2" fill="none" opacity="0.6" vector-effect="non-scaling-stroke"/>`;
  })() : '';
  const svg = document.getElementById('cr-svg');
  if (svg) svg.innerHTML = svgPaths + drawingLine;
}

function crFinishDraw() {
  if (!_crCurrentLine || _crCurrentLine.points.length < 2) {
    toast('Draw at least 2 points', 'error');
    return;
  }
  const line = { ..._crCurrentLine };
  _crDrawing = false;
  _crCurrentLine = null;
  window._crPendingLine = line;

  const p = getProject();
  const runOpts = `<option value="">— None —</option>` +
    (p.cableRuns||[]).map(r => `<option value="${r.id}">${esc(r.label||r.fromRoom+' → '+r.toRoom)}</option>`).join('');

  openModal(`
    <h3>Save Cable Path</h3>
    <div class="form-row"><label>Label</label>
      <input class="form-control" id="crp-label" placeholder="e.g. MDF to IDF-1" autofocus></div>
    <div class="form-row-inline">
      <div class="form-row"><label>Color</label>
        <input type="color" class="form-control" id="crp-color" value="${line.color||'#ffaa00'}" style="height:38px;padding:4px"></div>
      <div class="form-row"><label>Cable Type</label>
        <select class="form-control" id="crp-type">
          ${CABLE_TYPES.map(t=>`<option${t==='Cat6'?' selected':''}>${t}</option>`).join('')}
        </select></div>
    </div>
    <div class="form-row"><label>Link to Cable Run (optional)</label>
      <select class="form-control" id="crp-link">${runOpts}</select></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal();renderCableRunMap()">Discard</button>
      <button class="btn btn-primary" onclick="crSavePath()">Save Path</button>
    </div>
  `);
  setTimeout(() => document.getElementById('crp-label')?.focus(), 50);
}

function crSavePath() {
  const line = window._crPendingLine;
  if (!line) return;
  const label = document.getElementById('crp-label')?.value?.trim() || '';
  const color = document.getElementById('crp-color')?.value || '#ffaa00';
  const cableType = document.getElementById('crp-type')?.value || '';
  const linkedRunId = document.getElementById('crp-link')?.value || '';
  const p = getProject();
  p.cableRunMap.paths.push({ id: genId(), points: line.points, label, color, cableType, linkedRunId });
  logChange(`Cable map path added: ${label || '(unlabeled)'}`);
  save(); closeModal(); window._crPendingLine = null; renderCableRunMap();
  toast('Path saved', 'success');
}

function crPathClick(id) {
  if (!_crEditMode) return;
  const p = getProject();
  const line = (p.cableRunMap?.paths||[]).find(l => l.id === id);
  if (!line) return;
  const runOpts = `<option value="">— None —</option>` +
    (p.cableRuns||[]).map(r => `<option value="${r.id}" ${line.linkedRunId===r.id?'selected':''}>${esc(r.label||r.fromRoom+' → '+r.toRoom)}</option>`).join('');
  openModal(`
    <h3>Edit Cable Path</h3>
    <div class="form-row"><label>Label</label>
      <input class="form-control" id="ecp-label" value="${esc(line.label||'')}" autofocus></div>
    <div class="form-row-inline">
      <div class="form-row"><label>Color</label>
        <input type="color" class="form-control" id="ecp-color" value="${line.color||'#ffaa00'}" style="height:38px;padding:4px"></div>
      <div class="form-row"><label>Type</label>
        <select class="form-control" id="ecp-type">
          ${CABLE_TYPES.map(t=>`<option ${line.cableType===t?'selected':''}>${t}</option>`).join('')}
        </select></div>
    </div>
    <div class="form-row"><label>Linked Cable Run</label>
      <select class="form-control" id="ecp-link">${runOpts}</select></div>
    <p style="font-size:11px;color:var(--text3)">${line.points.length} points</p>
    <div class="modal-actions">
      <button class="btn btn-danger btn-sm" onclick="crDeletePath('${id}')" style="margin-right:auto">Delete</button>
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="crUpdatePath('${id}')">Save</button>
    </div>
  `);
  setTimeout(() => document.getElementById('ecp-label')?.focus(), 50);
}

function crUpdatePath(id) {
  const p = getProject();
  const line = (p.cableRunMap?.paths||[]).find(l => l.id === id);
  if (!line) return;
  line.label = document.getElementById('ecp-label')?.value?.trim() || '';
  line.color = document.getElementById('ecp-color')?.value || '#ffaa00';
  line.cableType = document.getElementById('ecp-type')?.value || '';
  line.linkedRunId = document.getElementById('ecp-link')?.value || '';
  logChange(`Cable map path updated: ${line.label || id}`);
  save(); closeModal(); renderCableRunMap(); toast('Path updated', 'success');
}

function crDeletePath(id) {
  const p = getProject();
  p.cableRunMap.paths = (p.cableRunMap.paths||[]).filter(l => l.id !== id);
  logChange('Cable map path deleted');
  save(); closeModal(); renderCableRunMap(); toast('Path deleted');
}

// ═══════════════════════════════════════════
//  MAP — symbol placement
// ═══════════════════════════════════════════
function crSelectSymbol(type) {
  _crPlacingSymbol = _crPlacingSymbol === type ? null : type;
  _crDrawing = false;
  _crCurrentLine = null;
  renderCableRunMap();
}
function crCancelSymbol() {
  _crPlacingSymbol = null;
  renderCableRunMap();
}

function crPlaceSymbolAt(x, y) {
  const type = _crPlacingSymbol;
  if (!type) return;
  const def = CR_SYMBOLS[type];
  const p = getProject();
  const sym = { id: genId(), type, x, y, label: '', rotation: 0, size: 1 };
  p.cableRunMap.symbols.push(sym);
  logChange(`Cable map symbol placed: ${def?.label || type}`);
  save();
  // Stay in placement mode for rapid placement
  renderCableRunMap();
}

function crSymbolClick(id) {
  if (!_crEditMode) return;
  const p = getProject();
  const s = (p.cableRunMap?.symbols||[]).find(x => x.id === id);
  if (!s) return;
  const def = CR_SYMBOLS[s.type];
  const sz = s.size || 1;
  openModal(`
    <h3>Edit Symbol — ${esc(def?.label || s.type)}</h3>
    <div style="text-align:center;margin:10px 0">
      <svg width="48" height="48" viewBox="0 0 24 24" style="transform:rotate(${s.rotation||0}deg)">${def?.icon||''}</svg>
    </div>
    <div class="form-row"><label>Label (optional)</label>
      <input class="form-control" id="csm-label" value="${esc(s.label||'')}" placeholder="e.g. J-Box #3"></div>
    <div class="form-row"><label>Size</label>
      <div style="display:flex;align-items:center;gap:10px">
        <input type="range" id="csm-size" min="0.5" max="3" step="0.1" value="${sz}" style="flex:1;accent-color:var(--accent)"
          oninput="document.getElementById('csm-size-lbl').textContent=Math.round(this.value*100)+'%'">
        <span id="csm-size-lbl" style="font-size:11px;color:var(--text3);font-family:var(--mono);min-width:36px">${Math.round(sz*100)}%</span>
      </div>
    </div>
    <div class="form-row"><label>Rotation</label>
      <div style="display:flex;align-items:center;gap:10px">
        <input type="range" id="csm-rot" min="0" max="360" step="15" value="${s.rotation||0}" style="flex:1;accent-color:var(--accent)"
          oninput="document.getElementById('csm-rot-lbl').textContent=this.value+'°'">
        <span id="csm-rot-lbl" style="font-size:11px;color:var(--text3);font-family:var(--mono);min-width:36px">${s.rotation||0}°</span>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-danger btn-sm" onclick="crDeleteSymbol('${id}')" style="margin-right:auto">Delete</button>
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="crUpdateSymbol('${id}')">Save</button>
    </div>
  `);
}

function crUpdateSymbol(id) {
  const p = getProject();
  const s = (p.cableRunMap?.symbols||[]).find(x => x.id === id);
  if (!s) return;
  s.label = document.getElementById('csm-label')?.value?.trim() || '';
  s.size = parseFloat(document.getElementById('csm-size')?.value) || 1;
  s.rotation = parseInt(document.getElementById('csm-rot')?.value) || 0;
  logChange(`Cable map symbol updated`);
  save(); closeModal(); renderCableRunMap(); toast('Symbol updated', 'success');
}

function crDeleteSymbol(id) {
  const p = getProject();
  p.cableRunMap.symbols = (p.cableRunMap.symbols||[]).filter(x => x.id !== id);
  logChange('Cable map symbol deleted');
  save(); closeModal(); renderCableRunMap(); toast('Symbol deleted');
}

// ═══════════════════════════════════════════
//  MAP — symbol dragging
// ═══════════════════════════════════════════
function crSymbolDragStart(e, id) {
  if (!_crEditMode) return;
  if (_crDrawing || _crPlacingSymbol) return;
  e.preventDefault();
  _crDragSymbol = { id };
  document.addEventListener('mousemove', crSymbolDragMove);
  document.addEventListener('mouseup', crSymbolDragEnd);
}
function crSymbolDragMove(e) {
  if (!_crDragSymbol) return;
  const el = document.querySelector(`[data-sym-id="${_crDragSymbol.id}"]`);
  const img = document.getElementById('cr-img');
  if (!el || !img) return;
  const rect = img.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width * 100);
  const y = ((e.clientY - rect.top) / rect.height * 100);
  el.style.left = x + '%';
  el.style.top = y + '%';
}
function crSymbolDragEnd(e) {
  if (!_crDragSymbol) return;
  document.removeEventListener('mousemove', crSymbolDragMove);
  document.removeEventListener('mouseup', crSymbolDragEnd);
  const img = document.getElementById('cr-img');
  if (img) {
    const rect = img.getBoundingClientRect();
    const x = parseFloat(((e.clientX - rect.left) / rect.width * 100).toFixed(2));
    const y = parseFloat(((e.clientY - rect.top) / rect.height * 100).toFixed(2));
    const p = getProject();
    const s = (p.cableRunMap?.symbols||[]).find(sym => sym.id === _crDragSymbol.id);
    if (s) { s.x = x; s.y = y; save(); }
  }
  _crDragSymbol = null;
}

// ═══════════════════════════════════════════
//  MAP — symbol hover highlight
// ═══════════════════════════════════════════
function crHighlightSymbol(id, on) {
  const el = document.querySelector(`[data-sym-id="${id}"]`);
  if (!el) return;
  if (on) {
    el.style.filter = 'drop-shadow(0 0 8px #fff) drop-shadow(0 0 16px var(--accent))';
    el.style.zIndex = '50';
    el.style.transition = 'filter .15s';
  } else {
    el.style.filter = '';
    el.style.zIndex = '';
    el.style.transition = '';
  }
}

// ═══════════════════════════════════════════
//  TABLE — CRUD (unchanged)
// ═══════════════════════════════════════════
function toggleCableVerified(id, val) {
  const p=getProject();
  const r=(p.cableRuns||[]).find(x=>x.id===id);
  if(r){r.verified=val;logChange(`Cable run ${r.label||id}: verified=${val}`);save();}
}

function addCableRun() { openCableRunModal(null); }
function editCableRun(id) { openCableRunModal(id); }

function openCableRunModal(id) {
  const p=getProject();
  const r=id?(p.cableRuns||[]).find(x=>x.id===id):null;
  const typeOpts=CABLE_TYPES.map(t=>`<option value="${t}" ${(r?.type||'Cat6')===t?'selected':''}>${t}</option>`).join('');
  openModal(`
    <h3>${id?'Edit':'Add'} Cable Run</h3>
    <div class="form-row-inline">
      <div class="form-row" style="flex:1"><label>Label</label>
        <input class="form-control" id="cr-label" value="${esc(r?.label||'')}" placeholder="e.g. CR-001"></div>
      <div class="form-row"><label>Type</label>
        <select class="form-control" id="cr-type">${typeOpts}</select></div>
    </div>
    <div class="form-row-inline">
      <div class="form-row"><label>From Room</label>
        <input class="form-control" id="cr-fromroom" value="${esc(r?.fromRoom||'')}" placeholder="IDF-1"></div>
      <div class="form-row"><label>From Port</label>
        <input class="form-control" id="cr-fromport" value="${esc(r?.fromPort||'')}" placeholder="P12"></div>
    </div>
    <div class="form-row-inline">
      <div class="form-row"><label>To Room</label>
        <input class="form-control" id="cr-toroom" value="${esc(r?.toRoom||'')}" placeholder="MDF"></div>
      <div class="form-row"><label>To Port</label>
        <input class="form-control" id="cr-toport" value="${esc(r?.toPort||'')}" placeholder="P24"></div>
    </div>
    <div class="form-row-inline">
      <div class="form-row"><label>Length (ft/m)</label>
        <input class="form-control" id="cr-length" value="${esc(r?.length||'')}" placeholder="100ft"></div>
      <div class="form-row"><label>Color</label>
        <input type="color" class="form-control" id="cr-color" value="${r?.color||'#4488ff'}" style="height:38px;padding:4px"></div>
    </div>
    <div class="form-row"><label>Notes</label>
      <textarea class="form-control" id="cr-notes" rows="2">${esc(r?.notes||'')}</textarea></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveCableRun('${id||''}')">Save</button>
    </div>`, '540px');
  setTimeout(()=>document.getElementById('cr-label')?.focus(),50);
}

function saveCableRun(id) {
  const p=getProject();
  const data={
    label: document.getElementById('cr-label')?.value?.trim()||'',
    type: document.getElementById('cr-type')?.value||'Cat6',
    fromRoom: document.getElementById('cr-fromroom')?.value?.trim()||'',
    fromPort: document.getElementById('cr-fromport')?.value?.trim()||'',
    toRoom: document.getElementById('cr-toroom')?.value?.trim()||'',
    toPort: document.getElementById('cr-toport')?.value?.trim()||'',
    length: document.getElementById('cr-length')?.value?.trim()||'',
    color: document.getElementById('cr-color')?.value||'',
    notes: document.getElementById('cr-notes')?.value?.trim()||'',
    verified: id ? ((p.cableRuns||[]).find(x=>x.id===id)?.verified||false) : false,
  };
  if(!p.cableRuns) p.cableRuns=[];
  if(id){
    const idx=p.cableRuns.findIndex(x=>x.id===id);
    if(idx>=0){Object.assign(p.cableRuns[idx],data);logChange(`Cable run updated: ${data.label||id}`);}
  } else {
    p.cableRuns.push({id:genId(),...data});
    logChange(`Cable run added: ${data.label||'(unlabeled)'} ${data.fromRoom}→${data.toRoom}`);
  }
  save(); closeModal(); renderCableRuns(); toast(id?'Cable run updated':'Cable run added','success');
}

function deleteCableRun(id) {
  if(!confirm('Delete this cable run?')) return;
  const p=getProject();
  const r=(p.cableRuns||[]).find(x=>x.id===id);
  if(r) logChange(`Cable run deleted: ${r.label||id}`);
  p.cableRuns=(p.cableRuns||[]).filter(x=>x.id!==id);
  save(); renderCableRuns(); toast('Deleted');
}
