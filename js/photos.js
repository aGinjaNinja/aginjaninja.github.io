// ═══════════════════════════════════════════
//  PHOTOS
// ═══════════════════════════════════════════
let _photoEditIdx = -1;
let _photoDrag = null; // { slotIdx, offX, offY }
let _photoLayoutLocked = false;
let _photoResizeObs = null;
let _currentPhotoFolderId = 'all'; // 'all' or a folder id
const SLOT_COLORS = ['#4fc3f7','#81c784','#ffb74d','#f06292','#ce93d8','#80cbc4','#ffcc02','#ff8a65','#a5d6a7','#90caf9'];
let _viewerPhotoIndices = [];

// ═══════════════════════════════════════════
//  PHOTO VIEWER (lightbox)
// ═══════════════════════════════════════════
function openPhotoViewer(idx) {
  const p = getProject();
  const ph = p.photos[idx];
  if (!ph) return;

  // Use visible indices for prev/next; fall back to all photos
  const indices = _viewerPhotoIndices.length > 0 ? _viewerPhotoIndices : p.photos.map((_, i) => i);
  const pos = indices.indexOf(idx);
  const total = indices.length;
  const prevIdx = total > 1 ? indices[(pos - 1 + total) % total] : -1;
  const nextIdx = total > 1 ? indices[(pos + 1) % total] : -1;

  // Remove existing viewer
  let overlay = document.getElementById('photo-viewer-overlay');
  if (overlay) overlay.remove();

  overlay = document.createElement('div');
  overlay.id = 'photo-viewer-overlay';
  overlay.innerHTML = `
    <button class="pv-close" onclick="closePhotoViewer()" title="Close">✕</button>
    ${prevIdx >= 0 ? `<button class="pv-arrow pv-prev" onclick="event.stopPropagation();openPhotoViewer(${prevIdx})" title="Previous">‹</button>` : ''}
    ${nextIdx >= 0 ? `<button class="pv-arrow pv-next" onclick="event.stopPropagation();openPhotoViewer(${nextIdx})" title="Next">›</button>` : ''}
    <img class="pv-img" src="${ph.data}" onclick="event.stopPropagation()" style="${ph.rotation ? 'transform:rotate('+ph.rotation+'deg)' : ''}">
    <div class="pv-bottom">
      <div class="pv-caption">${esc(ph.caption || ph.name || 'Photo ' + (idx + 1))}</div>
      <div class="pv-counter">${pos + 1} / ${total}</div>
      <div class="pv-actions">
        <button class="btn btn-ghost btn-sm" onclick="closePhotoViewer();openPhotoEditor(${idx})" style="color:#fff;border-color:rgba(255,255,255,.3)">Edit</button>
      </div>
    </div>
  `;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closePhotoViewer(); });

  // Keyboard navigation
  overlay._keyHandler = (e) => {
    if (e.key === 'Escape') closePhotoViewer();
    else if (e.key === 'ArrowLeft' && prevIdx >= 0) openPhotoViewer(prevIdx);
    else if (e.key === 'ArrowRight' && nextIdx >= 0) openPhotoViewer(nextIdx);
  };
  document.addEventListener('keydown', overlay._keyHandler);

  document.body.appendChild(overlay);
}

function closePhotoViewer() {
  const overlay = document.getElementById('photo-viewer-overlay');
  if (!overlay) return;
  if (overlay._keyHandler) document.removeEventListener('keydown', overlay._keyHandler);
  overlay.remove();
}

function renderPhotos() {
  if (_photoResizeObs) { _photoResizeObs.disconnect(); _photoResizeObs = null; }
  const p = getProject();
  if (!p.photos) p.photos = [];
  if (!p.photoFolders) p.photoFolders = [];
  _photoEditIdx = -1;

  // Validate current folder still exists
  if (_currentPhotoFolderId !== 'all' && !p.photoFolders.find(f => f.id === _currentPhotoFolderId)) {
    _currentPhotoFolderId = 'all';
  }

  setTopbarActions(`
    <button class="btn btn-ghost btn-sm" onclick="createPhotoFolder()">📁 New Folder</button>
    <button class="btn btn-ghost btn-sm" onclick="document.getElementById('photo-upload').click()">📷 Add Photos</button>
    <button class="btn btn-primary btn-sm" onclick="document.getElementById('photo-capture').click()">📸 Take Photo</button>
  `);

  // Filter photos for current view
  const visiblePhotos = _currentPhotoFolderId === 'all'
    ? p.photos.map((ph, idx) => ({ ph, idx }))
    : p.photos.map((ph, idx) => ({ ph, idx })).filter(({ ph }) => ph.folderId === _currentPhotoFolderId);

  // Build folder sidebar
  const allCount = p.photos.length;
  const unfiledCount = p.photos.filter(ph => !ph.folderId).length;
  const folderItems = `
    <div class="photo-folder-item ${_currentPhotoFolderId === 'all' ? 'active' : ''}" onclick="setPhotoFolder('all')">
      <span>📷</span><span>All Photos</span><span class="photo-folder-count">${allCount}</span>
    </div>
    <div class="photo-folder-item ${_currentPhotoFolderId === '' ? 'active' : ''}" onclick="setPhotoFolder('')">
      <span>📄</span><span>Unfiled</span><span class="photo-folder-count">${unfiledCount}</span>
    </div>
    <div style="border-top:1px solid var(--border);margin:6px 0"></div>
    ${p.photoFolders.map(f => {
      const cnt = p.photos.filter(ph => ph.folderId === f.id).length;
      return `<div class="photo-folder-item ${_currentPhotoFolderId === f.id ? 'active' : ''}" onclick="setPhotoFolder('${f.id}')">
        <span>📁</span>
        <span style="flex:1;min-width:0;word-break:break-word">${esc(f.name)}</span>
        <span class="photo-folder-count">${cnt}</span>
        <span class="photo-folder-actions">
          <button class="photo-folder-btn" title="Rename" onclick="event.stopPropagation();renamePhotoFolder('${f.id}')">✎</button>
          <button class="photo-folder-btn" title="Delete folder" onclick="event.stopPropagation();deletePhotoFolder('${f.id}')">✕</button>
        </span>
      </div>`;
    }).join('')}
    <div style="margin-top:8px">
      <button class="btn btn-ghost btn-sm" style="width:100%;font-size:11px" onclick="createPhotoFolder()">+ New Folder</button>
    </div>`;

  // Build photo grid
  let gridContent;
  if (p.photos.length === 0) {
    gridContent = `
      <div class="empty-state">
        <div class="empty-icon">📷</div>
        <h3>No photos yet</h3>
        <p>Upload photos of your network closets, equipment, or cable runs.</p>
        <button class="btn btn-primary" style="margin-top:8px" onclick="document.getElementById('photo-upload').click()">
          Add First Photo
        </button>
      </div>`;
  } else if (visiblePhotos.length === 0) {
    const folderName = _currentPhotoFolderId === ''
      ? 'Unfiled'
      : p.photoFolders.find(f => f.id === _currentPhotoFolderId)?.name || 'this folder';
    gridContent = `
      <div class="empty-state">
        <div class="empty-icon">📁</div>
        <h3>No photos in ${esc(folderName)}</h3>
        <p>Upload photos or move existing photos into this folder.</p>
        <button class="btn btn-primary" style="margin-top:8px" onclick="document.getElementById('photo-upload').click()">
          Add Photos Here
        </button>
      </div>`;
  } else {
    _viewerPhotoIndices = visiblePhotos.map(({ idx }) => idx);
    const grid = visiblePhotos.map(({ ph, idx }) => {
      const assigned = (ph.assignments||[]).filter(a=>a&&a.itemId).length;
      const folderObj = ph.folderId ? p.photoFolders.find(f => f.id === ph.folderId) : null;
      const folderBadge = folderObj && _currentPhotoFolderId === 'all'
        ? `<div class="photo-folder-badge">📁 ${esc(folderObj.name)}</div>` : '';
      return `
      <div class="photo-card" onclick="openPhotoViewer(${idx})">
        <div class="photo-thumb" style="background-image:url('${ph.data}')${ph.rotation ? ';transform:rotate('+ph.rotation+'deg)' : ''}"></div>
        <div class="photo-meta">
          <div class="photo-title">${esc(ph.caption || ph.name || 'Photo ' + (idx+1))}</div>
          <div class="photo-date">${ph.ts ? new Date(ph.ts).toLocaleDateString() : (ph.date ? new Date(ph.date).toLocaleDateString() : '')}${assigned?` · <span style="color:var(--accent)">${assigned} tagged</span>`:''}</div>
        </div>
        ${folderBadge}
        ${p.photoFolders.length > 0 ? `<button style="position:absolute;top:6px;left:6px;background:rgba(0,0,0,.65);border:1px solid var(--border2);border-radius:4px;color:var(--text2);cursor:pointer;width:22px;height:22px;font-size:11px;display:none;align-items:center;justify-content:center;" class="photo-move-btn" title="Move to folder" onclick="event.stopPropagation();movePhotoToFolder(${idx})">📁</button>` : ''}
        <button class="photo-del" title="Delete" onclick="event.stopPropagation();deletePhoto(${idx})">✕</button>
      </div>`;
    }).join('');
    gridContent = `<div class="photo-grid">${grid}</div>`;
  }

  document.getElementById('view-area').innerHTML = `
    <div class="photo-view-wrap">
      <div class="photo-folder-sidebar" id="photo-folder-sidebar">${folderItems}</div>
      <div class="photo-folder-resize" id="photo-folder-resize"></div>
      <div class="photo-grid-area">${gridContent}</div>
    </div>`;

  // Draggable resize handle for folder sidebar
  const resizeHandle = document.getElementById('photo-folder-resize');
  const sidebar = document.getElementById('photo-folder-sidebar');
  if (resizeHandle && sidebar) {
    let dragging = false, startX = 0, startW = 0;
    resizeHandle.addEventListener('pointerdown', e => {
      dragging = true; startX = e.clientX; startW = sidebar.offsetWidth;
      resizeHandle.setPointerCapture(e.pointerId);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });
    resizeHandle.addEventListener('pointermove', e => {
      if (!dragging) return;
      const w = Math.max(120, Math.min(500, startW + (e.clientX - startX)));
      sidebar.style.width = w + 'px';
    });
    const stopDrag = () => { dragging = false; document.body.style.cursor = ''; document.body.style.userSelect = ''; };
    resizeHandle.addEventListener('pointerup', stopDrag);
    resizeHandle.addEventListener('pointercancel', stopDrag);
  }
}

function setPhotoFolder(folderId) {
  _currentPhotoFolderId = folderId;
  renderPhotos();
}

function _getPhotoFolderLocations() {
  const p = getProject();
  const locs = new Map();
  // Locations from the location hierarchy
  (p.locations || []).forEach(l => locs.set(l.name, l.name));
  // Unique rack locations
  (p.racks || []).forEach(r => { if (r.location) locs.set(r.location, r.location); });
  return Array.from(locs.values()).sort((a, b) => a.localeCompare(b));
}

function createPhotoFolder() {
  const locations = _getPhotoFolderLocations();
  const locOptions = locations.map(l => `<option value="${esc(l)}">${esc(l)}</option>`).join('');
  openModal(`
    <h3>📁 New Photo Folder</h3>
    <div class="form-row">
      <label>Location</label>
      <select class="form-control" id="pf-location">
        <option value="">— None —</option>
        ${locOptions}
      </select>
    </div>
    <div class="form-row">
      <label>Folder Name *</label>
      <input class="form-control" id="pf-name" placeholder="e.g. Cable Tray, Before Photos, Patch Panel" autofocus>
    </div>
    <div style="margin:8px 0 4px;padding:8px 10px;background:var(--card2);border:1px solid var(--border);border-radius:5px;font-size:12px;color:var(--text2)">
      Preview: <span id="pf-preview" style="color:var(--text);font-weight:600">—</span>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="savePhotoFolder()">Create Folder</button>
    </div>
  `);
  const updatePreview = () => {
    const loc = document.getElementById('pf-location')?.value || '';
    const name = document.getElementById('pf-name')?.value?.trim() || '';
    const el = document.getElementById('pf-preview');
    if (el) el.textContent = loc && name ? loc + ' - ' + name : name || loc || '—';
  };
  setTimeout(() => {
    document.getElementById('pf-name')?.focus();
    document.getElementById('pf-location')?.addEventListener('change', updatePreview);
    document.getElementById('pf-name')?.addEventListener('input', updatePreview);
  }, 50);
}

function savePhotoFolder() {
  const location = document.getElementById('pf-location')?.value || '';
  const name = document.getElementById('pf-name')?.value?.trim();
  if (!name) return toast('Enter a folder name', 'error');
  const displayName = location ? location + ' - ' + name : name;
  const p = getProject();
  if (!p.photoFolders) p.photoFolders = [];
  const folder = { id: genId(), name: displayName, location, folderName: name };
  p.photoFolders.push(folder);
  logChange(`Photo folder created: "${displayName}"`);
  save();
  closeModal();
  _currentPhotoFolderId = folder.id;
  renderPhotos();
  toast(`Folder "${displayName}" created`, 'success');
}

function renamePhotoFolder(id) {
  const p = getProject();
  const folder = p.photoFolders?.find(f => f.id === id);
  if (!folder) return;
  const locations = _getPhotoFolderLocations();
  const curLoc = folder.location || '';
  const curName = folder.folderName || folder.name || '';
  const locOptions = locations.map(l => `<option value="${esc(l)}" ${l === curLoc ? 'selected' : ''}>${esc(l)}</option>`).join('');
  openModal(`
    <h3>Rename Folder</h3>
    <div class="form-row">
      <label>Location</label>
      <select class="form-control" id="pfr-location">
        <option value="" ${!curLoc ? 'selected' : ''}>— None —</option>
        ${locOptions}
      </select>
    </div>
    <div class="form-row">
      <label>Folder Name *</label>
      <input class="form-control" id="pfr-name" value="${esc(curName)}" autofocus>
    </div>
    <div style="margin:8px 0 4px;padding:8px 10px;background:var(--card2);border:1px solid var(--border);border-radius:5px;font-size:12px;color:var(--text2)">
      Preview: <span id="pfr-preview" style="color:var(--text);font-weight:600">—</span>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveRenameFolder('${id}')">Save</button>
    </div>
  `);
  const updatePreview = () => {
    const loc = document.getElementById('pfr-location')?.value || '';
    const name = document.getElementById('pfr-name')?.value?.trim() || '';
    const el = document.getElementById('pfr-preview');
    if (el) el.textContent = loc && name ? loc + ' - ' + name : name || loc || '—';
  };
  setTimeout(() => {
    document.getElementById('pfr-name')?.focus();
    document.getElementById('pfr-location')?.addEventListener('change', updatePreview);
    document.getElementById('pfr-name')?.addEventListener('input', updatePreview);
    updatePreview();
  }, 50);
}

function saveRenameFolder(id) {
  const location = document.getElementById('pfr-location')?.value || '';
  const name = document.getElementById('pfr-name')?.value?.trim();
  if (!name) return toast('Enter a folder name', 'error');
  const displayName = location ? location + ' - ' + name : name;
  const p = getProject();
  const folder = p.photoFolders?.find(f => f.id === id);
  if (!folder) return;
  const old = folder.name;
  folder.name = displayName;
  folder.location = location;
  folder.folderName = name;
  logChange(`Photo folder renamed: "${old}" → "${displayName}"`);
  save();
  closeModal();
  renderPhotos();
  toast('Folder renamed', 'success');
}

function deletePhotoFolder(id) {
  const p = getProject();
  const folder = p.photoFolders?.find(f => f.id === id);
  if (!folder) return;
  const photoCount = p.photos.filter(ph => ph.folderId === id).length;
  const msg = photoCount > 0
    ? `Delete folder "${folder.name}"? ${photoCount} photo${photoCount>1?'s':''} will be moved to Unfiled.`
    : `Delete folder "${folder.name}"?`;
  if (!confirm(msg)) return;
  // Move photos to unfiled
  p.photos.forEach(ph => { if (ph.folderId === id) ph.folderId = ''; });
  p.photoFolders = p.photoFolders.filter(f => f.id !== id);
  logChange(`Photo folder deleted: "${folder.name}"`);
  save();
  if (_currentPhotoFolderId === id) _currentPhotoFolderId = 'all';
  renderPhotos();
  toast('Folder deleted', 'success');
}

function movePhotoToFolder(idx) {
  const p = getProject();
  if (!p.photoFolders) p.photoFolders = [];
  const ph = p.photos[idx];
  if (!ph) return;
  const folderOpts = `
    <option value="">— Unfiled —</option>
    ${p.photoFolders.map(f => `<option value="${f.id}" ${ph.folderId === f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}
  `;
  openModal(`
    <h3>Move Photo to Folder</h3>
    <div style="font-size:12px;color:var(--text2);margin-bottom:12px">${esc(ph.caption || ph.name || `Photo ${idx+1}`)}</div>
    <div class="form-row">
      <label>Folder</label>
      <select class="form-control" id="pmf-folder">${folderOpts}</select>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveMovePhoto(${idx})">Move</button>
    </div>
  `);
}

function saveMovePhoto(idx) {
  const p = getProject();
  const ph = p.photos[idx];
  if (!ph) return;
  const newFolder = document.getElementById('pmf-folder')?.value || '';
  const oldFolderObj = ph.folderId ? p.photoFolders?.find(f => f.id === ph.folderId) : null;
  const newFolderObj = newFolder ? p.photoFolders?.find(f => f.id === newFolder) : null;
  ph.folderId = newFolder;
  logChange(`Photo moved: "${ph.caption || ph.name}" → ${newFolderObj ? '"' + newFolderObj.name + '"' : 'Unfiled'}`);
  save();
  closeModal();
  renderPhotos();
  toast(`Photo moved to ${newFolderObj ? '"' + newFolderObj.name + '"' : 'Unfiled'}`, 'success');
}

function uploadPhotos(e) {
  const p = getProject();
  if (!p.photos) p.photos = [];
  const files = Array.from(e.target.files);
  if (!files.length) return;
  const input = e.target;
  let done = 0;
  let added = 0;
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const folderId = (_currentPhotoFolderId !== 'all') ? _currentPhotoFolderId : '';
        p.photos.push({ id: genId(), name: file.name, caption: '', data: ev.target.result, ts: new Date().toISOString(), date: Date.now(), size: file.size, assignments: [], folderId: folderId || '' });
        logChange(`Photo added: "${file.name}" (${(file.size/1024).toFixed(0)} KB)`);
        added++;
      } catch(err) { console.error('Photo add error:', err); }
      done++;
      if (done === files.length) {
        if (added > 0) { save(); renderPhotos(); toast(`Added ${added} photo${added>1?'s':''}`, 'success'); }
        else { toast('Could not add photos', 'error'); }
        try { input.value = ''; } catch(e) {}
      }
    };
    reader.onerror = () => {
      console.error('FileReader error for', file.name);
      done++;
      if (done === files.length) {
        if (added > 0) { save(); renderPhotos(); toast(`Added ${added} photo${added>1?'s':''} (some failed)`, 'warning'); }
        else { toast('Could not read photos', 'error'); }
        try { input.value = ''; } catch(e) {}
      }
    };
    reader.readAsDataURL(file);
  });
}

function deletePhoto(idx) {
  const p = getProject();
  if (!p.photos) return;
  if (!confirm('Delete this photo?')) return;
  const ph = p.photos[idx];
  const name = ph?.caption || ph?.name || `Photo ${idx+1}`;
  p.photos.splice(idx, 1);
  logChange(`Photo deleted: "${name}"`);
  save(); renderPhotos(); toast('Photo deleted', 'success');
}

// Build organized <option> list for item picker
function buildPhotoItemOptions(p) {
  let opts = `<option value="">— None —</option>`;
  opts += `<option value="__new_device__">➕  Create new device…</option>`;
  opts += `<option value="__note__">📝  Add note tag (photo-only)…</option>`;
  // Racks
  const racks = p.racks || [];
  opts += `<option disabled>────── RACKS ──────</option>`;
  racks.forEach(r => { opts += `<option value="rack:${r.id}">${esc(r.name)}</option>`; });
  opts += `<option value="__new_rack__">➕  Add new rack…</option>`;
  // Patch Panels
  const panels = p.devices.filter(d => d.deviceType === 'Patch Panel');
  if (panels.length) {
    opts += `<option disabled>────── PATCH PANELS ──────</option>`;
    panels.forEach(d => {
      const meta = [d.model].filter(Boolean).join(' · ');
      opts += `<option value="dev:${d.id}">${esc(d.name)}${meta?' · '+esc(meta):''}</option>`;
    });
  }
  // Devices grouped by type
  const devsByType = {};
  p.devices.filter(d => d.deviceType !== 'Patch Panel').forEach(d => {
    const t = d.deviceType || 'Misc.';
    if (!devsByType[t]) devsByType[t] = [];
    devsByType[t].push(d);
  });
  const typeOrder = ['Switch','Router','Firewall','Modem','Server','NAS','AP','PC/Workstation','IP Phone','IP Camera','Access Control','APC/UPS','Misc Rack-Mounted','IoT Device','Printer','Fax Machine','Smartphone/Tablet','Misc.'];
  const sorted = [...typeOrder.filter(t => devsByType[t]), ...Object.keys(devsByType).filter(t => !typeOrder.includes(t))];
  if (sorted.length) {
    opts += `<option disabled>────── DEVICES ──────</option>`;
    sorted.forEach(type => {
      opts += `<option disabled>  · ${type}</option>`;
      devsByType[type].forEach(d => {
        const meta = [d.ip, d.mac].filter(Boolean).join('  ');
        opts += `<option value="dev:${d.id}">    ${esc(d.name)}${meta?'  —  '+esc(meta):''}</option>`;
      });
    });
  }
  return opts;
}

// Resolve an assignment item to { label, color, notes }
function resolvePhotoItem(itemRef, p) {
  if (!itemRef) return null;
  const colonIdx = itemRef.indexOf(':');
  const kind = itemRef.slice(0, colonIdx);
  const id = itemRef.slice(colonIdx + 1);
  if (kind === 'note') {
    return { label: id, color: '#ffd54f', notes: '' };
  }
  if (kind === 'rack') {
    const r = (p.racks||[]).find(x => x.id === id);
    if (!r) return null;
    return { label: r.name, color: '#888', notes: r.notes || '' };
  }
  const d = p.devices.find(x => x.id === id);
  if (!d) return null;
  return { label: d.name, color: dtColor(d.deviceType||'Misc.'), notes: d.notes || '' };
}

function openPhotoEditor(idx, preservePanZoom) {
  const isNewPhoto = (idx !== _photoEditIdx);
  _photoEditIdx = idx;
  if (!preservePanZoom) { _photoPan = { x: 0, y: 0 }; _photoZoom = 1; }
  const p = getProject();
  const ph = p.photos[idx];
  if (!ph) return;
  if (!ph.assignments || ph.assignments.length === 0) ph.assignments = [{ color: SLOT_COLORS[0] }];
  // Only auto-lock when the user navigates to a photo, not on re-renders (saves, drops, etc.)
  if (isNewPhoto && ph.assignments.some(a => a?.itemId && a.x != null)) _photoLayoutLocked = true;

  const total = p.photos.length;

  const slots = ph.assignments.map((a, si) => {
    const c = a?.color || SLOT_COLORS[si % SLOT_COLORS.length];
    const val = a?.itemId || '';
    const hasPos = a?.x != null;
    const res = val ? resolvePhotoItem(val, p) : null;
    return `
    <div class="photo-assign-slot" id="slot-card-${si}">
      <div class="photo-assign-slot-header">
        <div style="position:relative;display:inline-flex;cursor:${_photoLayoutLocked?'default':'pointer'}" title="${_photoLayoutLocked?'Unlock to change color':'Click to change color'}">
          <div class="photo-assign-dot" style="background:${c};box-shadow:0 0 5px ${c}88"></div>
          <input type="color" value="${c}" ${_photoLayoutLocked?'disabled':''} style="position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:inherit;border:0;padding:0" onchange="setTagColor(${si},this.value)">
        </div>
        <span style="color:${c};font-weight:600">Tag ${si+1}</span>
        ${!_photoLayoutLocked && val && hasPos
          ? `<button style="margin-left:auto;background:none;border:none;cursor:pointer;font-size:9px;color:var(--red);padding:0 2px" title="Remove from photo" onclick="removePhotoMarker(${si})">✕ remove pin</button>`
          : !_photoLayoutLocked && val
            ? `<span id="slot-hint-${si}" style="margin-left:auto;font-size:9px;color:var(--accent);cursor:grab" onmousedown="startSidebarDrag(event,${si})" ontouchstart="startSidebarDrag(event,${si})" title="Drag or tap to place">⊕ drag to place</span>`
            : !_photoLayoutLocked
              ? `<span style="margin-left:auto;font-size:9px;color:var(--text3)">select below</span>`
              : `<span style="margin-left:auto;font-size:9px;color:var(--text3);opacity:0.5">🔒 locked</span>`
        }
        ${!_photoLayoutLocked ? `<button onclick="removePhotoTag(${si})" style="margin-left:4px;background:none;border:none;cursor:pointer;font-size:11px;color:var(--text3);padding:0 3px;line-height:1;opacity:0.6" onmouseover="this.style.opacity='1';this.style.color='var(--red)'" onmouseout="this.style.opacity='0.6';this.style.color='var(--text3)'" title="Remove this tag slot">🗑</button>` : ''}
      </div>
      <select class="form-control" id="slot-sel-${si}" style="font-size:11px;padding:5px 8px${_photoLayoutLocked?';opacity:0.5;pointer-events:none':''}" ${_photoLayoutLocked?'disabled':''} onchange="onPhotoSlotChange(${si},this.value)">
        ${buildPhotoItemOptions(p)}
      </select>
      <div style="display:flex;align-items:center;gap:5px;margin-top:5px">
        <span style="font-size:9px;color:var(--text3);font-family:var(--mono);flex-shrink:0">Size</span>
        <input type="range" min="0.5" max="2.5" step="0.1" value="${a?.size||1}" ${_photoLayoutLocked?'disabled':''} oninput="setTagSize(${si},this.value)" style="flex:1;accent-color:${c};cursor:${_photoLayoutLocked?'not-allowed':'pointer'}">
        <span id="size-label-${si}" style="font-size:9px;color:var(--text3);font-family:var(--mono);min-width:28px;text-align:right">${Math.round((a?.size||1)*100)}%</span>
      </div>
    </div>`;
  }).join('');

  setTopbarActions(`
    <button class="btn btn-ghost btn-sm" onclick="renderPhotos()">← Back to Photos</button>
    <span style="color:var(--text3);font-size:12px">${idx+1} / ${total}</span>
    ${total>1?`<button class="btn btn-ghost btn-sm" onclick="openPhotoEditor(${(idx-1+total)%total})">← Prev</button>`:''}
    ${total>1?`<button class="btn btn-ghost btn-sm" onclick="openPhotoEditor(${(idx+1)%total})">Next →</button>`:''}
    <button id="photo-lock-btn" class="btn btn-sm ${_photoLayoutLocked ? 'btn-primary' : 'btn-ghost'}" onclick="togglePhotoLock()" title="${_photoLayoutLocked ? 'Unlock layout to move device tags' : 'Lock layout to prevent accidental moves'}" style="${_photoLayoutLocked ? 'border-color:var(--amber);background:rgba(255,170,0,.15);color:var(--amber)' : ''}">
      ${_photoLayoutLocked ? '🔒 Layout Locked' : '🔓 Lock Layout'}
    </button>
    <button class="btn btn-ghost btn-sm" onclick="rotatePhoto(${idx})" title="Rotate 90° clockwise">↻ Rotate</button>
    <label class="btn btn-ghost btn-sm" style="cursor:pointer" title="Replace photo">
      🔄 Replace
      <input type="file" accept="image/*" style="display:none" onchange="replacePhoto(event,${idx})">
    </label>
    <button class="btn btn-ghost btn-sm" onclick="movePhotoToFolder(${idx})" title="Move to folder">📁 Move</button>
    <button class="btn btn-danger btn-sm" onclick="deletePhoto(${idx});renderPhotos()">Delete</button>
    <button class="btn btn-primary btn-sm" onclick="savePhotoEditor(${idx})">Save</button>
  `);

  document.getElementById('view-area').innerHTML = `
    <div class="photo-editor-wrap">
      <div class="photo-editor-canvas" id="photo-canvas-wrap"
           onmousemove="onPhotoMarkerMove(event)"
           onmouseup="onPhotoMarkerUp(event)"
           onmouseleave="onPhotoCanvasLeave(event)"
           onwheel="onPhotoMouseWheel(event)"
           ontouchstart="onPhotoCanvasTouchStart(event)"
           ontouchmove="onPhotoCanvasTouchMove(event)"
           ontouchend="onPhotoCanvasTouchEnd(event)">
        <div id="photo-pan-layer">
          <img id="photo-editor-img" src="${ph.data}" ondragstart="return false" style="${ph.rotation ? 'transform:rotate('+ph.rotation+'deg)' : ''}">
          <div id="photo-markers-layer"></div>
        </div>
      </div>
      <div class="photo-editor-sidebar">
        <div>
          <label style="font-size:10px;color:var(--text2);font-family:var(--mono);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:4px">Caption</label>
          <input class="form-control" id="photo-editor-caption" value="${esc(ph.caption||ph.name||'')}" placeholder="e.g. IDF Cabinet 1A" style="font-size:12px">
          <div style="font-size:10px;color:var(--text3);margin-top:4px;font-family:var(--mono)">${ph.date?new Date(ph.date).toLocaleString():''}${ph.size?' · '+(ph.size/1024).toFixed(0)+' KB':''}</div>
        </div>
        <div style="font-size:10px;color:var(--text2);font-family:var(--mono);text-transform:uppercase;letter-spacing:.5px;margin-top:4px">
          Device Tags
          <span style="color:var(--text3);text-transform:none;letter-spacing:0;font-size:9px"> — drag ⊕ onto photo to pin</span>
        </div>
        ${slots}
        ${!_photoLayoutLocked ? `<button onclick="addPhotoTag()" style="width:100%;margin-top:6px;background:rgba(0,200,122,.08);border:1px dashed rgba(0,200,122,.3);border-radius:6px;color:var(--accent);cursor:pointer;font-size:11px;font-family:var(--mono);padding:5px 8px;transition:all .15s" onmouseover="this.style.background='rgba(0,200,122,.15)'" onmouseout="this.style.background='rgba(0,200,122,.08)'">+ Add Tag</button>` : ''}
        <div>
          <div style="font-size:10px;color:var(--text2);font-family:var(--mono);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Device Notes</div>
          <div class="photo-notes-box" id="photo-notes-box"></div>
        </div>
      </div>
    </div>`;

  if (preservePanZoom) applyPhotoTransform();
  const img = document.getElementById('photo-editor-img');
  // Use rAF so markers are rendered after layout stabilizes (important on mobile when sidebar toggles)
  const draw = () => requestAnimationFrame(() => renderPhotoOverlays(idx));
  if (img.complete && img.naturalWidth) draw(); else img.onload = draw;

  // Re-render markers whenever the canvas resizes (e.g. mobile nav sidebar opens/closes)
  if (_photoResizeObs) _photoResizeObs.disconnect();
  const canvasWrap = document.getElementById('photo-canvas-wrap');
  if (canvasWrap) {
    _photoResizeObs = new ResizeObserver(() => syncMarkersLayer());
    _photoResizeObs.observe(canvasWrap);
  }

  ph.assignments.forEach((a, si) => {
    const sel = document.getElementById(`slot-sel-${si}`);
    if (sel && a?.itemId) sel.value = a.itemId;
  });
  refreshPhotoNotesBox(p, ph);
}

function getImgRect() {
  const img = document.getElementById('photo-editor-img');
  const wrap = document.getElementById('photo-canvas-wrap');
  if (!img || !wrap) return null;
  const wr = wrap.getBoundingClientRect();
  const ir = img.getBoundingClientRect();
  return { left: ir.left - wr.left, top: ir.top - wr.top, width: ir.width, height: ir.height };
}

function syncMarkersLayer() {
  const img = document.getElementById('photo-editor-img');
  const ml = document.getElementById('photo-markers-layer');
  if (!img || !ml) return;
  ml.style.left   = img.offsetLeft + 'px';
  ml.style.top    = img.offsetTop  + 'px';
  ml.style.width  = img.offsetWidth + 'px';
  ml.style.height = img.offsetHeight + 'px';
}

function renderPhotoOverlays(idx) {
  if (idx == null) idx = _photoEditIdx;
  const p = getProject();
  const ph = p.photos[idx];
  if (!ph) return;
  const ml = document.getElementById('photo-markers-layer');
  const img = document.getElementById('photo-editor-img');
  if (!ml || !img) return;
  syncMarkersLayer();
  ml.querySelectorAll('.photo-overlay-marker').forEach(el => el.remove());
  if (!img.offsetWidth || !img.offsetHeight) return;

  ph.assignments.forEach((a, si) => {
    if (!a?.itemId || a.x == null) return;
    const res = resolvePhotoItem(a.itemId, p);
    if (!res) return;
    const c = a.color || SLOT_COLORS[si % SLOT_COLORS.length];
    const el = document.createElement('div');
    el.className = 'photo-overlay-marker';
    el.dataset.slotIdx = si;
    // Percentage positioning — markers are stickers on the image, they scale with it
    el.style.left = (a.x * 100) + '%';
    el.style.top  = (a.y * 100) + '%';
    const size = a.size || 1.0;
    // Anchor at bottom-center (the dot) so the pin point stays fixed
    el.style.transform = `translate(-50%, -100%) scale(${size})`;
    if (_photoLayoutLocked) {
      el.style.cursor = 'default';
      el.style.opacity = '0.75';
    }
    el.innerHTML = `
      <div class="photo-overlay-box" style="color:${c};border-color:${c};background:rgba(0,0,0,0.65)">${esc(res.label)}</div>
      <div class="photo-overlay-dot" style="background:${c}"></div>`;
    el.addEventListener('mousedown', e => {
      e.preventDefault(); e.stopPropagation();
      if (_photoLayoutLocked) {
        const startX = e.clientX, startY = e.clientY;
        const lp = setTimeout(() => {
          if (Math.abs(e.clientX - startX) < 6 && Math.abs(e.clientY - startY) < 6) _photoTagLongPress(a.itemId);
        }, 900);
        document.addEventListener('mouseup', () => clearTimeout(lp), { once: true });
        document.addEventListener('mousemove', () => clearTimeout(lp), { once: true });
        return;
      }
      const rect = el.getBoundingClientRect();
      _photoDrag = { slotIdx: si, offX: e.clientX - rect.left - rect.width/2, offY: e.clientY - rect.top - rect.height/2 };
    });
    el.addEventListener('touchstart', e => {
      e.preventDefault(); e.stopPropagation();
      const t = e.touches[0];
      if (_photoLayoutLocked) {
        const startX = t.clientX, startY = t.clientY;
        const lp = setTimeout(() => {
          const cur = el._lastTouch || t;
          if (Math.abs(cur.clientX - startX) < 10 && Math.abs(cur.clientY - startY) < 10) _photoTagLongPress(a.itemId);
        }, 900);
        el.addEventListener('touchmove', mv => { el._lastTouch = mv.touches[0]; clearTimeout(lp); }, { once: true });
        el.addEventListener('touchend', () => clearTimeout(lp), { once: true });
        return;
      }
      const rect = el.getBoundingClientRect();
      _photoDrag = { slotIdx: si, offX: t.clientX - rect.left - rect.width/2, offY: t.clientY - rect.top - rect.height/2 };
    }, { passive: false });
    ml.appendChild(el);
  });
}

function _photoTagLongPress(itemId) {
  if (!itemId) return;
  const colonIdx = itemId.indexOf(':');
  const kind = itemId.slice(0, colonIdx);
  const id   = itemId.slice(colonIdx + 1);
  if (kind === 'note') return;
  if (kind === 'rack') {
    sessionStorage.setItem('netrack_focus_rack', id);
    setView('racks');
    return;
  }
  if (kind === 'dev') {
    const p = getProject();
    const dev = p.devices.find(d => d.id === id);
    if (!dev) return;
    if ((dev.ports || 0) > 0 || dev.deviceType === 'Patch Panel') {
      state.selectedSwitch = dev.id;
      setView('ports');
    } else {
      sessionStorage.setItem('netrack_edit_device', dev.id);
      setView('devices');
    }
  }
}

function onPhotoMarkerMove(e) {
  if (!_photoDrag) return;
  const ml = document.getElementById('photo-markers-layer');
  if (!ml) return;
  const r = ml.getBoundingClientRect();
  if (!r.width || !r.height) return;
  // Convert viewport coords to percentage within the markers layer (works at any zoom)
  const pctX = ((e.clientX - _photoDrag.offX) - r.left) / r.width * 100;
  const pctY = ((e.clientY - _photoDrag.offY) - r.top)  / r.height * 100;
  const marker = ml.querySelector(`.photo-overlay-marker[data-slot-idx="${_photoDrag.slotIdx}"]`);
  if (marker) { marker.style.left = pctX + '%'; marker.style.top = pctY + '%'; }
}

function onPhotoCanvasLeave(e) {
  if (_photoDrag) onPhotoMarkerUp(e);
}

function onPhotoMarkerUp(e) {
  if (!_photoDrag) return;
  const slotIdx = _photoDrag.slotIdx;
  const offX = _photoDrag.offX, offY = _photoDrag.offY;
  _photoDrag = null;
  const ml = document.getElementById('photo-markers-layer');
  if (!ml) return;
  const r = ml.getBoundingClientRect();
  if (!r.width || !r.height) return;
  let x = ((e.clientX - offX) - r.left) / r.width;
  let y = ((e.clientY - offY) - r.top)  / r.height;
  x = Math.max(0, Math.min(1, x));
  y = Math.max(0, Math.min(1, y));
  const p = getProject();
  const ph = p.photos[_photoEditIdx];
  if (ph?.assignments?.[slotIdx]) {
    ph.assignments[slotIdx].x = x;
    ph.assignments[slotIdx].y = y;
    const res = resolvePhotoItem(ph.assignments[slotIdx].itemId, p);
    const photoName = ph.caption || ph.name || `Photo ${_photoEditIdx+1}`;
    logChange(`Photo pin moved: "${res?.label || 'tag'}" repositioned on "${photoName}"`);
    save();
  }
  renderPhotoOverlays(_photoEditIdx);
}

function openQuickRackModal(slotIdx) {
  const existing = document.getElementById('quick-rack-modal');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'quick-rack-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:16px';
  modal.innerHTML = `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px;width:100%;max-width:320px;box-shadow:0 8px 32px rgba(0,0,0,0.4)">
      <div style="font-size:15px;font-weight:700;margin-bottom:14px;color:var(--text1)">Add Rack to Project</div>
      <div class="form-row"><label>Rack Name <span style="color:var(--accent)">*</span></label>
        <input class="form-control" id="qrm-name" placeholder="e.g. IDF Rack A" autofocus></div>
      <div class="form-row"><label>Location</label>
        <input class="form-control" id="qrm-location" placeholder="e.g. Server Room"></div>
      <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">
        <button class="btn btn-secondary" onclick="document.getElementById('quick-rack-modal').remove()">Cancel</button>
        <button class="btn btn-primary" onclick="submitQuickRack(${slotIdx})">Add &amp; Tag</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  setTimeout(() => { const n = document.getElementById('qrm-name'); if (n) n.focus(); }, 50);
}

function submitQuickRack(slotIdx) {
  const name = (document.getElementById('qrm-name')?.value || '').trim();
  if (!name) { alert('Rack name is required.'); return; }
  const location = (document.getElementById('qrm-location')?.value || '').trim();
  const p = getProject();
  if (!p.racks) p.racks = [];
  const newRack = { id: genId(), name, location, notes: '', uHeight: 42 };
  p.racks.push(newRack);
  if (!p.photos[_photoEditIdx].assignments) p.photos[_photoEditIdx].assignments = [];
  p.photos[_photoEditIdx].assignments[slotIdx] = Object.assign({}, p.photos[_photoEditIdx].assignments[slotIdx] || {}, { itemId: `rack:${newRack.id}`, x: null, y: null });
  logChange(`Quick-added rack "${name}" and tagged on photo`);
  save();
  document.getElementById('quick-rack-modal')?.remove();
  openPhotoEditor(_photoEditIdx);
}

function openQuickDeviceModal(slotIdx) {
  // Remove any existing modal
  const existing = document.getElementById('quick-device-modal');
  if (existing) existing.remove();
  const TYPES = ['Switch','Router','Firewall','Modem','Server','NAS','AP','PC/Workstation','IP Phone','IP Camera','Access Control','APC/UPS','Misc Rack-Mounted','IoT Device','Printer','Fax Machine','Smartphone/Tablet','Misc.'];
  const typeOpts = TYPES.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
  const modal = document.createElement('div');
  modal.id = 'quick-device-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:16px';
  modal.innerHTML = `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px;width:100%;max-width:340px;box-shadow:0 8px 32px rgba(0,0,0,0.4)">
      <div style="font-size:15px;font-weight:700;margin-bottom:14px;color:var(--text1)">Add Device to Project</div>
      <div class="form-row"><label>Name <span style="color:var(--accent)">*</span></label>
        <input class="form-control" id="qdm-name" placeholder="Device name" autofocus></div>
      <div class="form-row"><label>Type</label>
        <select class="form-control" id="qdm-type">${typeOpts}</select></div>
      <div class="form-row"><label>IP Address</label>
        <input class="form-control" id="qdm-ip" placeholder="192.168.1.x"></div>
      <div class="form-row"><label>MAC Address</label>
        <input class="form-control" id="qdm-mac" placeholder="AA:BB:CC:DD:EE:FF"></div>
      <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">
        <button class="btn btn-secondary" onclick="document.getElementById('quick-device-modal').remove()">Cancel</button>
        <button class="btn btn-primary" onclick="submitQuickDevice(${slotIdx})">Add &amp; Tag</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  setTimeout(() => { const n = document.getElementById('qdm-name'); if (n) n.focus(); }, 50);
}

function submitQuickDevice(slotIdx) {
  const name = (document.getElementById('qdm-name')?.value || '').trim();
  if (!name) { alert('Device name is required.'); return; }
  const type = document.getElementById('qdm-type')?.value || 'Misc.';
  const ip  = (document.getElementById('qdm-ip')?.value || '').trim();
  const mac = (document.getElementById('qdm-mac')?.value || '').trim();
  const p = getProject();
  const newDev = {
    id: genId(), name, deviceType: type,
    type: type === 'Switch' ? 'switching' : 'non-switching',
    ip: ip||'', mac: mac||'', manufacturer: '', model: '', notes: '',
    ports: 0, deviceUHeight: 1, rackId: null, rackU: null,
    portAssignments: {}, portNotes: {}, portVlans: {}, portPeerPort: {}, portPoe: {}, portLabels: {},
    webUser: '', webPassword: '', webProtocol: 'https', parentDeviceId: '',
    addedDate: new Date().toISOString()
  };
  if (!p.devices) p.devices = [];
  p.devices.push(newDev);
  if (!p.photos[_photoEditIdx].assignments) p.photos[_photoEditIdx].assignments = [null,null,null,null];
  p.photos[_photoEditIdx].assignments[slotIdx] = Object.assign({}, p.photos[_photoEditIdx].assignments[slotIdx] || {}, { itemId: `dev:${newDev.id}`, x: null, y: null });
  logChange(`Quick-added device "${name}" and tagged on photo`);
  save();
  document.getElementById('quick-device-modal')?.remove();
  openPhotoEditor(_photoEditIdx);
}

function openNoteTagPrompt(slotIdx) {
  const existing = document.getElementById('note-tag-modal');
  if (existing) existing.remove();
  const p = getProject();
  const ph = p.photos[_photoEditIdx];
  const currentNote = (ph?.assignments?.[slotIdx]?.itemId || '').startsWith('note:')
    ? ph.assignments[slotIdx].itemId.slice(5) : '';
  const modal = document.createElement('div');
  modal.id = 'note-tag-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:16px';
  modal.innerHTML = `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px;width:100%;max-width:340px;box-shadow:0 8px 32px rgba(0,0,0,0.4)">
      <div style="font-size:15px;font-weight:700;margin-bottom:6px;color:var(--text1)">Note Tag</div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:12px">This note is saved only on this photo, not as a device.</div>
      <div class="form-row"><label>Note text</label>
        <textarea class="form-control" id="ntm-text" rows="3" placeholder="e.g. Cable runs to server room" style="resize:vertical">${esc(currentNote)}</textarea></div>
      <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">
        <button class="btn btn-secondary" onclick="document.getElementById('note-tag-modal').remove()">Cancel</button>
        <button class="btn btn-primary" onclick="submitNoteTag(${slotIdx})">Save Note</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  setTimeout(() => { const t = document.getElementById('ntm-text'); if (t) { t.focus(); t.select(); } }, 50);
}

function submitNoteTag(slotIdx) {
  const text = (document.getElementById('ntm-text')?.value || '').trim();
  if (!text) { alert('Note text is required.'); return; }
  const p = getProject();
  const ph = p.photos[_photoEditIdx];
  if (!ph) return;
  if (!ph.assignments) ph.assignments = [];
  ph.assignments[slotIdx] = Object.assign({}, ph.assignments[slotIdx] || {}, { itemId: `note:${text}`, x: null, y: null });
  logChange(`Note tag added to photo`);
  save();
  document.getElementById('note-tag-modal')?.remove();
  openPhotoEditor(_photoEditIdx);
}

function onPhotoSlotChange(slotIdx, val) {
  if (val === '__new_rack__') {
    const sel = document.getElementById(`slot-sel-${slotIdx}`);
    const p = getProject();
    const ph = p.photos[_photoEditIdx];
    if (sel) sel.value = ph?.assignments?.[slotIdx]?.itemId || '';
    openQuickRackModal(slotIdx);
    return;
  }
  if (val === '__new_device__') {
    // Reset select back to previous value, then open quick-add modal
    const sel = document.getElementById(`slot-sel-${slotIdx}`);
    const p = getProject();
    const ph = p.photos[_photoEditIdx];
    if (sel) sel.value = ph?.assignments?.[slotIdx]?.itemId || '';
    openQuickDeviceModal(slotIdx);
    return;
  }
  if (val === '__note__') {
    const sel = document.getElementById(`slot-sel-${slotIdx}`);
    const p = getProject();
    const ph = p.photos[_photoEditIdx];
    if (sel) sel.value = ph?.assignments?.[slotIdx]?.itemId || '';
    openNoteTagPrompt(slotIdx);
    return;
  }
  const p = getProject();
  const ph = p.photos[_photoEditIdx];
  if (!ph) return;
  if (!ph.assignments) ph.assignments = [];
  const photoName = ph.caption || ph.name || `Photo ${_photoEditIdx+1}`;
  if (val) {
    if (!ph.assignments[slotIdx]) ph.assignments[slotIdx] = {};
    ph.assignments[slotIdx].itemId = val;
    const res = resolvePhotoItem(val, p);
    logChange(`Photo tag assigned: "${res?.label || val}" → Tag ${slotIdx+1} on "${photoName}"`);
    // Leave x/y as null — user drags to place on canvas
  } else {
    const old = ph.assignments[slotIdx];
    if (old?.itemId) {
      const res = resolvePhotoItem(old.itemId, p);
      logChange(`Photo tag removed: "${res?.label || old.itemId}" from Tag ${slotIdx+1} on "${photoName}"`);
    }
    ph.assignments[slotIdx] = null;
  }
  save();
  renderPhotoOverlays(_photoEditIdx);
  refreshPhotoNotesBox(p, ph);
  // Re-render just this slot header hint without full editor rebuild
  openPhotoEditor(_photoEditIdx);
}

function refreshPhotoNotesBox(p, ph) {
  const box = document.getElementById('photo-notes-box');
  if (!box) return;
  const assigned = (ph.assignments||[]).filter(a => a?.itemId);
  if (!assigned.length) {
    box.innerHTML = '<div style="font-size:11px;color:var(--text3)">No devices tagged yet.</div>';
    return;
  }
  box.innerHTML = assigned.map(a => {
    const si = ph.assignments.indexOf(a);
    const c = SLOT_COLORS[si % SLOT_COLORS.length];
    const res = resolvePhotoItem(a.itemId, p);
    if (!res) return '';
    const [kind, devId] = a.itemId.split(':');
    const isDevice = kind === 'dev';
    return `<div class="photo-notes-item">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
        <div style="width:8px;height:8px;border-radius:50%;background:${c};flex-shrink:0;box-shadow:0 0 4px ${c}88"></div>
        <span style="font-size:11px;font-weight:600;color:${c}">${esc(res.label)}</span>
      </div>
      <textarea class="form-control" rows="2" style="font-size:11px;resize:vertical;padding:5px 8px;line-height:1.45"
        placeholder="Add notes about ${esc(res.label)}…"
        ${isDevice ? `data-photo-note-devid="${devId}"` : ''}
        onchange="savePhotoNoteInline(this,'${a.itemId}')"
        oninput="autoResizeTA(this)"
      >${esc(res.notes)}</textarea>
    </div>`;
  }).filter(Boolean).join('');
}

function savePhotoNoteInline(ta, itemRef) {
  const p = getProject();
  const [kind, id] = itemRef.split(':');
  if (kind === 'dev') {
    const dev = p.devices.find(d => d.id === id);
    if (dev) { dev.notes = ta.value; logChange(`Device notes updated (via photo): ${dev.name}`); save(); }
  } else if (kind === 'rack') {
    const rack = (p.racks||[]).find(r => r.id === id);
    if (rack) { rack.notes = ta.value; logChange(`Rack notes updated (via photo): ${rack.name}`); save(); }
  }
}

function autoResizeTA(ta) {
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
}

function setTagColor(slotIdx, color) {
  const p = getProject();
  const ph = p.photos[_photoEditIdx];
  if (!ph?.assignments) return;
  if (!ph.assignments[slotIdx]) ph.assignments[slotIdx] = {};
  ph.assignments[slotIdx].color = color;
  save();
  openPhotoEditor(_photoEditIdx);
}

function setTagSize(slotIdx, val) {
  const p = getProject();
  const ph = p.photos[_photoEditIdx];
  if (!ph?.assignments) return;
  if (!ph.assignments[slotIdx]) ph.assignments[slotIdx] = {};
  ph.assignments[slotIdx].size = parseFloat(val);
  const lbl = document.getElementById(`size-label-${slotIdx}`);
  if (lbl) lbl.textContent = Math.round(parseFloat(val) * 100) + '%';
  save();
  renderPhotoOverlays(_photoEditIdx);
}

function addPhotoTag() {
  const p = getProject();
  const ph = p.photos[_photoEditIdx];
  if (!ph) return;
  if (!ph.assignments) ph.assignments = [];
  const usedColors = ph.assignments.map(a => a?.color).filter(Boolean);
  const nextColor = SLOT_COLORS.find(c => !usedColors.includes(c)) || SLOT_COLORS[ph.assignments.length % SLOT_COLORS.length];
  ph.assignments.push({ color: nextColor });
  save();
  openPhotoEditor(_photoEditIdx);
}

function removePhotoTag(slotIdx) {
  const p = getProject();
  const ph = p.photos[_photoEditIdx];
  if (!ph?.assignments) return;
  ph.assignments.splice(slotIdx, 1);
  save();
  openPhotoEditor(_photoEditIdx);
}

function removePhotoMarker(slotIdx) {
  const p = getProject();
  const ph = p.photos[_photoEditIdx];
  if (!ph?.assignments?.[slotIdx]) return;
  const a = ph.assignments[slotIdx];
  const res = a?.itemId ? resolvePhotoItem(a.itemId, p) : null;
  const photoName = ph.caption || ph.name || `Photo ${_photoEditIdx+1}`;
  logChange(`Photo pin removed: "${res?.label || 'tag'}" unpinned from "${photoName}"`);
  ph.assignments[slotIdx].x = null;
  ph.assignments[slotIdx].y = null;
  save();
  openPhotoEditor(_photoEditIdx);
}

// ── Sidebar drag → canvas drop ──
let _sidebarDrag = null;
let _photoPan    = { x: 0, y: 0 };
let _photoZoom   = 1;
let _photoPanDrag = null;
let _photoPinch   = null;
let _photoLastTap = 0;

function applyPhotoTransform() {
  const layer = document.getElementById('photo-pan-layer');
  if (!layer) return;
  layer.style.transform = `translate(${_photoPan.x}px,${_photoPan.y}px) scale(${_photoZoom})`;
  // Markers are stickers — they live inside the pan-layer and transform with it automatically.
  // No per-marker updates needed during zoom/pan.
}

function _photoDropOnCanvas(slotIdx, clientX, clientY) {
  const wrap = document.getElementById('photo-canvas-wrap');
  const ml = document.getElementById('photo-markers-layer');
  if (!wrap || !ml) return;
  const wr = wrap.getBoundingClientRect();
  if (clientX < wr.left || clientX > wr.right || clientY < wr.top || clientY > wr.bottom) return;
  const r = ml.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const x = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  const y = Math.max(0, Math.min(1, (clientY - r.top)  / r.height));
  const phNow = getProject()?.photos?.[_photoEditIdx];
  if (phNow?.assignments?.[slotIdx]) {
    phNow.assignments[slotIdx].x = x;
    phNow.assignments[slotIdx].y = y;
    const res = resolvePhotoItem(phNow.assignments[slotIdx].itemId, getProject());
    logChange(`Photo pin placed: "${res?.label || 'tag'}" pinned on "${phNow.caption || phNow.name || `Photo ${_photoEditIdx+1}`}"`);
    save();
    openPhotoEditor(_photoEditIdx);
  }
}

function startSidebarDrag(e, slotIdx) {
  e.preventDefault();
  if (_photoLayoutLocked) { toast('Layout is locked — unlock to reposition tags', 'warning'); return; }
  const p = getProject();
  const ph = p.photos[_photoEditIdx];
  const a = ph?.assignments?.[slotIdx];
  if (!a?.itemId) return;
  const res = resolvePhotoItem(a.itemId, p);
  if (!res) return;
  const ph2 = getProject()?.photos?.[_photoEditIdx];
  const c = ph2?.assignments?.[slotIdx]?.color || SLOT_COLORS[slotIdx % SLOT_COLORS.length];
  const isTouch = e.type === 'touchstart';
  const startX = isTouch ? e.touches[0].clientX : e.clientX;
  const startY = isTouch ? e.touches[0].clientY : e.clientY;

  const ghost = document.createElement('div');
  ghost.className = 'photo-overlay-marker';
  ghost.style.cssText = `position:fixed;z-index:9998;pointer-events:none;transform:translate(-50%,-100%);transform-origin:center bottom;left:${startX}px;top:${startY}px;opacity:0.85`;
  ghost.innerHTML = `<div class="photo-overlay-box" style="color:${c};border-color:${c};background:rgba(0,0,0,0.75)">${esc(res.label)}</div><div class="photo-overlay-dot" style="background:${c}"></div>`;
  document.body.appendChild(ghost);
  _sidebarDrag = { slotIdx, ghost };

  const getXY = ev => isTouch
    ? { x: (ev.touches[0] || ev.changedTouches[0]).clientX, y: (ev.touches[0] || ev.changedTouches[0]).clientY }
    : { x: ev.clientX, y: ev.clientY };

  const onMove = ev => {
    if (isTouch) ev.preventDefault();
    const { x, y } = getXY(ev);
    ghost.style.left = x + 'px'; ghost.style.top = y + 'px';
    const canvas = document.getElementById('photo-canvas-wrap');
    if (canvas) {
      const cr = canvas.getBoundingClientRect();
      canvas.style.outline = (x >= cr.left && x <= cr.right && y >= cr.top && y <= cr.bottom)
        ? '2px solid var(--accent)' : '';
    }
  };
  const onUp = ev => {
    if (isTouch) ev.preventDefault();
    document.removeEventListener(isTouch ? 'touchmove' : 'mousemove', onMove);
    document.removeEventListener(isTouch ? 'touchend'  : 'mouseup',   onUp);
    ghost.remove();
    const canvas = document.getElementById('photo-canvas-wrap');
    if (canvas) canvas.style.outline = '';
    const sd = _sidebarDrag; _sidebarDrag = null;
    if (!sd) return;
    const { x, y } = getXY(ev);
    _photoDropOnCanvas(sd.slotIdx, x, y);
  };
  document.addEventListener(isTouch ? 'touchmove' : 'mousemove', onMove, { passive: false });
  document.addEventListener(isTouch ? 'touchend'  : 'mouseup',   onUp,   { passive: false });
}

function onPhotoCanvasTouchStart(e) {
  // Double-tap to reset pan/zoom
  const now = Date.now();
  if (e.touches.length === 1 && now - _photoLastTap < 300) {
    _photoPan = { x: 0, y: 0 }; _photoZoom = 1;
    applyPhotoTransform(); _photoLastTap = 0; return;
  }
  _photoLastTap = e.touches.length === 1 ? now : 0;

  if (e.touches.length === 1) {
    const t = e.touches[0];
    if (document.elementFromPoint(t.clientX, t.clientY)?.closest?.('.photo-overlay-marker') || _photoDrag) return;
    e.preventDefault();
    _photoPanDrag = { startX: t.clientX, startY: t.clientY, origX: _photoPan.x, origY: _photoPan.y };
    _photoPinch = null;
  } else if (e.touches.length === 2) {
    e.preventDefault();
    _photoPanDrag = null;
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const wrap2 = document.getElementById('photo-canvas-wrap');
    const wr2 = wrap2 ? wrap2.getBoundingClientRect() : { left: 0, top: 0 };
    const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - wr2.left;
    const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - wr2.top;
    _photoPinch = { startDist: Math.hypot(dx, dy), startZoom: _photoZoom, startPanX: _photoPan.x, startPanY: _photoPan.y, midX, midY };
  }
}

function onPhotoCanvasTouchMove(e) {
  e.preventDefault();
  if (_photoDrag && e.touches.length >= 1) {
    const t = e.touches[0];
    onPhotoMarkerMove({ clientX: t.clientX, clientY: t.clientY });
    return;
  }
  if (_sidebarDrag) return;
  if (e.touches.length === 1 && _photoPanDrag) {
    const t = e.touches[0];
    _photoPan.x = _photoPanDrag.origX + (t.clientX - _photoPanDrag.startX);
    _photoPan.y = _photoPanDrag.origY + (t.clientY - _photoPanDrag.startY);
    applyPhotoTransform();
  } else if (e.touches.length === 2 && _photoPinch) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const newZoom = Math.max(0.5, Math.min(5, _photoPinch.startZoom * Math.hypot(dx, dy) / _photoPinch.startDist));
    // Adjust pan so the pinch center stays at the same position on screen
    const wrapEl = document.getElementById('photo-canvas-wrap');
    if (wrapEl) {
      const hw = wrapEl.offsetWidth / 2, hh = wrapEl.offsetHeight / 2;
      const { midX, midY, startZoom, startPanX, startPanY } = _photoPinch;
      // Local pan-layer point under pinch center (at start of pinch)
      const lx0 = (midX - hw - startPanX) / startZoom;
      const ly0 = (midY - hh - startPanY) / startZoom;
      _photoPan.x = midX - hw - lx0 * newZoom;
      _photoPan.y = midY - hh - ly0 * newZoom;
    }
    _photoZoom = newZoom;
    applyPhotoTransform();
  }
}

function onPhotoCanvasTouchEnd(e) {
  if (_photoDrag && e.touches.length === 0) {
    const t = e.changedTouches[0];
    onPhotoMarkerUp({ clientX: t.clientX, clientY: t.clientY });
  }
  if (e.touches.length < 2) _photoPinch = null;
  if (e.touches.length === 0) _photoPanDrag = null;
}

function savePhotoEditor(idx) {
  const p = getProject();
  const ph = p.photos[idx];
  if (!ph) return;
  const cap = document.getElementById('photo-editor-caption')?.value?.trim() || '';
  if (cap !== (ph.caption || '')) {
    logChange(`Photo caption updated: "${ph.caption || ph.name || `Photo ${idx+1}`}" → "${cap}"`);
  }
  ph.caption = cap;
  save();
  toast('Photo saved', 'success');
  // Refresh topbar to reflect updated state
  openPhotoEditor(idx);
}

function togglePhotoLock() {
  _photoLayoutLocked = !_photoLayoutLocked;
  openPhotoEditor(_photoEditIdx, true);
  toast(_photoLayoutLocked ? 'Layout locked' : 'Layout unlocked — drag tags to reposition', _photoLayoutLocked ? 'warning' : 'success');
}


function replacePhoto(e, idx) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const p = getProject();
    if (!p.photos[idx]) return;
    const oldName = p.photos[idx].caption || p.photos[idx].name || `Photo ${idx+1}`;
    p.photos[idx].data = ev.target.result;
    p.photos[idx].name = file.name;
    p.photos[idx].size = file.size;
    logChange(`Photo replaced: "${oldName}" → "${file.name}" (${(file.size/1024).toFixed(0)} KB)`);
    save();
    openPhotoEditor(idx);
    toast('Photo replaced', 'success');
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}

function rotatePhoto(idx) {
  const p = getProject();
  const ph = p.photos[idx];
  if (!ph) return;
  ph.rotation = ((ph.rotation || 0) + 90) % 360;
  save();
  openPhotoEditor(idx, true);
  toast('Photo rotated', 'success');
}

function onPhotoMouseWheel(e) {
  e.preventDefault();
  const wrap = document.getElementById('photo-canvas-wrap');
  if (!wrap) return;
  const wr = wrap.getBoundingClientRect();
  const mouseX = e.clientX - wr.left;
  const mouseY = e.clientY - wr.top;
  const hw = wrap.offsetWidth / 2, hh = wrap.offsetHeight / 2;

  // Calculate zoom based on scroll direction
  const delta = e.deltaY > 0 ? 0.9 : 1.1;
  const newZoom = Math.max(0.5, Math.min(5, _photoZoom * delta));

  // Zoom toward mouse position
  const lx = (mouseX - hw - _photoPan.x) / _photoZoom;
  const ly = (mouseY - hh - _photoPan.y) / _photoZoom;
  _photoPan.x = mouseX - hw - lx * newZoom;
  _photoPan.y = mouseY - hh - ly * newZoom;
  _photoZoom = newZoom;
  applyPhotoTransform();
}

// legacy - keep for any stale refs
function openPhotoLightbox(idx) { openPhotoEditor(idx); }
function savePhotoCaption(idx) { savePhotoEditor(idx); }
