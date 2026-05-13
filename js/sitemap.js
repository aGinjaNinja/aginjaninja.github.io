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
let _smPan={x:0,y:0},_smZoom=1;
let _smDragging=false,_smDragStart={x:0,y:0},_smPanStart={x:0,y:0},_smDragMoved=false;
let _smOverlay='markers';
let _smEditMode=false;
let _smDrawing=false;
let _smCurrentLine=null;
let _smMarkerDrag=null;
let _smTouchPan=null,_smPinch=null;

function _smApplyTransform() {
  const pan=document.getElementById('sm-pan');
  if(pan) pan.style.transform=`translate(${_smPan.x}px,${_smPan.y}px) scale(${_smZoom})`;
}

async function renderSiteMap() {
  const p = getProject();
  if (!p.siteMap) p.siteMap={data:null,markers:[],cableLines:[]};
  if (!p.siteMap.cableLines) p.siteMap.cableLines=[];
  if (!p.siteMap.markers) p.siteMap.markers=[];
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

  const markers = p.siteMap.markers;
  const cableLines = p.siteMap.cableLines;
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

  const drawingLine = (_smDrawing && _smCurrentLine && _smCurrentLine.points.length > 0) ? (() => {
    const pts = _smCurrentLine.points.map((pt,i) => `${i===0?'M':'L'} ${pt.x} ${pt.y}`).join(' ');
    return `<path d="${pts}" stroke="${_smCurrentLine.color||'#ffaa00'}" stroke-width="0.5" fill="none" stroke-dasharray="2,1" opacity="0.7"/>`;
  })() : '';

  const cursor = !canEdit ? 'grab' : 'crosshair';

  // Build marker HTML — IDF markers get cabinet icon, others get pin
  const markersHtml = markers.map(m => {
    const sz = m.size || 1;
    const dragAttr = canEdit ? `onmousedown="event.stopPropagation();smMarkerDragStart(event,'${m.id}')" ontouchstart="event.stopPropagation();smMarkerDragStart(event,'${m.id}')"` : '';
    if (m.type === 'idf') {
      return `<div class="sitemap-idf" style="left:${m.x}%;top:${m.y}%;pointer-events:all;transform:translate(-50%,-50%) scale(${sz})"
        data-marker-id="${m.id}" ${dragAttr}
        onclick="event.stopPropagation();smMarkerClick('${m.id}')">
        <div class="sitemap-idf-box" style="border-color:${m.color||'#00c8ff'}">🗄</div>
        <div class="sitemap-idf-name" style="color:${m.color||'#00c8ff'}">${esc(m.label)}</div>
      </div>`;
    }
    return `<div class="sitemap-marker" style="left:${m.x}%;top:${m.y}%;pointer-events:all;transform:translate(-50%,-100%) scale(${sz});transform-origin:bottom center"
      data-marker-id="${m.id}" ${dragAttr}
      title="${esc(m.label)}" onclick="event.stopPropagation();smMarkerClick('${m.id}')">
      <div class="sitemap-label">${esc(m.label)}</div>
      <div class="sitemap-pin" style="background:${m.color||'#00c8ff'}"></div>
    </div>`;
  }).join('');

  // Build IDF closets sidebar section (racks that can be dragged onto the map)
  const placedRackIds = new Set(markers.filter(m => m.rackId).map(m => m.rackId));
  const racks = p.racks || [];
  const idfSidebar = isMarkers && racks.length > 0 ? `
    <div style="margin-bottom:12px">
      <div style="font-size:11px;color:var(--text2);font-family:var(--mono);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">IDF Closets (${racks.length})</div>
      <div style="font-size:10px;color:var(--text3);margin-bottom:6px">${canEdit ? 'Drag onto map to place' : 'Enable Edit Mode to place'}</div>
      ${racks.map(r => {
        const placed = placedRackIds.has(r.id);
        return `<div class="sm-idf-sidebar-item ${placed ? 'placed' : ''}"
          ${canEdit && !placed ? `onmousedown="smStartIdfDrag(event,'${r.id}')" ontouchstart="smStartIdfDrag(event,'${r.id}')"` : ''}
          style="cursor:${canEdit && !placed ? 'grab' : 'default'}">
          <span style="font-size:14px">🗄</span>
          <span style="flex:1;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.name)}</span>
          ${placed ? '<span style="font-size:10px;color:var(--accent)">✓</span>' : ''}
          ${r.location ? `<span style="font-size:9px;color:var(--text3)">${esc(r.location)}</span>` : ''}
        </div>`;
      }).join('')}
    </div>
    <div style="border-top:1px solid var(--border);margin-bottom:8px"></div>
  ` : '';

  document.getElementById('view-area').innerHTML = `
    <div style="display:flex;gap:14px;height:calc(100vh - 130px)">
      <div style="flex:1;position:relative">
        ${canEdit ? `<div class="sm-edit-badge">✎ EDIT MODE${!isMarkers ? (_smDrawing ? ' · DRAWING — click to add points, dbl-click to finish' : ' · Click to start a cable run') : ' · Dbl-click map to place marker'}</div>` : ''}
        ${canEdit && !isMarkers && _smDrawing ? `<div class="sm-drawing-hint">Click: add point &nbsp;|&nbsp; Double-click: finish &nbsp;|&nbsp; ESC: cancel</div>` : ''}
        <div id="sm-canvas" class="sitemap-canvas ${canEdit?'edit-mode':''}"
          style="width:100%;height:calc(100vh - 150px);cursor:${cursor};user-select:none"
          onmousedown="smMouseDown(event)" onmousemove="smMouseMove(event)" onmouseup="smMouseUp(event)"
          onclick="smCanvasClick(event)"
          ondblclick="smDblClick(event)" onwheel="smWheel(event)"
          ontouchstart="smTouchStart(event)" ontouchmove="smTouchMove(event)" ontouchend="smTouchEnd(event)">
          <div id="sm-pan" style="position:absolute;top:0;left:0;transform-origin:0 0;transform:translate(${_smPan.x}px,${_smPan.y}px) scale(${_smZoom})">
            <img id="sm-img" src="${p.siteMap.data}" style="display:block;max-width:none;pointer-events:none" draggable="false">
            <svg id="sm-svg" style="position:absolute;top:0;left:0;width:100%;height:100%;overflow:visible;pointer-events:none"
              viewBox="0 0 100 100" preserveAspectRatio="none">
              ${svgLines}
              ${drawingLine}
            </svg>
            <div id="sm-markers" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none">
              ${markersHtml}
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
        ${idfSidebar}
        ${isMarkers ? `
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <div style="font-size:11px;color:var(--text2);font-family:var(--mono);text-transform:uppercase;letter-spacing:1px">Markers (${markers.length})</div>
            ${canEdit?`<button class="btn btn-ghost btn-sm" style="font-size:10px;padding:2px 8px" onclick="addSiteMapMarker()">+ Add</button>`:''}
          </div>
          ${markers.map(m=>`
            <div style="padding:7px 10px;background:var(--card);border:1px solid var(--border);border-radius:5px;margin-bottom:5px;cursor:pointer;display:flex;align-items:center;gap:7px" onclick="smMarkerClick('${m.id}')">
              ${m.type==='idf'
                ? `<span style="font-size:14px">🗄</span>`
                : `<span style="width:10px;height:10px;border-radius:50%;background:${m.color||'#00c8ff'};flex-shrink:0;transform:scale(${m.size||1})"></span>`
              }
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
    p.siteMap.data = dataUrl;
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

// ── Pan & Zoom (mouse) ──

function smMouseDown(e) {
  if (e.button!==0) return;
  _smDragging=true;
  _smDragMoved=false;
  _smDragStart={x:e.clientX,y:e.clientY};
  _smPanStart={..._smPan};
  document.getElementById('sm-canvas').style.cursor='grabbing';
}

function smMouseMove(e) {
  if(!_smDragging) return;
  const dx=e.clientX-_smDragStart.x, dy=e.clientY-_smDragStart.y;
  if(Math.abs(dx)>3||Math.abs(dy)>3) _smDragMoved=true;
  _smPan.x=_smPanStart.x+dx;
  _smPan.y=_smPanStart.y+dy;
  _smApplyTransform();
}

function smMouseUp(e) {
  _smDragging=false;
  const c=document.getElementById('sm-canvas');
  if(c) c.style.cursor=_smEditMode?'crosshair':'grab';
}

function smWheel(e) {
  e.preventDefault();
  const canvas=document.getElementById('sm-canvas');
  if(!canvas) return;
  const rect=canvas.getBoundingClientRect();
  const mx=e.clientX-rect.left, my=e.clientY-rect.top;
  const delta=e.deltaY<0?1.1:0.9;
  const newZoom=Math.max(0.2,Math.min(5,_smZoom*delta));
  // Zoom toward mouse position
  _smPan.x=mx-(mx-_smPan.x)*(newZoom/_smZoom);
  _smPan.y=my-(my-_smPan.y)*(newZoom/_smZoom);
  _smZoom=newZoom;
  _smApplyTransform();
}

function smZoomIn() {
  const canvas=document.getElementById('sm-canvas');
  if(!canvas) return;
  const cx=canvas.offsetWidth/2, cy=canvas.offsetHeight/2;
  const newZoom=Math.min(5,_smZoom*1.2);
  _smPan.x=cx-(cx-_smPan.x)*(newZoom/_smZoom);
  _smPan.y=cy-(cy-_smPan.y)*(newZoom/_smZoom);
  _smZoom=newZoom;
  _smApplyTransform();
}

function smZoomOut() {
  const canvas=document.getElementById('sm-canvas');
  if(!canvas) return;
  const cx=canvas.offsetWidth/2, cy=canvas.offsetHeight/2;
  const newZoom=Math.max(0.2,_smZoom/1.2);
  _smPan.x=cx-(cx-_smPan.x)*(newZoom/_smZoom);
  _smPan.y=cy-(cy-_smPan.y)*(newZoom/_smZoom);
  _smZoom=newZoom;
  _smApplyTransform();
}

function smResetView() {
  _smPan={x:0,y:0};_smZoom=1;_smApplyTransform();
}

// ── Pan & Zoom (touch) ──

function smTouchStart(e) {
  if (e.touches.length===1) {
    const t=e.touches[0];
    // Don't start pan if touching a marker (let marker drag handle it)
    const el=document.elementFromPoint(t.clientX,t.clientY);
    if(el?.closest?.('[data-marker-id]')) return;
    e.preventDefault();
    _smTouchPan={startX:t.clientX,startY:t.clientY,origX:_smPan.x,origY:_smPan.y,moved:false,startTime:Date.now()};
    _smPinch=null;
  } else if (e.touches.length===2) {
    e.preventDefault();
    _smTouchPan=null;
    const dx=e.touches[0].clientX-e.touches[1].clientX;
    const dy=e.touches[0].clientY-e.touches[1].clientY;
    const canvas=document.getElementById('sm-canvas');
    const rect=canvas?canvas.getBoundingClientRect():{left:0,top:0};
    const midX=(e.touches[0].clientX+e.touches[1].clientX)/2-rect.left;
    const midY=(e.touches[0].clientY+e.touches[1].clientY)/2-rect.top;
    _smPinch={startDist:Math.hypot(dx,dy),startZoom:_smZoom,startPanX:_smPan.x,startPanY:_smPan.y,midX,midY};
  }
}

function smTouchMove(e) {
  e.preventDefault();
  if(e.touches.length===1&&_smTouchPan) {
    const t=e.touches[0];
    const dx=t.clientX-_smTouchPan.startX, dy=t.clientY-_smTouchPan.startY;
    if(Math.abs(dx)>5||Math.abs(dy)>5) _smTouchPan.moved=true;
    if(!_smTouchPan.moved) return;
    _smPan.x=_smTouchPan.origX+dx;
    _smPan.y=_smTouchPan.origY+dy;
    _smApplyTransform();
  } else if(e.touches.length===2&&_smPinch) {
    const dx=e.touches[0].clientX-e.touches[1].clientX;
    const dy=e.touches[0].clientY-e.touches[1].clientY;
    const newZoom=Math.max(0.2,Math.min(5,_smPinch.startZoom*Math.hypot(dx,dy)/_smPinch.startDist));
    _smPan.x=_smPinch.midX-(_smPinch.midX-_smPinch.startPanX)*(newZoom/_smPinch.startZoom);
    _smPan.y=_smPinch.midY-(_smPinch.midY-_smPinch.startPanY)*(newZoom/_smPinch.startZoom);
    _smZoom=newZoom;
    _smApplyTransform();
  }
}

function smTouchEnd(e) {
  // Single tap without drag → treat as click for edit mode
  if(_smTouchPan&&!_smTouchPan.moved&&e.changedTouches.length===1) {
    const t=e.changedTouches[0];
    if(_smEditMode&&Date.now()-_smTouchPan.startTime<400) {
      smCanvasClick({clientX:t.clientX,clientY:t.clientY,stopPropagation:()=>{}});
    }
  }
  if(e.touches.length<2) _smPinch=null;
  if(e.touches.length===0) _smTouchPan=null;
}

// ── Edit-mode interactions ──

function smDblClick(e) {
  if(_smDragMoved) return;
  const p=getProject();
  if(!p.siteMap?.data) return;
  if(!_smEditMode) return;
  if(_smOverlay==='cableruns') {
    if(_smDrawing && _smCurrentLine) {
      const pt = smEventToImgPct(e);
      if(pt) _smCurrentLine.points.push(pt);
      smFinishCableLine();
    } else {
      smStartCableLine();
      const pt = smEventToImgPct(e);
      if(pt) _smCurrentLine.points.push(pt);
    }
    return;
  }
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
  if(_smDragMoved) return;
  if(!_smEditMode) return;
  if(_smOverlay!=='cableruns') return;
  if(!_smDrawing||!_smCurrentLine) return;
  const pt = smEventToImgPct(e);
  if(!pt) return;
  _smCurrentLine.points.push(pt);
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

// ── Cable Lines ──

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
      <button class="btn btn-primary" onclick="smSaveCableLine()">Save Run</button>
    </div>
  `);
  setTimeout(()=>document.getElementById('scl-label')?.focus(),50);
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

// ── Markers ──

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
          <option value="idf" ${m?.type==='idf'?'selected':''}>IDF Closet</option>
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
  save(); closeModal(); renderSiteMap();
}

// ── Marker drag (reposition on canvas in edit mode) ──

function smMarkerDragStart(e, markerId) {
  if (!_smEditMode) return;
  e.preventDefault();
  const isTouch = e.type==='touchstart';
  const startX = isTouch ? e.touches[0].clientX : e.clientX;
  const startY = isTouch ? e.touches[0].clientY : e.clientY;
  _smMarkerDrag = { markerId, startX, startY, moved: false };

  const getXY = ev => isTouch
    ? { x:(ev.touches[0]||ev.changedTouches[0]).clientX, y:(ev.touches[0]||ev.changedTouches[0]).clientY }
    : { x:ev.clientX, y:ev.clientY };

  const onMove = ev => {
    if (isTouch) ev.preventDefault();
    const { x, y } = getXY(ev);
    if (Math.abs(x-_smMarkerDrag.startX)>3 || Math.abs(y-_smMarkerDrag.startY)>3) _smMarkerDrag.moved=true;
    if (!_smMarkerDrag.moved) return;
    const img = document.getElementById('sm-img');
    if (!img) return;
    const rect = img.getBoundingClientRect();
    const xPct = (x-rect.left)/rect.width*100;
    const yPct = (y-rect.top)/rect.height*100;
    const el = document.querySelector(`[data-marker-id="${markerId}"]`);
    if (el) { el.style.left=xPct+'%'; el.style.top=yPct+'%'; }
  };

  const onUp = ev => {
    document.removeEventListener(isTouch?'touchmove':'mousemove', onMove);
    document.removeEventListener(isTouch?'touchend':'mouseup', onUp);
    if (!_smMarkerDrag?.moved) { _smMarkerDrag=null; return; }
    const { x, y } = getXY(ev);
    const img = document.getElementById('sm-img');
    if (img) {
      const rect = img.getBoundingClientRect();
      const xPct = Math.max(0,Math.min(100,(x-rect.left)/rect.width*100));
      const yPct = Math.max(0,Math.min(100,(y-rect.top)/rect.height*100));
      const p = getProject();
      const m = (p.siteMap?.markers||[]).find(mk=>mk.id===markerId);
      if (m) {
        m.x=parseFloat(xPct.toFixed(2));
        m.y=parseFloat(yPct.toFixed(2));
        logChange(`Site map marker moved: ${m.label}`);
        save();
      }
    }
    _smMarkerDrag=null;
    renderSiteMap();
  };

  document.addEventListener(isTouch?'touchmove':'mousemove', onMove, {passive:false});
  document.addEventListener(isTouch?'touchend':'mouseup', onUp, {passive:false});
}

// ── IDF sidebar drag (drag rack from sidebar onto map) ──

function smStartIdfDrag(e, rackId) {
  e.preventDefault();
  const p = getProject();
  const rack = p.racks.find(r=>r.id===rackId);
  if (!rack) return;

  const isTouch = e.type==='touchstart';
  const startX = isTouch ? e.touches[0].clientX : e.clientX;
  const startY = isTouch ? e.touches[0].clientY : e.clientY;

  const ghost = document.createElement('div');
  ghost.className = 'sitemap-idf';
  ghost.style.cssText = `position:fixed;z-index:9998;pointer-events:none;transform:translate(-50%,-50%);left:${startX}px;top:${startY}px;opacity:0.85`;
  ghost.innerHTML = `<div class="sitemap-idf-box" style="border-color:#00c8ff">🗄</div><div class="sitemap-idf-name" style="color:#00c8ff">${esc(rack.name)}</div>`;
  document.body.appendChild(ghost);

  const getXY = ev => isTouch
    ? { x:(ev.touches[0]||ev.changedTouches[0]).clientX, y:(ev.touches[0]||ev.changedTouches[0]).clientY }
    : { x:ev.clientX, y:ev.clientY };

  const onMove = ev => {
    if (isTouch) ev.preventDefault();
    const { x, y } = getXY(ev);
    ghost.style.left=x+'px'; ghost.style.top=y+'px';
    const canvas=document.getElementById('sm-canvas');
    if(canvas){
      const cr=canvas.getBoundingClientRect();
      canvas.style.outline=(x>=cr.left&&x<=cr.right&&y>=cr.top&&y<=cr.bottom)?'2px solid var(--accent)':'';
    }
  };

  const onUp = ev => {
    document.removeEventListener(isTouch?'touchmove':'mousemove', onMove);
    document.removeEventListener(isTouch?'touchend':'mouseup', onUp);
    ghost.remove();
    const canvas=document.getElementById('sm-canvas');
    if(canvas) canvas.style.outline='';

    const { x, y } = getXY(ev);
    const canvasRect=canvas?.getBoundingClientRect();
    if(!canvasRect||x<canvasRect.left||x>canvasRect.right||y<canvasRect.top||y>canvasRect.bottom) return;

    const img=document.getElementById('sm-img');
    if(!img) return;
    const imgRect=img.getBoundingClientRect();
    const xPct=Math.max(0,Math.min(100,((x-imgRect.left)/imgRect.width*100)));
    const yPct=Math.max(0,Math.min(100,((y-imgRect.top)/imgRect.height*100)));

    const pNow=getProject();
    if(!pNow.siteMap) pNow.siteMap={data:null,markers:[],cableLines:[]};
    if(!pNow.siteMap.markers) pNow.siteMap.markers=[];

    // If a marker for this rack already exists, move it
    const existing=pNow.siteMap.markers.find(m=>m.rackId===rackId);
    if(existing){
      existing.x=parseFloat(xPct.toFixed(2));
      existing.y=parseFloat(yPct.toFixed(2));
      logChange(`IDF marker moved: ${rack.name}`);
    } else {
      pNow.siteMap.markers.push({
        id:genId(),
        x:parseFloat(xPct.toFixed(2)),
        y:parseFloat(yPct.toFixed(2)),
        label:rack.name,
        type:'idf',
        color:'#00c8ff',
        size:1,
        rackId:rackId
      });
      logChange(`IDF marker placed: ${rack.name}`);
    }
    save(); renderSiteMap();
    toast(`IDF placed: ${rack.name}`,'success');
  };

  document.addEventListener(isTouch?'touchmove':'mousemove', onMove, {passive:false});
  document.addEventListener(isTouch?'touchend':'mouseup', onUp, {passive:false});
}

// ── Marker click ──

function smMarkerClick(id) {
  if(_smMarkerDrag?.moved) { _smMarkerDrag=null; return; }
  const p=getProject();
  const m=(p.siteMap?.markers||[]).find(x=>x.id===id);
  if(!m) return;
  const rack=m.rackId?p.racks.find(r=>r.id===m.rackId):null;

  if(m.type==='idf') {
    const rackLocation=rack?.location||'';
    // Find racks at this location
    const locationRacks=rackLocation
      ? (p.racks||[]).filter(r=>r.location===rackLocation)
      : rack ? [rack] : [];
    // Find matching photo folder
    const matchingFolder=(p.photoFolders||[]).find(f=>{
      if(!rackLocation) return f.name===m.label||f.name.includes(m.label);
      return f.location===rackLocation||f.name===rackLocation||f.name.includes(rackLocation);
    });

    openModal(`
      <h3 style="margin-bottom:4px">🗄 ${esc(m.label)}</h3>
      <div style="font-size:12px;color:var(--text2);margin-bottom:14px">
        IDF Closet${rack?' · Rack: '+esc(rack.name):''}${rackLocation?' · '+esc(rackLocation):''}
      </div>
      ${locationRacks.length>0?`
        <div style="font-size:10px;color:var(--text2);margin-bottom:6px;font-family:var(--mono);text-transform:uppercase;letter-spacing:.5px">Racks (${locationRacks.length})</div>
        <div style="max-height:150px;overflow-y:auto;margin-bottom:10px">
          ${locationRacks.map(r=>`
            <div style="padding:6px 10px;background:var(--card2);border:1px solid var(--border);border-radius:5px;margin-bottom:4px;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:6px"
              onclick="closeModal();sessionStorage.setItem('netrack_focus_rack','${r.id}');setView('racks')">
              <span style="color:var(--accent)">▸</span>
              <span style="flex:1">${esc(r.name)}</span>
              <span style="font-size:10px;color:var(--text3)">${r.uHeight||42}U</span>
            </div>
          `).join('')}
        </div>
      `:''}
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="closeModal()">Close</button>
        ${matchingFolder?`<button class="btn btn-ghost" onclick="closeModal();_currentPhotoFolderId='${matchingFolder.id}';setView('photos')">📷 Photos</button>`:''}
        ${rack?`<button class="btn btn-primary" onclick="closeModal();sessionStorage.setItem('netrack_focus_rack','${rack.id}');setView('racks')">View Rack →</button>`:''}
        ${_smEditMode?`<button class="btn btn-ghost" onclick="closeModal();openSmMarkerModal('${id}','${m.x}','${m.y}')">✎ Edit</button>`:''}
      </div>
    `);
  } else {
    openModal(`
      <h3 style="margin-bottom:8px">${esc(m.label)}</h3>
      <div style="font-size:12px;color:var(--text2);margin-bottom:12px">Type: ${esc(m.type||'')} ${rack?'· Rack: '+esc(rack.name):''} · Size: ${Math.round((m.size||1)*100)}%</div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="closeModal()">Close</button>
        ${rack?`<button class="btn btn-ghost" onclick="closeModal();sessionStorage.setItem('netrack_focus_rack','${rack.id}');setView('racks')">View Rack →</button>`:''}
        ${_smEditMode?`<button class="btn btn-primary" onclick="closeModal();openSmMarkerModal('${id}','${m.x}','${m.y}')">Edit</button>`:''}
      </div>`);
  }
}
