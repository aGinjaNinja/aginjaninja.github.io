// ═══════════════════════════════════════════
//  PHOTOS — capture, folders, viewer, export
// ═══════════════════════════════════════════

let _currentPhotoFolderId = 'all'; // 'all', '' (unfiled) or a folder id
let _photoTagFilter = '';          // '' or 'dev:<id>' / 'rack:<id>' — filters the grid by tag
let _photoGroupMode = false;       // "By Room": room → rack → equipment photos, name-tagged
let _photoGroups = {};             // groupKey → [photo indices] for viewer scoping
let _pendingPhotoDevId = null;     // set by the device editor so new photos auto-tag to it
let _viewerPhotoIndices = [];
let _photoSelectMode = false;
const _photoSel = new Set(); // selected photo ids (Select mode)

// ═══════════════════════════════════════════
//  PHOTO VIEWER (lightbox with full-res zoom)
// ═══════════════════════════════════════════
let _pvZoom = 1, _pvPan = { x: 0, y: 0 };
let _pvDrag = null, _pvPinch = null, _pvLastTap = 0, _pvMoved = false;

async function openPhotoViewer(idx) {
  const p = getProject();
  const ph = p.photos[idx];
  if (!ph) return;

  // Always try to show the full-resolution original; the thumb is a last resort
  const fullSrc = await _lazyGetPhotoData(ph.id);
  const imgSrc = fullSrc || ph.thumb || '';
  const isPreview = !fullSrc && !!ph.thumb;

  const indices = _viewerPhotoIndices.length > 0 ? _viewerPhotoIndices : p.photos.map((_, i) => i);
  const pos = indices.indexOf(idx);
  const total = indices.length;
  const prevIdx = total > 1 ? indices[(pos - 1 + total) % total] : -1;
  const nextIdx = total > 1 ? indices[(pos + 1) % total] : -1;

  let overlay = document.getElementById('photo-viewer-overlay');
  if (overlay) {
    if (overlay._keyHandler) document.removeEventListener('keydown', overlay._keyHandler);
    overlay.remove();
  }
  _pvZoom = 1; _pvPan = { x: 0, y: 0 }; _pvDrag = null; _pvPinch = null; _pvMoved = false;

  overlay = document.createElement('div');
  overlay.id = 'photo-viewer-overlay';
  overlay.innerHTML = `
    <button class="pv-close" onclick="closePhotoViewer()" title="Close">✕</button>
    ${prevIdx >= 0 ? `<button class="pv-arrow pv-prev" onclick="event.stopPropagation();openPhotoViewer(${prevIdx})" title="Previous">‹</button>` : ''}
    ${nextIdx >= 0 ? `<button class="pv-arrow pv-next" onclick="event.stopPropagation();openPhotoViewer(${nextIdx})" title="Next">›</button>` : ''}
    <div class="pv-stage" id="pv-stage">
      <div class="pv-transform" id="pv-transform">
        <img class="pv-img" id="pv-img" src="${imgSrc}" draggable="false" style="${ph.rotation ? 'transform:rotate('+ph.rotation+'deg)' : ''}">
      </div>
      ${isPreview ? `<div class="pv-lowres">⚠ Preview quality — full photo not downloaded yet (sign in to Drive and reopen)</div>` : ''}
      <div class="pv-zoom-hint">scroll / pinch to zoom &nbsp;·&nbsp; double-tap to reset</div>
    </div>
    <div class="pv-bottom" onclick="event.stopPropagation()">
      <input class="pv-caption-input" value="${esc(ph.caption || '')}" placeholder="${esc(ph.name || 'Add a caption…')}"
        onchange="savePhotoCaption(${idx}, this.value)" title="Caption — saved on change">
      <div class="pv-counter">${pos + 1} / ${total}</div>
      <div class="pv-actions">
        <button class="btn btn-ghost btn-sm pv-dl-btn" onclick="event.stopPropagation();downloadOriginalPhoto(${idx})" title="Download original photo">⬇ Download</button>
        <button class="btn btn-ghost btn-sm pv-dl-btn" onclick="event.stopPropagation();rotatePhoto(${idx})" title="Rotate 90°">↻ Rotate</button>
        <button class="btn btn-ghost btn-sm pv-dl-btn" id="pv-more-btn" onclick="_pvToggleMenu(event)" title="More">⋯</button>
      </div>
      <div class="pv-menu" id="pv-menu">
        <div class="sheet-item" onclick="closePhotoViewer();openPhotoTagSheet(${idx})"><span class="si-ico">🏷</span> Tag device / rack</div>
        <div class="sheet-item" onclick="closePhotoViewer();movePhotoToFolder(${idx})"><span class="si-ico">📁</span> Move to folder</div>
        <div class="sheet-item" style="color:var(--red)" onclick="closePhotoViewer();deletePhoto(${idx})"><span class="si-ico">✕</span> Delete photo</div>
      </div>
    </div>
  `;

  // Close on click of empty space (not after a pan drag); close the ⋯ menu first if open
  overlay.addEventListener('click', (e) => {
    if (_pvMoved) { _pvMoved = false; return; }
    const menu = document.getElementById('pv-menu');
    if (menu && menu.classList.contains('open') && !e.target.closest('#pv-menu') && !e.target.closest('#pv-more-btn')) {
      menu.classList.remove('open');
      return;
    }
    const t = e.target;
    if (t === overlay || t.id === 'pv-stage' || t.id === 'pv-transform') closePhotoViewer();
  });

  overlay._keyHandler = (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'Escape') closePhotoViewer();
    else if (e.key === 'ArrowLeft' && prevIdx >= 0) openPhotoViewer(prevIdx);
    else if (e.key === 'ArrowRight' && nextIdx >= 0) openPhotoViewer(nextIdx);
  };
  document.addEventListener('keydown', overlay._keyHandler);

  document.body.appendChild(overlay);

  // Wire zoom / pan interactions (non-passive so we can preventDefault)
  const stage = overlay.querySelector('#pv-stage');
  stage.addEventListener('wheel', _pvWheel, { passive: false });
  stage.addEventListener('mousedown', _pvMouseDown);
  window.addEventListener('mousemove', _pvMouseMove);
  window.addEventListener('mouseup', _pvMouseUp);
  stage.addEventListener('dblclick', _pvDblClick);
  stage.addEventListener('touchstart', _pvTouchStart, { passive: false });
  stage.addEventListener('touchmove', _pvTouchMove, { passive: false });
  stage.addEventListener('touchend', _pvTouchEnd, { passive: true });
}

function closePhotoViewer() {
  const overlay = document.getElementById('photo-viewer-overlay');
  if (!overlay) return;
  if (overlay._keyHandler) document.removeEventListener('keydown', overlay._keyHandler);
  window.removeEventListener('mousemove', _pvMouseMove);
  window.removeEventListener('mouseup', _pvMouseUp);
  overlay.remove();
}

function _pvToggleMenu(e) {
  e.stopPropagation();
  document.getElementById('pv-menu')?.classList.toggle('open');
}

// ── Viewer zoom/pan mechanics ──
function _pvApply() {
  const t = document.getElementById('pv-transform');
  if (t) t.style.transform = `translate(${_pvPan.x}px, ${_pvPan.y}px) scale(${_pvZoom})`;
  const stage = document.getElementById('pv-stage');
  if (stage) stage.style.cursor = _pvZoom > 1 ? 'grab' : '';
}

// Zoom toward a point (cx, cy relative to stage center)
function _pvSetZoom(newZoom, cx, cy) {
  const z = Math.max(1, Math.min(10, newZoom));
  const k = z / _pvZoom;
  _pvPan.x = cx - k * (cx - _pvPan.x);
  _pvPan.y = cy - k * (cy - _pvPan.y);
  _pvZoom = z;
  if (z === 1) _pvPan = { x: 0, y: 0 };
  _pvApply();
}

function _pvStagePoint(clientX, clientY) {
  const stage = document.getElementById('pv-stage');
  const r = stage.getBoundingClientRect();
  return { x: clientX - r.left - r.width / 2, y: clientY - r.top - r.height / 2 };
}

function _pvWheel(e) {
  e.preventDefault();
  const pt = _pvStagePoint(e.clientX, e.clientY);
  _pvSetZoom(_pvZoom * (e.deltaY > 0 ? 0.85 : 1.18), pt.x, pt.y);
}

function _pvDblClick(e) {
  const pt = _pvStagePoint(e.clientX, e.clientY);
  _pvSetZoom(_pvZoom > 1 ? 1 : 2.5, pt.x, pt.y);
}

function _pvMouseDown(e) {
  if (_pvZoom <= 1 || e.button !== 0) return;
  e.preventDefault();
  _pvDrag = { x: e.clientX, y: e.clientY };
  const stage = document.getElementById('pv-stage');
  if (stage) stage.style.cursor = 'grabbing';
}
function _pvMouseMove(e) {
  if (!_pvDrag) return;
  const dx = e.clientX - _pvDrag.x, dy = e.clientY - _pvDrag.y;
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) _pvMoved = true;
  _pvPan.x += dx; _pvPan.y += dy;
  _pvDrag = { x: e.clientX, y: e.clientY };
  _pvApply();
}
function _pvMouseUp() {
  if (!_pvDrag) return;
  _pvDrag = null;
  _pvApply();
}

function _pvTouchStart(e) {
  if (e.touches.length === 2) {
    e.preventDefault();
    const [a, b] = e.touches;
    const midX = (a.clientX + b.clientX) / 2, midY = (a.clientY + b.clientY) / 2;
    _pvPinch = { dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), zoom: _pvZoom, mid: _pvStagePoint(midX, midY) };
    _pvDrag = null;
    return;
  }
  if (e.touches.length === 1) {
    const t = e.touches[0];
    const now = Date.now();
    if (now - _pvLastTap < 300) {
      // double-tap: toggle zoom at tap point
      e.preventDefault();
      const pt = _pvStagePoint(t.clientX, t.clientY);
      _pvSetZoom(_pvZoom > 1 ? 1 : 2.5, pt.x, pt.y);
      _pvLastTap = 0;
      return;
    }
    _pvLastTap = now;
    if (_pvZoom > 1) _pvDrag = { x: t.clientX, y: t.clientY };
  }
}
function _pvTouchMove(e) {
  if (_pvPinch && e.touches.length === 2) {
    e.preventDefault();
    const [a, b] = e.touches;
    const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const midX = (a.clientX + b.clientX) / 2, midY = (a.clientY + b.clientY) / 2;
    const mid = _pvStagePoint(midX, midY);
    _pvSetZoom(_pvPinch.zoom * (dist / _pvPinch.dist), mid.x, mid.y);
    _pvMoved = true;
    return;
  }
  if (_pvDrag && e.touches.length === 1) {
    e.preventDefault();
    const t = e.touches[0];
    const dx = t.clientX - _pvDrag.x, dy = t.clientY - _pvDrag.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) _pvMoved = true;
    _pvPan.x += dx; _pvPan.y += dy;
    _pvDrag = { x: t.clientX, y: t.clientY };
    _pvApply();
  }
}
function _pvTouchEnd(e) {
  if (e.touches.length < 2) _pvPinch = null;
  if (e.touches.length === 0) _pvDrag = null;
}

function savePhotoCaption(idx, value) {
  const p = getProject();
  const ph = p.photos[idx];
  if (!ph) return;
  const cap = (value || '').trim();
  if (cap !== (ph.caption || '')) {
    logChange(`Photo caption updated: "${ph.caption || ph.name || `Photo ${idx+1}`}" → "${cap}"`);
    ph.caption = cap;
    save();
    toast('Caption saved', 'success');
  }
}

function rotatePhoto(idx) {
  const p = getProject();
  const ph = p.photos[idx];
  if (!ph) return;
  ph.rotation = ((ph.rotation || 0) + 90) % 360;
  save();
  const overlay = document.getElementById('photo-viewer-overlay');
  if (overlay) openPhotoViewer(idx);
  else if (state.currentView === 'photos') renderPhotos();
}

function _photosMenuSheet() {
  openModal(`
    <h3>Photos</h3>
    <div class="sheet-item" onclick="closeModal();document.getElementById('photo-upload').click()"><span class="si-ico">⇪</span><div>Add photos from gallery</div></div>
    <div class="sheet-item" onclick="closeModal();createPhotoFolder()"><span class="si-ico">📁</span><div>New folder</div></div>
    <div class="sheet-item" onclick="closeModal();_manageFoldersSheet()"><span class="si-ico">✎</span><div>Manage folders</div></div>
    <div class="sheet-sep"></div>
    <div class="sheet-item" onclick="closeModal();downloadPhotosAsZip()"><span class="si-ico">⬇</span><div>Download all as ZIP<div class="si-sub">Keeps folder structure</div></div></div>
  `);
}

function _manageFoldersSheet() {
  const p = getProject();
  const folders = p.photoFolders || [];
  if (folders.length === 0) { toast('No folders yet', 'error'); return; }
  const rows = [];
  (function walk(parentId, depth) {
    folders.filter(f => (f.parentId || '') === parentId).forEach(f => {
      rows.push(`<div style="display:flex;align-items:center;gap:8px;padding:9px 4px 9px ${6 + depth * 18}px;border-bottom:1px solid var(--border)">
        <span>📁</span>
        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px">${esc(f.name)}</span>
        <button class="btn btn-ghost btn-sm btn-icon" onclick="closeModal();renamePhotoFolder('${f.id}')">✎</button>
        <button class="btn btn-danger btn-sm btn-icon" onclick="closeModal();deletePhotoFolder('${f.id}')">✕</button>
      </div>`);
      walk(f.id, depth + 1);
    });
  })('', 0);
  openModal(`
    <h3>Manage Folders</h3>
    <div style="max-height:55vh;overflow-y:auto">${rows.join('')}</div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal();createPhotoFolder()">+ New Folder</button>
      <button class="btn btn-primary" onclick="closeModal()">Done</button>
    </div>
  `);
}

// ═══════════════════════════════════════════
//  PHOTO GRID + FOLDER CHIPS
// ═══════════════════════════════════════════
function renderPhotos() {
  const p = getProject();
  if (!p.photos) p.photos = [];
  if (!p.photoFolders) p.photoFolders = [];

  if (_currentPhotoFolderId !== 'all' && _currentPhotoFolderId !== '' && !p.photoFolders.find(f => f.id === _currentPhotoFolderId)) {
    _currentPhotoFolderId = 'all';
  }

  const selectMode = _photoSelectMode;
  if (selectMode) {
    setTopbarActions(`<button class="btn btn-ghost btn-sm" onclick="togglePhotoSelectMode()">✕ Cancel</button>`);
    setFab('');
  } else {
    setTopbarActions(`
      <button class="btn btn-ghost btn-sm" onclick="togglePhotoSelectMode()">☑ Select</button>
      <button class="btn btn-ghost btn-sm" onclick="document.getElementById('photo-upload').click()">⇪ Add</button>
      <button class="btn btn-ghost btn-sm btn-icon" onclick="_photosMenuSheet()">⋯</button>
    `);
    setFab(`<button class="fab" onclick="document.getElementById('photo-capture').click()" title="Take photo">${CAM_SVG}</button>`);
  }

  // Background pass: create missing thumbnails and upgrade old low-res ones
  _thumbUpgradePass(p);

  // Tag filter whose target vanished (device deleted) resets itself
  if (_photoTagFilter && !p.photos.some(ph => (ph.assignments || []).some(a => a && a.itemId === _photoTagFilter))) {
    _photoTagFilter = '';
  }

  // Filter photos for current view (include subfolders when viewing a parent)
  let visiblePhotos;
  if (_currentPhotoFolderId === 'all') {
    visiblePhotos = p.photos.map((ph, idx) => ({ ph, idx }));
  } else if (_currentPhotoFolderId === '') {
    visiblePhotos = p.photos.map((ph, idx) => ({ ph, idx })).filter(({ ph }) => !ph.folderId);
  } else {
    const matchIds = _getFolderAndDescendantIds(_currentPhotoFolderId);
    visiblePhotos = p.photos.map((ph, idx) => ({ ph, idx })).filter(({ ph }) => matchIds.has(ph.folderId));
  }
  if (_photoTagFilter) {
    visiblePhotos = visiblePhotos.filter(({ ph }) => (ph.assignments || []).some(a => a && a.itemId === _photoTagFilter));
  }

  const allCount = p.photos.length;
  const unfiledCount = p.photos.filter(ph => !ph.folderId).length;
  p.photoFolders.forEach(f => { if (f.parentId === undefined) f.parentId = ''; });

  // Folder filter chips (tree flattened, children indented with ›)
  const folderChips = [];
  (function walk(parentId, depth) {
    p.photoFolders.filter(f => (f.parentId || '') === parentId).forEach(f => {
      const cnt = p.photos.filter(ph => _getFolderAndDescendantIds(f.id).has(ph.folderId)).length;
      folderChips.push(`<div class="filter-tab ${_currentPhotoFolderId === f.id ? 'active' : ''}" onclick="setPhotoFolder('${f.id}')">${'› '.repeat(depth)}📁 ${esc(f.name)} (${cnt})</div>`);
      walk(f.id, depth + 1);
    });
  })('', 0);
  // Device / rack tag chips — every tagged item gets its own "label" to browse under
  const tagCounts = {};
  p.photos.forEach(ph => (ph.assignments || []).forEach(a => { if (a?.itemId) tagCounts[a.itemId] = (tagCounts[a.itemId] || 0) + 1; }));
  const tagChipDefs = Object.entries(tagCounts).map(([itemId, cnt]) => {
    if (itemId.startsWith('dev:')) {
      const d = p.devices.find(x => x.id === itemId.slice(4));
      return d ? { itemId, cnt, name: d.name, color: dtColor(d.deviceType || 'Misc.'), dot: true } : null;
    }
    if (itemId.startsWith('rack:')) {
      const r = p.racks.find(x => x.id === itemId.slice(5));
      return r ? { itemId, cnt, name: r.name, color: 'var(--green)', dot: false } : null;
    }
    return null;
  }).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const tagRow = tagChipDefs.length ? `
    <div class="chip-row" style="margin-bottom:10px">
      <span class="pcg-label">🏷 Tagged</span>
      ${tagChipDefs.map(t => {
        const on = _photoTagFilter === t.itemId;
        return `<div class="filter-tab ${on ? 'active' : ''}" style="${on ? `border-color:${t.color};color:${t.color};` : ''}" onclick="setPhotoTag('${t.itemId}')">${t.dot ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${t.color};margin-right:5px"></span>` : '▤ '}${esc(t.name)} (${t.cnt})</div>`;
      }).join('')}
    </div>` : '';

  const groupMode = _photoGroupMode && !selectMode;
  const folderItems = groupMode ? `
    <div class="chip-row" style="margin-bottom:10px">
      <div class="filter-tab" onclick="togglePhotoGroupMode()">${CAM_SVG} All (${allCount})</div>
      <div class="filter-tab active" onclick="togglePhotoGroupMode()">▤ By Room</div>
    </div>` : `
    <div class="chip-row" style="margin-bottom:${tagChipDefs.length ? '6' : '10'}px">
      <div class="filter-tab ${_currentPhotoFolderId === 'all' && !_photoTagFilter ? 'active' : ''}" onclick="setPhotoFolder('all')">${CAM_SVG} All (${allCount})</div>
      <div class="filter-tab" onclick="togglePhotoGroupMode()">▤ By Room</div>
      <div class="filter-tab ${_currentPhotoFolderId === '' ? 'active' : ''}" onclick="setPhotoFolder('')">Unfiled (${unfiledCount})</div>
      ${folderChips.join('')}
      <div class="filter-tab" onclick="createPhotoFolder()">＋ 📁</div>
    </div>${tagRow}`;

  let gridContent;
  if (p.photos.length === 0) {
    gridContent = `
      <div class="empty-state">
        <div class="empty-icon">${CAM_SVG}</div>
        <h3>No photos yet</h3>
        <p>Upload photos of your network closets, equipment, or cable runs.</p>
        <button class="btn btn-primary" style="margin-top:8px" onclick="document.getElementById('photo-upload').click()">
          Add First Photo
        </button>
      </div>`;
  } else if (groupMode) {
    gridContent = _photoRoomsHtml(p);
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
      const folderObj = ph.folderId ? p.photoFolders.find(f => f.id === ph.folderId) : null;
      const folderBadge = folderObj && _currentPhotoFolderId === 'all'
        ? `<div class="photo-folder-badge">📁 ${esc(folderObj.name)}</div>` : '';
      const sel = _photoSel.has(ph.id);
      const tagCount = (ph.assignments || []).filter(Boolean).length;
      return `
      <div class="photo-card ${selectMode && sel ? 'psel' : ''}" onclick="${selectMode ? `togglePhotoSel('${ph.id}')` : `openPhotoViewer(${idx})`}">
        <div class="photo-thumb" style="background-image:url('${ph.thumb || ph.data}')${ph.rotation ? ';transform:rotate('+ph.rotation+'deg)' : ''}"></div>
        <div class="photo-meta">
          <div class="photo-title">${esc(ph.caption || ph.name || 'Photo ' + (idx+1))}</div>
          <div class="photo-date">${ph.ts ? new Date(ph.ts).toLocaleDateString() : (ph.date ? new Date(ph.date).toLocaleDateString() : '')}</div>
        </div>
        ${tagCount && !selectMode ? `<div class="photo-tag-badge">🏷 ${tagCount}</div>` : ''}
        ${folderBadge}
        ${selectMode ? `<div class="photo-sel-badge ${sel ? 'on' : ''}">${sel ? '✓' : ''}</div>` : ''}
      </div>`;
    }).join('');
    gridContent = `<div class="photo-grid">${grid}</div>`;
  }

  const selCount = _photoSel.size;
  const bulkBar = selectMode && selCount > 0 ? `
    <div class="bulk-bar">
      <span class="bulk-count">${selCount} selected</span>
      <button class="btn btn-ghost btn-sm" onclick="selectAllVisiblePhotos()">All</button>
      <button class="btn btn-danger btn-sm" onclick="bulkDeletePhotos()">✕ Delete</button>
      <button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="togglePhotoSelectMode()">Done</button>
    </div>` : '';

  document.getElementById('view-area').innerHTML =
    (selectMode ? '' : siteMapsSectionHtml()) +
    folderItems +
    (selectMode ? `<div style="font-size:12px;color:var(--text2);margin:-2px 0 10px">Tap photos to select them${selCount === 0 ? '' : ` — ${selCount} selected`}</div>` : '') +
    gridContent + bulkBar;
}

// ── Select mode (edit / bulk delete) ──
function togglePhotoSelectMode() {
  _photoSelectMode = !_photoSelectMode;
  if (!_photoSelectMode) _photoSel.clear();
  renderPhotos();
}

function togglePhotoSel(photoId) {
  if (_photoSel.has(photoId)) _photoSel.delete(photoId);
  else _photoSel.add(photoId);
  renderPhotos();
}

function selectAllVisiblePhotos() {
  const p = getProject();
  _viewerPhotoIndices.forEach(idx => {
    const ph = p.photos[idx];
    if (ph?.id) _photoSel.add(ph.id);
  });
  renderPhotos();
}

function bulkDeletePhotos() {
  const n = _photoSel.size;
  if (!n) return;
  openModal(`
    <h3 style="color:var(--red)">⚠ Delete ${n} Photo${n!==1?'s':''}?</h3>
    <p style="color:var(--text2);font-size:13.5px;margin-bottom:16px">The selected photo${n!==1?'s':''} will move to Trash and stay recoverable for 30 days (⋮ menu → Trash).</p>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-danger" onclick="executeBulkPhotoDelete()">Delete ${n} Photo${n!==1?'s':''}</button>
    </div>`);
}

function executeBulkPhotoDelete() {
  const p = getProject();
  const ids = new Set(_photoSel);
  const doomed = p.photos.filter(ph => ids.has(ph.id));
  if (!p.photoTrash) p.photoTrash = [];
  const now = new Date().toISOString();
  doomed.forEach(ph => p.photoTrash.unshift({ ...ph, deletedAt: now }));
  p.photos = p.photos.filter(ph => !ids.has(ph.id));
  logChange(`Deleted ${doomed.length} photo${doomed.length!==1?'s':''}`);
  _photoSel.clear();
  _photoSelectMode = false;
  save();
  closeModal();
  renderPhotos();
  toast(`${doomed.length} photo${doomed.length!==1?'s':''} moved to Trash`, 'success');
}

// ═══════════════════════════════════════════
//  PHOTO TAGGING — link photos to devices/racks
//  (same ph.assignments shape the legacy pin
//  editor used, so old tags keep working)
// ═══════════════════════════════════════════
function openPhotoTagSheet(idx) {
  const p = getProject();
  const ph = p.photos[idx];
  if (!ph) return;
  const tagged = new Set((ph.assignments || []).filter(Boolean).map(a => a.itemId));
  const row = (itemId, color, shape, name, sub) => `
    <div class="sheet-item tag-row" data-item="${itemId}" onclick="_togglePhotoTag(this,${idx})">
      <span class="si-ico" style="color:${color}">${shape}</span>
      <div style="flex:1;min-width:0">${esc(name)}${sub ? `<div class="si-sub">${esc(sub)}</div>` : ''}</div>
      <span class="tag-check" style="opacity:${tagged.has(itemId) ? 1 : .15}">✓</span>
    </div>`;
  const rackRows = p.racks.map(r => row('rack:' + r.id, 'var(--green)', '▤', r.name, r.location || '')).join('');
  const devRows = [...p.devices].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    .map(d => row('dev:' + d.id, dtColor(d.deviceType || 'Misc.'), '●', d.name, (d.deviceType || '') + (d.ip ? ' · ' + d.ip : ''))).join('');
  openModal(`
    <h3>🏷 Tag Photo</h3>
    <p style="font-size:12px;color:var(--text3);margin-bottom:10px">Tagged photos show up on the device's search card.</p>
    <input class="form-control" id="tag-filter" placeholder="Filter…" oninput="_filterTagRows(this.value)" style="margin-bottom:8px">
    <div style="max-height:46vh;overflow-y:auto" id="tag-rows">
      ${rackRows ? `<div class="pcg-label">▤ Racks</div>${rackRows}` : ''}
      ${devRows ? `<div class="pcg-label">◈ Devices</div>${devRows}` : '<p style="color:var(--text3);font-size:13px">No devices in this project</p>'}
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary" onclick="closeModal();if(state.currentView==='photos')renderPhotos()">Done</button>
    </div>`);
}

function _togglePhotoTag(rowEl, idx) {
  const p = getProject();
  const ph = p.photos[idx];
  if (!ph) return;
  if (!ph.assignments) ph.assignments = [];
  const itemId = rowEl.dataset.item;
  const had = ph.assignments.some(a => a && a.itemId === itemId);
  if (had) ph.assignments = ph.assignments.filter(a => !(a && a.itemId === itemId));
  else ph.assignments.push({ itemId });
  const check = rowEl.querySelector('.tag-check');
  if (check) check.style.opacity = had ? .15 : 1;
  save();
}

function _filterTagRows(q) {
  q = (q || '').toLowerCase();
  document.querySelectorAll('#tag-rows .tag-row').forEach(r => {
    r.style.display = !q || r.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

// Get a folder and all its descendant IDs (for filtering photos in a folder tree)
function _getFolderAndDescendantIds(folderId) {
  const p = getProject();
  const ids = new Set([folderId]);
  let added = true;
  while (added) {
    added = false;
    for (const f of (p.photoFolders || [])) {
      if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) {
        ids.add(f.id);
        added = true;
      }
    }
  }
  return ids;
}

// Build flat <option> list with indentation for folder pickers
function _buildFolderOptions(folders, selectedId, excludeId) {
  const opts = [];
  function walk(parentId, depth) {
    const children = folders.filter(f => (f.parentId || '') === parentId);
    for (const f of children) {
      if (f.id === excludeId) continue;
      const prefix = '  '.repeat(depth);
      opts.push(`<option value="${f.id}" ${f.id === selectedId ? 'selected' : ''}>${prefix}${esc(f.name)}</option>`);
      walk(f.id, depth + 1);
    }
  }
  walk('', 0);
  return opts.join('');
}

function setPhotoFolder(folderId) {
  _currentPhotoFolderId = folderId;
  _photoTagFilter = '';
  renderPhotos();
}

function setPhotoTag(itemId) {
  _photoTagFilter = (_photoTagFilter === itemId) ? '' : itemId;
  if (_photoTagFilter) { _currentPhotoFolderId = 'all'; _photoGroupMode = false; }
  renderPhotos();
}

// ═══════════════════════════════════════════
//  "BY ROOM" VIEW — rooms (rack locations) →
//  rack sub-groups → rack photos + photos of
//  every device in or wired to that rack,
//  each thumb labeled with the device name.
// ═══════════════════════════════════════════
function togglePhotoGroupMode() {
  _photoGroupMode = !_photoGroupMode;
  if (_photoGroupMode) { _photoTagFilter = ''; _currentPhotoFolderId = 'all'; }
  renderPhotos();
}

function _openGroupPhoto(key, idx) {
  _viewerPhotoIndices = _photoGroups[key] || [];
  openPhotoViewer(idx);
}

// The rack a device "lives" in: its own rack, else the rack of the gear its
// circuit lands on — so a lobby camera groups under the closet that feeds it.
function _devHomeRack(d, p) {
  if (d.rackId) return p.racks.find(r => r.id === d.rackId) || null;
  for (const e of p.devices) {
    if (!e.rackId || (e.ports || 0) === 0 || e.id === d.id) continue;
    for (let i = 1; i <= (e.ports || 0); i++) {
      const c = getPortCircuit(e, i, p);
      if ((c.content && c.content.id === d.id) || (c.assigned && c.assigned.id === d.id) || (c.end && c.end.id === d.id)) {
        return p.racks.find(r => r.id === e.rackId) || null;
      }
    }
  }
  return null;
}

function _photoRoomsHtml(p) {
  _photoGroups = {};
  const byItem = {};
  p.photos.forEach((ph, idx) => (ph.assignments || []).forEach(a => {
    if (a?.itemId) (byItem[a.itemId] = byItem[a.itemId] || []).push({ ph, idx });
  }));
  const taggedIdx = new Set();
  Object.values(byItem).forEach(list => list.forEach(e => taggedIdx.add(e.idx)));

  const rackGroups = p.racks.map(r => ({ rack: r, entries: [], seen: new Set() }));
  const groupFor = rack => rackGroups.find(g => g.rack.id === rack.id);
  const pushEntry = (g, e, label, color) => {
    if (g.seen.has(e.idx)) return;
    g.seen.add(e.idx);
    g.entries.push({ ...e, label, color });
  };

  // Rack's own photos lead each group
  p.racks.forEach(r => {
    (byItem['rack:' + r.id] || []).forEach(e => pushEntry(groupFor(r), e, r.name, 'var(--green)'));
  });
  // Then device photos: mounted gear top-to-bottom (by U), then connected gear by name
  const unplaced = { entries: [], seen: new Set() };
  const devsWithPhotos = p.devices.filter(d => (byItem['dev:' + d.id] || []).length)
    .sort((a, b) => ((a.rackU || 999) - (b.rackU || 999)) || (a.name || '').localeCompare(b.name || '', undefined, { numeric: true }));
  devsWithPhotos.forEach(d => {
    const home = _devHomeRack(d, p);
    const g = home ? groupFor(home) : null;
    const color = dtColor(d.deviceType || 'Misc.');
    (byItem['dev:' + d.id] || []).forEach(e => pushEntry(g || unplaced, e, d.name, color));
  });

  const rooms = {};
  rackGroups.filter(g => g.entries.length).forEach(g => {
    const room = g.rack.location || g.rack.name;
    (rooms[room] = rooms[room] || []).push(g);
  });

  const grid = (key, entries) => {
    _photoGroups[key] = entries.map(e => e.idx);
    return `<div class="photo-grid" style="margin-bottom:14px">` + entries.map(e => `
      <div class="photo-card" onclick="_openGroupPhoto('${key}',${e.idx})">
        <div class="photo-thumb" style="background-image:url('${e.ph.thumb || e.ph.data || ''}')${e.ph.rotation ? ';transform:rotate(' + e.ph.rotation + 'deg)' : ''}"></div>
        <div class="photo-meta">
          <div class="photo-title"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${e.color};margin-right:5px"></span>${esc(e.label)}</div>
          <div class="photo-date">${esc(e.ph.caption || e.ph.name || '')}</div>
        </div>
      </div>`).join('') + `</div>`;
  };

  let html = '';
  Object.keys(rooms).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).forEach(room => {
    html += `<div class="section-hdr" style="margin-top:14px"><span class="sh-title">⌖ ${esc(room)}</span></div>`;
    rooms[room].forEach(g => {
      html += `<div class="pcg-label" style="padding:0 0 8px">▤ ${esc(g.rack.name)} · ${g.entries.length} photo${g.entries.length !== 1 ? 's' : ''}</div>`;
      html += grid('rack:' + g.rack.id, g.entries);
    });
  });
  if (unplaced.entries.length) {
    html += `<div class="section-hdr" style="margin-top:14px"><span class="sh-title">◈ Unplaced equipment</span></div>`;
    html += grid('unplaced', unplaced.entries);
  }
  const untagged = p.photos.length - taggedIdx.size;
  if (!html) {
    html = `<div class="empty-state"><div class="empty-icon">▤</div><h3>No equipment-tagged photos</h3><p>Tag photos to a device or rack (viewer ⋯ → Tag), or shoot from a device's editor — they group here by room and rack.</p></div>`;
  } else if (untagged > 0) {
    html += `<div style="color:var(--text3);font-size:12px;font-family:var(--mono);padding:6px 2px 12px">${untagged} photo${untagged !== 1 ? 's' : ''} without equipment tags — tap "All" to see everything.</div>`;
  }
  return html;
}

function _getPhotoFolderLocations() {
  const p = getProject();
  const locs = new Map();
  (p.locations || []).forEach(l => locs.set(l.name, l.name));
  (p.racks || []).forEach(r => { if (r.location) locs.set(r.location, r.location); });
  return Array.from(locs.values()).sort((a, b) => a.localeCompare(b));
}

function createPhotoFolder() {
  const p = getProject();
  const locations = _getPhotoFolderLocations();
  const locOptions = locations.map(l => `<option value="${esc(l)}">${esc(l)}</option>`).join('');
  const defaultParent = (_currentPhotoFolderId && _currentPhotoFolderId !== 'all' && _currentPhotoFolderId !== '') ? _currentPhotoFolderId : '';
  const parentOpts = _buildFolderOptions(p.photoFolders || [], defaultParent);
  openModal(`
    <h3>📁 New Photo Folder</h3>
    <div class="form-row">
      <label>Parent Folder</label>
      <select class="form-control" id="pf-parent">
        <option value="">— Root (no parent) —</option>
        ${parentOpts}
      </select>
    </div>
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
  const parentId = document.getElementById('pf-parent')?.value || '';
  if (!name) return toast('Enter a folder name', 'error');
  const displayName = location ? location + ' - ' + name : name;
  const p = getProject();
  if (!p.photoFolders) p.photoFolders = [];
  const folder = { id: genId(), name: displayName, location, folderName: name, parentId };
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
  const parentOpts = _buildFolderOptions(p.photoFolders || [], folder.parentId || '', id);
  const locOptions = locations.map(l => `<option value="${esc(l)}" ${l === curLoc ? 'selected' : ''}>${esc(l)}</option>`).join('');
  openModal(`
    <h3>Rename / Move Folder</h3>
    <div class="form-row">
      <label>Parent Folder</label>
      <select class="form-control" id="pfr-parent">
        <option value="" ${!folder.parentId ? 'selected' : ''}>— Root (no parent) —</option>
        ${parentOpts}
      </select>
    </div>
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
  const parentId = document.getElementById('pfr-parent')?.value || '';
  if (!name) return toast('Enter a folder name', 'error');
  const displayName = location ? location + ' - ' + name : name;
  const p = getProject();
  const folder = p.photoFolders?.find(f => f.id === id);
  if (!folder) return;
  const old = folder.name;
  folder.name = displayName;
  folder.location = location;
  folder.folderName = name;
  folder.parentId = parentId;
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
  const childCount = p.photoFolders.filter(f => f.parentId === id).length;
  const extra = [];
  if (photoCount > 0) extra.push(`${photoCount} photo${photoCount>1?'s':''} moved to ${folder.parentId ? 'parent folder' : 'Unfiled'}`);
  if (childCount > 0) extra.push(`${childCount} subfolder${childCount>1?'s':''} moved up`);
  const msg = `Delete folder "${folder.name}"?` + (extra.length ? ' ' + extra.join(', ') + '.' : '');
  if (!confirm(msg)) return;
  const newParent = folder.parentId || '';
  p.photos.forEach(ph => { if (ph.folderId === id) ph.folderId = newParent; });
  p.photoFolders.forEach(f => { if (f.parentId === id) f.parentId = newParent; });
  p.photoFolders = p.photoFolders.filter(f => f.id !== id);
  logChange(`Photo folder deleted: "${folder.name}"`);
  save();
  if (_currentPhotoFolderId === id) _currentPhotoFolderId = newParent || 'all';
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
    ${_buildFolderOptions(p.photoFolders, ph.folderId)}
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
  const newFolderObj = newFolder ? p.photoFolders?.find(f => f.id === newFolder) : null;
  ph.folderId = newFolder;
  logChange(`Photo moved: "${ph.caption || ph.name}" → ${newFolderObj ? '"' + newFolderObj.name + '"' : 'Unfiled'}`);
  save();
  closeModal();
  if (state.currentView === 'photos') renderPhotos();
  toast(`Photo moved to ${newFolderObj ? '"' + newFolderObj.name + '"' : 'Unfiled'}`, 'success');
}

// ═══════════════════════════════════════════
//  THUMBNAIL UPGRADE (background)
// ═══════════════════════════════════════════
// Regenerates missing thumbs and upgrades pre-existing low-res (≤480px) thumbs
// from the locally stored originals. Never downloads from Drive just for thumbs.
let _thumbPassRunning = false;
const _thumbPassDone = new Set();

function _imgNaturalWidth(src) {
  return new Promise(res => {
    const i = new Image();
    i.onload = () => res(i.naturalWidth);
    i.onerror = () => res(0);
    i.src = src;
  });
}

async function _thumbUpgradePass(p) {
  if (_thumbPassRunning) return;
  _thumbPassRunning = true;
  try {
    let changed = 0;
    for (const ph of p.photos) {
      if (!ph.id || _thumbPassDone.has(ph.id)) continue;
      _thumbPassDone.add(ph.id);
      let needs = !ph.thumb;
      if (ph.thumb) {
        const w = await _imgNaturalWidth(ph.thumb);
        needs = w > 0 && w < 700;
      }
      if (!needs) continue;
      const src = ph.data || await _idbGetPhotoData(ph.id);
      if (!src) continue;
      const t = await _generateThumb(src);
      if (t) changed++;
      if (t) ph.thumb = t;
      // Yield between photos so decoding doesn't jank the UI
      await new Promise(r => setTimeout(r, 30));
      if (state.currentView !== 'photos') break;
    }
    if (changed > 0) {
      save();
      if (state.currentView === 'photos') renderPhotos();
    }
  } catch (e) {
    console.warn('Thumb upgrade pass failed:', e);
  } finally {
    _thumbPassRunning = false;
  }
}

// ═══════════════════════════════════════════
//  UPLOAD / DELETE
// ═══════════════════════════════════════════
async function uploadPhotos(e) {
  const p = getProject();
  if (!p.photos) p.photos = [];
  const files = Array.from(e.target.files);
  const tagDevId = _pendingPhotoDevId;
  _pendingPhotoDevId = null;
  if (!files.length) return;
  const tagDev = tagDevId ? p.devices.find(d => d.id === tagDevId) : null;
  const input = e.target;
  let added = 0;

  for (const file of files) {
    try {
      const blob = await _convertHeicIfNeeded(file, file.name);
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      const thumb = await _generateThumb(dataUrl);
      const folderId = tagDev ? '' : ((_currentPhotoFolderId !== 'all') ? _currentPhotoFolderId : '');
      const photoId = genId();
      await _idbSavePhotoData(photoId, dataUrl);
      p.photos.push({ id: photoId, name: file.name, caption: tagDev ? tagDev.name : '', data: null, thumb: thumb || '', ts: new Date().toISOString(), date: Date.now(), size: file.size, dataLen: dataUrl.length, assignments: tagDev ? [{ itemId: 'dev:' + tagDev.id }] : [], folderId: folderId || '' });
      logChange(`Photo added: "${file.name}" (${(file.size/1024).toFixed(0)} KB)${tagDev ? ` — tagged ${tagDev.name}` : ''}`);
      added++;
    } catch(err) { console.error('Photo add error:', err); }
  }

  if (added > 0) {
    save();
    if (typeof _gdriveQueuePhotoSync === 'function') _gdriveQueuePhotoSync();
    if (tagDev) {
      // Shot from the device editor — go straight back to it with the new thumbs
      editDevice(tagDev.id);
    } else if (state.currentView === 'photos') {
      renderPhotos();
    } else {
      // Taken from Home's quick action? Jump to Photos properly instead of
      // painting the photo grid into whatever view is showing.
      setView('photos');
    }
    toast(`Added ${added} photo${added>1?'s':''}${tagDev ? ` to ${tagDev.name}` : ''}`, 'success');
  }
  else { toast('Could not add photos', 'error'); }
  try { input.value = ''; } catch(e) {}
}

function deletePhoto(idx) {
  const p = getProject();
  if (!p.photos) return;
  if (!confirm('Delete this photo? It moves to Trash for 30 days (⋮ menu → Trash).')) return;
  const ph = p.photos[idx];
  const name = ph?.caption || ph?.name || `Photo ${idx+1}`;
  if (!p.photoTrash) p.photoTrash = [];
  if (ph) p.photoTrash.unshift({ ...ph, deletedAt: new Date().toISOString() });
  p.photos.splice(idx, 1);
  logChange(`Photo deleted: "${name}"`);
  save();
  if (state.currentView === 'photos') renderPhotos();
  toast('Moved to Trash — restore from ⋮ menu', 'success');
}

// ═══════════════════════════════════════════
//  HELPERS + DOWNLOADS
// ═══════════════════════════════════════════
let _heicLoading = null;
async function _convertHeicIfNeeded(blob, fileName) {
  const name = (fileName || blob.name || '').toLowerCase();
  const isHeic = name.endsWith('.heic') || name.endsWith('.heif') || blob.type === 'image/heic' || blob.type === 'image/heif';
  if (!isHeic) return blob;
  if (typeof heic2any === 'undefined') {
    // Lazy-load the converter from CDN on first HEIC upload
    if (!_heicLoading) {
      _heicLoading = new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = 'https://unpkg.com/heic2any@0.0.4/dist/heic2any.min.js';
        s.onload = resolve;
        s.onerror = resolve;
        document.head.appendChild(s);
      });
    }
    await _heicLoading;
    if (typeof heic2any === 'undefined') return blob;
  }
  try {
    const converted = await heic2any({ blob, toType: 'image/jpeg', quality: 0.97 });
    return Array.isArray(converted) ? converted[0] : converted;
  } catch (err) {
    console.warn('HEIC conversion failed, using original:', err);
    return blob;
  }
}

function _getPhotoFolderPath(folders, folderId) {
  if (!folderId) return '';
  const parts = [];
  let current = folders.find(f => f.id === folderId);
  let depth = 0;
  while (current && depth < 20) {
    parts.unshift(current.name.replace(/[<>:"/\\|?*]/g, '_'));
    current = current.parentId ? folders.find(f => f.id === current.parentId) : null;
    depth++;
  }
  return parts.join('/');
}

function _mimeToExt(mime) {
  const map = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp', 'image/bmp': '.bmp', 'image/svg+xml': '.svg', 'image/heic': '.heic', 'image/heif': '.heif', 'image/tiff': '.tiff', 'image/avif': '.avif', 'image/x-icon': '.ico' };
  return map[mime] || '.jpg';
}

async function downloadOriginalPhoto(idx) {
  const p = getProject();
  const ph = p.photos[idx];
  if (!ph) return;
  const data = await _lazyGetPhotoData(ph.id);
  if (!data) return toast('Photo data not found', 'error');
  const mime = (data.match(/^data:([^;]+);/) || [])[1] || 'image/jpeg';
  const ext = _mimeToExt(mime);
  let name = (ph.caption || ph.name || 'photo').replace(/[<>:"/\\|?*]/g, '_');
  if (!/\.\w+$/.test(name)) name += ext;
  _triggerPhotoDownload(data, name);
  toast('Photo downloaded', 'success');
}

function _triggerPhotoDownload(urlOrData, filename, isObjectUrl) {
  const a = document.createElement('a');
  a.href = urlOrData;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (isObjectUrl) setTimeout(() => URL.revokeObjectURL(urlOrData), 5000);
}

async function downloadPhotosAsZip() {
  const p = getProject();
  if (!p.photos || p.photos.length === 0) return toast('No photos to download', 'error');
  await _ensureJSZip();

  toast('Building ZIP file...', 'info');
  const zip = new JSZip();
  const usedPaths = new Set();
  let count = 0;

  for (const ph of p.photos) {
    const data = await _lazyGetPhotoData(ph.id);
    if (!data) continue;

    const folderPath = _getPhotoFolderPath(p.photoFolders || [], ph.folderId);
    let baseName = (ph.name || ph.caption || ph.id).replace(/[<>:"/\\|?*]/g, '_');
    const mime = (data.match(/^data:([^;]+);/) || [])[1] || 'image/jpeg';
    const ext = _mimeToExt(mime);
    if (!/\.\w+$/.test(baseName)) baseName += ext;

    let fullPath = folderPath ? folderPath + '/' + baseName : baseName;
    let counter = 1;
    while (usedPaths.has(fullPath.toLowerCase())) {
      const dotIdx = baseName.lastIndexOf('.');
      const nameOnly = dotIdx >= 0 ? baseName.slice(0, dotIdx) : baseName;
      const extPart = dotIdx >= 0 ? baseName.slice(dotIdx) : '';
      fullPath = (folderPath ? folderPath + '/' : '') + nameOnly + '_' + counter + extPart;
      counter++;
    }
    usedPaths.add(fullPath.toLowerCase());

    const base64 = data.split(',')[1];
    zip.file(fullPath, base64, { base64: true });
    count++;
  }

  if (count === 0) return toast('No photo data found to export', 'error');

  try {
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (p.name || 'photos').replace(/\s+/g, '_') + '_photos.zip';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast(`Downloaded ${count} photo${count > 1 ? 's' : ''} as ZIP`, 'success');
  } catch (err) {
    console.error('ZIP generation error:', err);
    toast('Failed to generate ZIP: ' + err.message, 'error');
  }
}
