const LOCATION_TYPES = ['building','floor','room'];

function manageLocations() {
  const p = getProject();
  if (!p.locations) p.locations=[];
  const locs = p.locations;
  openModal(`
    <h3>📍 Location Hierarchy</h3>
    <p style="color:var(--text2);font-size:12px;margin-bottom:14px">Define buildings, floors, and rooms for structured location tracking.</p>
    <div style="max-height:300px;overflow-y:auto;margin-bottom:12px">
      ${locs.length===0?`<div style="color:var(--text3);font-size:12px;padding:8px">No locations defined yet.</div>`:
        locs.map(l=>{
          const parent = locs.find(x=>x.id===l.parentId);
          return `<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--card);border:1px solid var(--border);border-radius:5px;margin-bottom:5px">
            <span style="font-size:10px;background:var(--card2);border:1px solid var(--border2);border-radius:3px;padding:1px 5px;font-family:var(--mono)">${esc(l.type||'')}</span>
            <span style="flex:1">${esc(l.name||'')}</span>
            ${parent?`<span style="font-size:11px;color:var(--text3)">↳ ${esc(parent.name)}</span>`:''}
            <button class="btn btn-danger btn-sm btn-icon" onclick="deleteLocation('${l.id}')">✕</button>
          </div>`;
        }).join('')}
    </div>
    <div style="border-top:1px solid var(--border);padding-top:12px">
      <div class="form-row-inline">
        <div class="form-row" style="flex:2"><label>Name</label>
          <input class="form-control" id="loc-name" placeholder="Server Room A"></div>
        <div class="form-row"><label>Type</label>
          <select class="form-control" id="loc-type">
            ${LOCATION_TYPES.map(t=>`<option value="${t}">${t}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-row"><label>Parent (optional)</label>
        <select class="form-control" id="loc-parent">
          <option value="">— None —</option>
          ${locs.map(l=>`<option value="${l.id}">${esc(l.name)} (${l.type})</option>`).join('')}
        </select></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Close</button>
      <button class="btn btn-primary" onclick="addLocation()">+ Add Location</button>
    </div>`, '500px');
}

function addLocation() {
  const name = document.getElementById('loc-name')?.value?.trim();
  if (!name) return toast('Name is required','error');
  const p = getProject();
  if (!p.locations) p.locations=[];
  p.locations.push({
    id:genId(), name,
    type: document.getElementById('loc-type')?.value||'room',
    parentId: document.getElementById('loc-parent')?.value||null,
    notes:''
  });
  logChange(`Location added: ${name}`);
  save(); manageLocations();
}

function deleteLocation(id) {
  const p=getProject();
  const l=(p.locations||[]).find(x=>x.id===id);
  if(l) logChange(`Location deleted: ${l.name}`);
  p.locations=(p.locations||[]).filter(x=>x.id!==id&&x.parentId!==id);
  save(); manageLocations();
}

// ═══════════════════════════════════════════
//  FEATURE 13: SITE MAP
// ═══════════════════════════════════════════
let _smPan={x:0,y:0},_smZoom=1,_smDragging=false,_smDragStart={x:0,y:0},_smPanStart={x:0,y:0};
let _smOverlay='markers'; // 'markers' | 'cableruns'
let _smEditMode=false;
let _smDrawing=false;
let _smCurrentLine=null; // {points:[{x,y}...], color, label}

async function renderSiteMap() {
  const p = getProject();
  if (!p.siteMap) p.siteMap={data:null,markers:[],cableLines:[]};
  if (!p.siteMap.cableLines) p.siteMap.cableLines=[];
  // Load map image from separate store if needed
  if (!p.siteMap.data) {
    const smData = await _lazyGetPhotoData('sitemap_' + p.id);
    if (smData) p.siteMap.data = smData;
  }

  setTopbarActions(`
    <select class="form-control" style="width:160px;padding:4px 8px;font-size:12px" onchange="smSetOverlay(this.value)">
      <option value="markers" ${_smOverlay==='markers'?'selected':''}>📍 Site Map</option>
      <option value="cableruns" ${_smOverlay==='cableruns'?'selected':''}>⇄ Cable Runs</option>
    </select>
    <button class="btn btn-sm ${_smEditMode?'btn-primary':'btn-ghost'}" onclick="smToggleEdit()"
      style="${_smEditMode?'border-color:var(--amber);background:rgba(255,170,0,.15);color:var(--amber)':''}"
      title="${_smEditMode?'Click to exit edit mode':'Click to enable edit mode'}">
      ${_smEditMode?'🔓 Edit Mode ON':'🔒 View Only'}
    </button>
    ${p.siteMap.data?`<button class="btn btn-ghost btn-sm" onclick="clearSiteMap()">✕ Clear Map</button>`:''}
    ${!p.siteMap.data?`<label class="btn btn-primary btn-sm" style="cursor:pointer">📁 Upload Floor Plan<input type="file" accept="image/*" style="display:none" onchange="uploadSiteMap(event)"></label>`:''}
  `);

  if (!p.siteMap.data) {
    document.getElementById('view-area').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🗺</div>
        <h3>No floor plan uploaded</h3>
        <p>Upload a floor plan image to place markers for racks, rooms, and equipment.</p>
        <br>
        <label class="btn btn-primary" style="cursor:pointer;display:inline-flex;align-items:center;gap:7px">
          📁 Upload Floor Plan
          <input type="file" accept="image/*" style="display:none" onchange="uploadSiteMap(event)">
        </label>
      </div>`;
    return;
  }

  const markers = p.siteMap.markers||[];
  const cableLines = p.siteMap.cableLines||[];
  const isMarkers = _smOverlay==='markers';
  const canEdit = _smEditMode;

  // Build SVG cable lines layer
  const svgLines = cableLines.map(line => {
    if (!line.points || line.points.length < 2) return '';
    const pts = line.points.map((pt,i) => `${i===0?'M':'L'} ${pt.x} ${pt.y}`).join(' ');
    const color = line.color || '#ffaa00';
    return `<g onclick="event.stopPropagation();smCableLineClick('${line.id}')" style="cursor:pointer">
      <path d="${pts}" stroke="${color}" stroke-width="0.5" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.85" pointer-events="stroke"/>
      <path d="${pts}" stroke="transparent" stroke-width="3" fill="none" pointer-events="stroke"/>
      ${line.label ? (() => { const mid = line.points[Math.floor(line.points.length/2)]; return `<text x="${mid.x}" y="${mid.y}" font-size="3" font-family="monospace" fill="${color}" text-anchor="middle" dy="-1" pointer-events="none">${esc(line.label)}</text>`; })() : ''}
    </g>`;
  }).join('');

  // Build in-progress drawing line
  const drawingLine = (_smDrawing && _smCurrentLine && _smCurrentLine.points.length > 0) ? (() => {
    const pts = _smCurrentLine.points.map((pt,i) => `${i===0?'M':'L'} ${pt.x} ${pt.y}`).join(' ');
    return `<path d="${pts}" stroke="${_smCurrentLine.color||'#ffaa00'}" stroke-width="0.5" fill="none" stroke-dasharray="2,1" opacity="0.7"/>`;
  })() : '';

  // Cursor based on mode
  const cursor = !canEdit ? 'grab' : isMarkers ? 'crosshair' : (_smDrawing ? 'crosshair' : 'crosshair');

  document.getElementById('view-area').innerHTML = `
    <div style="display:flex;gap:14px;height:calc(100vh - 130px)">
      <div style="flex:1;position:relative">
        ${canEdit ? `<div class="sm-edit-badge">✎ EDIT MODE${!isMarkers ? (_smDrawing ? ' · DRAWING — click to add points, dbl-click to finish' : ' · Click to start a cable run') : ' · Dbl-click map to place marker'}</div>` : ''}
        ${canEdit && !isMarkers && _smDrawing ? `<div class="sm-drawing-hint">Click: add point &nbsp;|&nbsp; Double-click: finish &nbsp;|&nbsp; ESC: cancel</div>` : ''}
        <div id="sm-canvas" class="sitemap-canvas ${canEdit?'edit-mode':''}"
          style="width:100%;height:calc(100vh - 150px);cursor:${cursor};user-select:none"
          onmousedown="smMouseDown(event)" onmousemove="smMouseMove(event)" onmouseup="smMouseUp(event)"
          onclick="smCanvasClick(event)"
          ondblclick="smDblClick(event)" onwheel="smWheel(event)">
          <div id="sm-pan" style="position:absolute;top:0;left:0;transform-origin:0 0;transform:translate(${_smPan.x}px,${_smPan.y}px) scale(${_smZoom})">
            <img id="sm-img" src="${p.siteMap.data}" style="display:block;max-width:none;pointer-events:none" draggable="false">
            <svg id="sm-svg" style="position:absolute;top:0;left:0;width:100%;height:100%;overflow:visible;pointer-events:none"
              viewBox="0 0 100 100" preserveAspectRatio="none">
              ${svgLines}
              ${drawingLine}
            </svg>
            <div id="sm-markers" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none">
              ${markers.map(m=>{
                const sz = m.size||1;
                return `<div class="sitemap-marker" style="left:${m.x}%;top:${m.y}%;pointer-events:all;transform:translate(-50%,-100%) scale(${sz});transform-origin:bottom center"
                  title="${esc(m.label)}" onclick="event.stopPropagation();smMarkerClick('${m.id}')">
                  <div class="sitemap-label">${esc(m.label)}</div>
                  <div class="sitemap-pin" style="background:${m.color||'#00c8ff'}"></div>
                </div>`;
              }).join('')}
            </div>
          </div>
        </div>
        <div style="position:absolute;bottom:8px;left:8px;display:flex;gap:4px">
          <button class="btn btn-ghost btn-sm" onclick="smZoomIn()">+</button>
          <button class="btn btn-ghost btn-sm" onclick="smZoomOut()">−</button>
          <button class="btn btn-ghost btn-sm" onclick="smResetView()">⟳</button>
        </div>
      </div>
      <div style="width:210px;flex-shrink:0;overflow-y:auto">
        ${isMarkers ? `
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <div style="font-size:11px;color:var(--text2);font-family:var(--mono);text-transform:uppercase;letter-spacing:1px">Markers (${markers.length})</div>
            ${canEdit?`<button class="btn btn-ghost btn-sm" style="font-size:10px;padding:2px 8px" onclick="addSiteMapMarker()">+ Add</button>`:''}
          </div>
          ${markers.map(m=>`
            <div style="padding:7px 10px;background:var(--card);border:1px solid var(--border);border-radius:5px;margin-bottom:5px;cursor:pointer;display:flex;align-items:center;gap:7px" onclick="smMarkerClick('${m.id}')">
              <span style="width:10px;height:10px;border-radius:50%;background:${m.color||'#00c8ff'};flex-shrink:0;transform:scale(${m.size||1})"></span>
              <span style="font-size:12px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(m.label)}</span>
              ${canEdit?`<button class="btn btn-danger btn-sm btn-icon" onclick="event.stopPropagation();deleteSmMarker('${m.id}')" style="font-size:10px;padding:2px 5px">✕</button>`:''}
            </div>`).join('')}
          ${markers.length===0?`<div style="color:var(--text3);font-size:12px">${canEdit?'Double-click the map to place a marker.':'Enable Edit Mode to add markers.'}</div>`:''}
        ` : `
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <div style="font-size:11px;color:var(--text2);font-family:var(--mono);text-transform:uppercase;letter-spacing:1px">Cable Runs (${cableLines.length})</div>
            ${canEdit&&!_smDrawing?`<button class="btn btn-ghost btn-sm" style="font-size:10px;padding:2px 8px" onclick="smStartCableLine()">+ Draw</button>`:''}
            ${canEdit&&_smDrawing?`<button class="btn btn-danger btn-sm" style="font-size:10px;padding:2px 8px" onclick="smCancelCableLine()">Cancel</button>`:''}
          </div>
          ${cableLines.map(line=>`
            <div style="padding:7px 10px;background:var(--card);border:1px solid var(--border);border-radius:5px;margin-bottom:5px;cursor:pointer;display:flex;align-items:center;gap:7px" onclick="smCableLineClick('${line.id}')">
              <span style="width:18px;height:3px;border-radius:2px;background:${line.color||'#ffaa00'};flex-shrink:0"></span>
              <span style="font-size:12px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(line.label||'Cable Run')}</span>
              ${canEdit?`<button class="btn btn-danger btn-sm btn-icon" onclick="event.stopPropagation();smDeleteCableLine('${line.id}')" style="font-size:10px;padding:2px 5px">✕</button>`:''}
            </div>`).join('')}
          ${cableLines.length===0?`<div style="color:var(--text3);font-size:12px">${canEdit?'Click "+ Draw" then click the map to trace a cable run. Double-click to finish.':'Enable Edit Mode to draw cable runs.'}</div>`:''}
        `}
      </div>
    </div>`;
}

function uploadSiteMap(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async ev => {
    const p = getProject();
    if (!p.siteMap) p.siteMap={data:null,markers:[]};
    const dataUrl = ev.target.result;
    await _idbSavePhotoData('sitemap_' + p.id, dataUrl);
    p.siteMap.data = dataUrl; // keep in memory for immediate rendering
    _smPan={x:0,y:0}; _smZoom=1;
    logChange('Site map floor plan uploaded');
    save(); renderSiteMap(); toast('Floor plan uploaded','success');
  };
  reader.readAsDataURL(file);
}

function clearSiteMap() {
  if (!confirm('Clear the floor plan? Markers will be kept.')) return;
  const p=getProject();
  if(p.siteMap) p.siteMap.data=null;
  _idbDeletePhotoData('sitemap_' + p.id).catch(() => {});
  logChange('Site map floor plan cleared');
  save(); renderSiteMap();
}

function smMouseDown(e) {
  if (e.button!==0) return;
  _smDragging=true;
  _smDragStart={x:e.clientX,y:e.clientY};
  _smPanStart={..._smPan};
  document.getElementById('sm-canvas').style.cursor='grabbing';
}
function smMouseMove(e) {
  if(!_smDragging) return;
  _smPan.x=_smPanStart.x+(e.clientX-_smDragStart.x);
  _smPan.y=_smPanStart.y+(e.clientY-_smDragStart.y);
  const pan=document.getElementById('sm-pan');
  if(pan) pan.style.transform=`translate(${_smPan.x}px,${_smPan.y}px) scale(${_smZoom})`;
}
function smMouseUp(e) {
  _smDragging=false;
  const c=document.getElementById('sm-canvas');
  if(c) c.style.cursor=_smEditMode?'crosshair':'grab';
}
function smWheel(e) {
  e.preventDefault();
  const delta = e.deltaY<0?1.1:0.9;
  _smZoom=Math.max(0.2,Math.min(5,_smZoom*delta));
  const pan=document.getElementById('sm-pan');
  if(pan) pan.style.transform=`translate(${_smPan.x}px,${_smPan.y}px) scale(${_smZoom})`;
}
function smZoomIn(){_smZoom=Math.min(5,_smZoom*1.2);const pan=document.getElementById('sm-pan');if(pan)pan.style.transform=`translate(${_smPan.x}px,${_smPan.y}px) scale(${_smZoom})`;}
function smZoomOut(){_smZoom=Math.max(0.2,_smZoom/1.2);const pan=document.getElementById('sm-pan');if(pan)pan.style.transform=`translate(${_smPan.x}px,${_smPan.y}px) scale(${_smZoom})`;}
function smResetView(){_smPan={x:0,y:0};_smZoom=1;const pan=document.getElementById('sm-pan');if(pan)pan.style.transform='translate(0px,0px) scale(1)';}

function smDblClick(e) {
  const p=getProject();
  if(!p.siteMap?.data) return;
  if(!_smEditMode) return; // view-only mode blocks edits
  if(_smOverlay==='cableruns') {
    // Double-click finishes current cable line
    if(_smDrawing && _smCurrentLine) {
      const pt = smEventToImgPct(e);
      if(pt) _smCurrentLine.points.push(pt);
      smFinishCableLine();
    } else {
      // Start a new cable line
      smStartCableLine();
      const pt = smEventToImgPct(e);
      if(pt) _smCurrentLine.points.push(pt);
    }
    return;
  }
  // Markers overlay: place a marker
  const img=document.getElementById('sm-img');
  if(!img) return;
  const rect=img.getBoundingClientRect();
  const xPct=((e.clientX-rect.left)/rect.width*100).toFixed(2);
  const yPct=((e.clientY-rect.top)/rect.height*100).toFixed(2);
  openSmMarkerModal(null,xPct,yPct);
}

function addSiteMapMarker() {
  openSmMarkerModal(null,'50','50');
}

function smSetOverlay(val) { _smOverlay=val; _smDrawing=false; _smCurrentLine=null; renderSiteMap(); }
function smToggleEdit() { _smEditMode=!_smEditMode; if(!_smEditMode){_smDrawing=false;_smCurrentLine=null;} renderSiteMap(); }

function smCanvasClick(e) {
  if (!_smEditMode) return;
  if (_smOverlay!=='cableruns') return;
  if (!_smDrawing || !_smCurrentLine) return;
  // Add a point to the current line
  const pt = smEventToImgPct(e);
  if (!pt) return;
  _smCurrentLine.points.push(pt);
  // Re-render SVG only (lightweight)
  smRedrawLines();
}

function smEventToImgPct(e) {
  const img = document.getElementById('sm-img');
  if (!img) return null;
  const rect = img.getBoundingClientRect();
  const x = parseFloat(((e.clientX - rect.left) / rect.width * 100).toFixed(2));
  const y = parseFloat(((e.clientY - rect.top) / rect.height * 100).toFixed(2));
  return { x, y };
}

function smRedrawLines() {
  // Lightweight re-render of just the SVG layer
  const p = getProject();
  const cableLines = p.siteMap?.cableLines||[];
  const svgLines = cableLines.map(line => {
    if (!line.points || line.points.length < 2) return '';
    const pts = line.points.map((pt,i) => `${i===0?'M':'L'} ${pt.x} ${pt.y}`).join(' ');
    const color = line.color || '#ffaa00';
    return `<g onclick="event.stopPropagation();smCableLineClick('${line.id}')" style="cursor:pointer">
      <path d="${pts}" stroke="${color}" stroke-width="0.5" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.85" pointer-events="stroke"/>
      <path d="${pts}" stroke="transparent" stroke-width="3" fill="none" pointer-events="stroke"/>
      ${line.label ? (() => { const mid = line.points[Math.floor(line.points.length/2)]; return `<text x="${mid.x}" y="${mid.y}" font-size="3" font-family="monospace" fill="${color}" text-anchor="middle" dy="-1">${esc(line.label)}</text>`; })() : ''}
    </g>`;
  }).join('');
  const drawingLine = (_smDrawing && _smCurrentLine && _smCurrentLine.points.length > 0) ? (() => {
    const pts = _smCurrentLine.points.map((pt,i) => `${i===0?'M':'L'} ${pt.x} ${pt.y}`).join(' ');
    return `<path d="${pts}" stroke="${_smCurrentLine.color||'#ffaa00'}" stroke-width="0.5" fill="none" stroke-dasharray="2,1" opacity="0.7"/>`;
  })() : '';
  const svg = document.getElementById('sm-svg');
  if (svg) svg.innerHTML = svgLines + drawingLine;
}

function smStartCableLine() {
  _smDrawing = true;
  _smCurrentLine = { points: [], color: '#ffaa00', label: '' };
  renderSiteMap();
}

function smCancelCableLine() {
  _smDrawing = false;
  _smCurrentLine = null;
  renderSiteMap();
}

function smFinishCableLine() {
  if (!_smCurrentLine || _smCurrentLine.points.length < 2) {
    toast('Draw at least 2 points to create a cable run', 'error');
    return;
  }
  const line = { ..._smCurrentLine };
  _smDrawing = false;
  _smCurrentLine = null;
  // Ask for label and color
  openModal(`
    <h3>Save Cable Run</h3>
    <div class="form-row"><label>Label</label>
      <input class="form-control" id="scl-label" placeholder="e.g. MDF to IDF-166" value="${esc(line.label||'')}" autofocus></div>
    <div class="form-row-inline">
      <div class="form-row"><label>Color</label>
        <input type="color" class="form-control" id="scl-color" value="${line.color||'#ffaa00'}" style="height:38px;padding:4px"></div>
      <div class="form-row"><label>Cable Type</label>
        <select class="form-control" id="scl-type">
          ${['Cat5e','Cat6','Cat6A','Fiber SM','Fiber MM','Coax','Other'].map(t=>`<option>${t}</option>`).join('')}
        </select></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal();renderSiteMap()">Discard</button>
      <button class="btn btn-primary" onclick="smSaveCableLine(${JSON.stringify(line).split('"').join('&quot;')})">Save Run</button>
    </div>
  `);
  setTimeout(()=>document.getElementById('scl-label')?.focus(),50);
  // Store pending line in a temp variable to avoid JSON escaping issues
  window._smPendingLine = line;
}

function smSaveCableLine() {
  const line = window._smPendingLine;
  if (!line) return;
  const label = document.getElementById('scl-label')?.value?.trim()||'';
  const color = document.getElementById('scl-color')?.value||'#ffaa00';
  const cableType = document.getElementById('scl-type')?.value||'';
  const p = getProject();
  if (!p.siteMap.cableLines) p.siteMap.cableLines=[];
  p.siteMap.cableLines.push({ id:genId(), points:line.points, label, color, cableType });
  logChange(`Site map cable run added: ${label||'(unlabeled)'}`);
  save(); closeModal(); window._smPendingLine=null; renderSiteMap();
  toast('Cable run saved','success');
}

function smCableLineClick(id) {
  if (!_smEditMode) return;
  const p = getProject();
  const line = (p.siteMap?.cableLines||[]).find(l=>l.id===id);
  if (!line) return;
  openModal(`
    <h3>Edit Cable Run</h3>
    <div class="form-row"><label>Label</label>
      <input class="form-control" id="ecl-label" value="${esc(line.label||'')}" autofocus></div>
    <div class="form-row-inline">
      <div class="form-row"><label>Color</label>
        <input type="color" class="form-control" id="ecl-color" value="${line.color||'#ffaa00'}" style="height:38px;padding:4px"></div>
      <div class="form-row"><label>Type</label>
        <select class="form-control" id="ecl-type">
          ${['Cat5e','Cat6','Cat6A','Fiber SM','Fiber MM','Coax','Other'].map(t=>`<option ${line.cableType===t?'selected':''}>${t}</option>`).join('')}
        </select></div>
    </div>
    <p style="font-size:11px;color:var(--text3)">${line.points.length} points</p>
    <div class="modal-actions">
      <button class="btn btn-danger btn-sm" onclick="smDeleteCableLine('${id}')" style="margin-right:auto">Delete</button>
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="smUpdateCableLine('${id}')">Save</button>
    </div>
  `);
  setTimeout(()=>document.getElementById('ecl-label')?.focus(),50);
}

function smUpdateCableLine(id) {
  const p = getProject();
  const line = (p.siteMap?.cableLines||[]).find(l=>l.id===id);
  if (!line) return;
  line.label = document.getElementById('ecl-label')?.value?.trim()||'';
  line.color = document.getElementById('ecl-color')?.value||'#ffaa00';
  line.cableType = document.getElementById('ecl-type')?.value||'';
  save(); closeModal(); renderSiteMap(); toast('Cable run updated','success');
}

function smDeleteCableLine(id) {
  const p = getProject();
  if (!p.siteMap?.cableLines) return;
  p.siteMap.cableLines = p.siteMap.cableLines.filter(l=>l.id!==id);
  logChange('Site map cable run deleted');
  save(); closeModal(); renderSiteMap();
}

function openSmMarkerModal(id,xPct,yPct) {
  const p=getProject();
  const m=id?(p.siteMap?.markers||[]).find(x=>x.id===id):null;
  const rackOpts=`<option value="">— None —</option>`+
    p.racks.map(r=>`<option value="${r.id}" ${m?.rackId===r.id?'selected':''}>${esc(r.name)}</option>`).join('');
  const sz = m?.size||1;
  openModal(`
    <h3>${id?'Edit':'Place'} Marker</h3>
    <div class="form-row"><label>Label *</label>
      <input class="form-control" id="sm-label" value="${esc(m?.label||'')}" placeholder="Server Room A"></div>
    <div class="form-row-inline">
      <div class="form-row"><label>Type</label>
        <select class="form-control" id="sm-type">
          <option value="room" ${(m?.type||'room')==='room'?'selected':''}>Room</option>
          <option value="rack" ${m?.type==='rack'?'selected':''}>Rack</option>
          <option value="device" ${m?.type==='device'?'selected':''}>Device</option>
        </select></div>
      <div class="form-row"><label>Color</label>
        <input type="color" class="form-control" id="sm-color" value="${m?.color||'#00c8ff'}" style="height:38px;padding:4px"></div>
    </div>
    <div class="form-row">
      <label>Marker Size</label>
      <div style="display:flex;align-items:center;gap:10px">
        <input type="range" id="sm-size" min="0.5" max="3" step="0.1" value="${sz}" style="flex:1;accent-color:var(--accent)"
          oninput="document.getElementById('sm-size-lbl').textContent=Math.round(this.value*100)+'%'">
        <span id="sm-size-lbl" style="font-size:11px;color:var(--text3);font-family:var(--mono);min-width:36px">${Math.round(sz*100)}%</span>
      </div>
    </div>
    <div class="form-row"><label>Linked Rack (optional)</label>
      <select class="form-control" id="sm-rack">${rackOpts}</select></div>
    <div class="modal-actions">
      ${id?`<button class="btn btn-danger btn-sm" onclick="deleteSmMarker('${id}')" style="margin-right:auto">Delete</button>`:''}
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveSmMarker('${id||''}','${xPct||50}','${yPct||50}')">Save</button>
    </div>`);
  setTimeout(()=>document.getElementById('sm-label')?.focus(),50);
}

function saveSmMarker(id,xPct,yPct) {
  const label=document.getElementById('sm-label')?.value?.trim();
  if(!label) return toast('Label is required','error');
  const p=getProject();
  if(!p.siteMap) p.siteMap={data:null,markers:[],cableLines:[]};
  if(!p.siteMap.markers) p.siteMap.markers=[];
  const data={
    label, type:document.getElementById('sm-type')?.value||'room',
    color:document.getElementById('sm-color')?.value||'#00c8ff',
    size:parseFloat(document.getElementById('sm-size')?.value||1),
    rackId:document.getElementById('sm-rack')?.value||null,
  };
  if(id){
    const idx=p.siteMap.markers.findIndex(x=>x.id===id);
    if(idx>=0) Object.assign(p.siteMap.markers[idx],data);
    logChange(`Site map marker updated: ${label}`);
  } else {
    p.siteMap.markers.push({id:genId(),x:parseFloat(xPct),y:parseFloat(yPct),...data});
    logChange(`Site map marker added: ${label}`);
  }
  save(); closeModal(); renderSiteMap(); toast(id?'Marker updated':'Marker added','success');
}

function deleteSmMarker(id) {
  const p=getProject();
  p.siteMap.markers=(p.siteMap.markers||[]).filter(x=>x.id!==id);
  logChange('Site map marker deleted');
  save(); renderSiteMap();
}

function smMarkerClick(id) {
  const p=getProject();
  const m=(p.siteMap?.markers||[]).find(x=>x.id===id);
  if(!m) return;
  const rack=m.rackId?p.racks.find(r=>r.id===m.rackId):null;
  openModal(`
    <h3 style="margin-bottom:8px">${esc(m.label)}</h3>
    <div style="font-size:12px;color:var(--text2);margin-bottom:12px">Type: ${esc(m.type||'')} ${rack?'· Rack: '+esc(rack.name):''} · Size: ${Math.round((m.size||1)*100)}%</div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Close</button>
      ${rack?`<button class="btn btn-ghost" onclick="closeModal();sessionStorage.setItem('netrack_focus_rack','${rack.id}');setView('racks')">View Rack →</button>`:''}
      ${_smEditMode?`<button class="btn btn-primary" onclick="closeModal();openSmMarkerModal('${id}','${m.x}','${m.y}')">Edit</button>`:''}
    </div>`);
}

