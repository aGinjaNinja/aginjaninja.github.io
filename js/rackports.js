// ═══════════════════════════════════════════
//  RACKS (touch drag-and-drop) + PORTS + CABLE RUNS
// ═══════════════════════════════════════════

let _poolCollapsed = (function(){ try { return localStorage.getItem('netrack_pool_collapsed') === '1'; } catch(e) { return false; } })();

function togglePoolDock() {
  _poolCollapsed = !_poolCollapsed;
  try { localStorage.setItem('netrack_pool_collapsed', _poolCollapsed ? '1' : '0'); } catch(e) {}
  renderRacks();
}

let _rackEditMode = false;

// ── Per-device faceplate ⇄ list view (persisted) ──
let _portListModes = (function(){ try { return new Set(JSON.parse(localStorage.getItem('netrack_portlist') || '[]')); } catch(e) { return new Set(); } })();
function _isPortList(id) { return _portListModes.has(id); }
function togglePortList(id) {
  if (_portListModes.has(id)) _portListModes.delete(id); else _portListModes.add(id);
  try { localStorage.setItem('netrack_portlist', JSON.stringify([..._portListModes])); } catch(e) {}
  renderRacks();
}

// Readable wiring-chart view of a device's ports: one full-width row per
// port that has anything on it, open ports collapsed into tap chips.
function buildPortListHTML(dev, p) {
  const labels = dev.portLabels || {}, vlans = dev.portVlans || {}, notes = dev.portNotes || {}, peers = dev.portPeerPort || {};
  const rows = [], open = [];
  for (let i = 1; i <= (dev.ports || 0); i++) {
    const circ = getPortCircuit(dev, i, p);
    const content = circ.content;
    const ovr = (dev.portTypeOverride || {})[i] || '';
    const fiber = (dev.portFiber || {})[i] || '';
    const label = labels[i] || '', note = notes[i] || '', vlan = vlans[i] || '';
    const poe = !!(dev.portPoe || {})[i];
    if (!(content || label || note || vlan || poe || ovr || fiber)) { open.push(i); continue; }
    const color = content ? dtColor(content.deviceType || 'Misc.') : ovr ? dtColor(ovr) : 'var(--border2)';
    const bold = label || (content ? content.name : `Port ${i}`);
    const pieces = [];
    if (content) {
      if (label) pieces.push(`→ ${content.name}${content.ip ? ' (' + content.ip + ')' : ''}`);
      else if (content.ip) pieces.push(content.ip);
      if (circ.end && circ.link) pieces.push(`⇄ ${circ.link.dev.name} P${circ.link.port}`);
      else if (peers[i]) pieces.push(`↔ P${peers[i]}`);
    }
    if (ovr && !content) pieces.push(`${ovr} — no device`);
    if (note) pieces.push(note);
    const vc = vlan ? getVlanColor(vlan) : null;
    rows.push(`<div class="pl-row" style="border-left:3px solid ${color}" onclick="event.stopPropagation();assignPort('${dev.id}',${i})">
      <span class="pl-num">P${i}</span>
      <div class="pl-main">
        <div class="pl-lbl">${esc(bold)}</div>
        ${pieces.length ? `<div class="pl-conn">${esc(pieces.join(' · '))}</div>` : ''}
      </div>
      <div class="pl-meta">
        ${fiber ? fiberDotHtml(fiber) : ''}
        ${poe ? '<span title="PoE" style="color:#ffcc00;font-size:11px">⚡</span>' : ''}
        ${vlan ? `<span class="port-vlan-tag" style="background:${vc}22;color:${vc}">V${vlan}</span>` : ''}
      </div>
    </div>`);
  }
  const openChips = open.length
    ? `<div class="pl-open"><span class="pl-open-lbl">open</span>${open.map(i => `<span class="pl-open-chip" onclick="event.stopPropagation();assignPort('${dev.id}',${i})">P${i}</span>`).join('')}</div>`
    : '';
  return `<div class="port-list">${rows.join('')}${openChips}</div>`;
}

function toggleRackEdit() {
  _rackEditMode = !_rackEditMode;
  renderRacks();
  toast(_rackEditMode ? 'Edit mode — drag devices to move, ✕ to unrack' : 'Edit mode off', _rackEditMode ? 'warning' : 'success');
}

function renderRacks() {
  setTopbarActions(`
    <button class="btn btn-ghost btn-sm" onclick="addPatchPanel()">⊟ Panel</button>
    <button class="btn ${_rackEditMode ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="toggleRackEdit()">${_rackEditMode ? '✓ Done' : '✎ Edit'}</button>`);
  setFab(`<button class="fab" onclick="addRack()" title="New rack">＋</button>`);
  const p = getProject();
  const poolDevs = p.devices.filter(d => RACK_MOUNTABLE.has(d.deviceType||'Misc.') && !d.rackId);

  // ── Pool dock (drag source), pinned above the bottom nav ──
  // Collapsible so a scroll swipe near the bottom can't accidentally grab a device.
  const dock = document.getElementById('pool-dock');
  const va = document.getElementById('view-area');
  const fabC = document.getElementById('fab-container');
  if (dock) {
    if (poolDevs.length > 0) {
      if (_poolCollapsed) {
        dock.innerHTML = `
          <div class="pd-bar" onclick="togglePoolDock()">
            <span>▸ &nbsp;Unassigned devices (${poolDevs.length})</span>
            <span style="color:var(--accent)">tap to open</span>
          </div>`;
        if (va) va.style.paddingBottom = 'calc(120px + var(--safe-b))';
        fabC?.classList.add('raised-sm');
      } else {
        dock.innerHTML = `
          <div class="pd-bar" onclick="togglePoolDock()">
            <span>▾ &nbsp;Unassigned — drag up into a rack</span>
            <span style="color:var(--accent)">hide ▼</span>
          </div>
          <div class="pool-strip" id="pool-strip">
            ${poolDevs.map(d => {
              const c = dtColor(d.deviceType||'Misc.');
              const uh = d.deviceUHeight || 1;
              return `<div class="pool-chip" data-device-id="${d.id}" oncontextmenu="return false">
                <span class="pc-dot" style="background:${c}"></span>
                <span class="pc-name">${esc(d.name)}</span>
                <span class="pc-u">${uh}U</span>
              </div>`;
            }).join('')}
          </div>`;
        // Wire pointer handlers (drag up = place, tap = picker modal)
        dock.querySelectorAll('.pool-chip').forEach(el => {
          el.addEventListener('pointerdown', (e) => _dndDown(e, el.dataset.deviceId, null, el, true));
        });
        if (va) va.style.paddingBottom = 'calc(185px + var(--safe-b))';
        fabC?.classList.add('raised');
      }
      dock.style.display = 'block';
    } else {
      dock.style.display = 'none';
      dock.innerHTML = '';
      if (va) va.style.paddingBottom = '';
    }
  }

  let html = '';
  // Jump list: tap a rack to scroll straight to it (sorted by room/location)
  if (p.racks.length > 1) {
    const jump = [...p.racks].sort((a, b) =>
      (a.location||'').localeCompare(b.location||'') || (a.name||'').localeCompare(b.name||''));
    html += `<div class="chip-row" style="margin-bottom:10px">
      ${jump.map(r => `<div class="filter-tab" onclick="scrollToRack('${r.id}')">▤ ${esc(r.name)}${r.location ? ` <span style="opacity:.6;font-size:11px">· ${esc(r.location)}</span>` : ''}</div>`).join('')}
    </div>`;
  }
  if (p.racks.length === 0) {
    html = `<div class="empty-state"><div class="empty-icon">▤</div><h3>No racks yet</h3><p>Tap ＋ to create your first rack, then drag devices into it.</p></div>`;
  } else {
    // Column packing: phones get 1 column; wide screens pack racks side by side
    function estimateRackPx(r) {
      const HEADER = 56, BODY_PAD = 16;
      let px = 0;
      for (let u = 1; u <= r.uHeight; u++) {
        const dev = p.devices.find(d => d.rackId === r.id && d.rackU === u);
        const isCont = !dev && p.devices.some(d =>
          d.rackId === r.id && d.rackU && d.rackU < u && u < d.rackU + (d.deviceUHeight||1)
        );
        if (isCont) continue;
        if (!dev) { px += 43; continue; }
        const ports = dev.ports || 0;
        const isPP = PANEL_LIKE(dev.deviceType || '');
        if (ports > 0 && _isPortList(dev.id)) {
          const used = new Set([
            ...Object.keys(dev.portAssignments || {}),
            ...Object.keys(dev.portLabels || {}),
            ...Object.keys(dev.portEndDevice || {})
          ]).size;
          px += 36 + used * 42 + 40 + 6;
        } else {
          px += 36 + (ports > 0 ? (isPP ? Math.ceil(ports / 12) * 40 : 38) : 6) + 6;
        }
      }
      return HEADER + BODY_PAD + px;
    }
    const areaW = va ? Math.max(0, va.clientWidth - 28) : (window.innerWidth - 28);
    const MIN_COL_W = 480;
    const numCols = Math.max(1, Math.min(p.racks.length, Math.floor((areaW + 16) / (MIN_COL_W + 16))));
    const cols = Array.from({ length: numCols }, () => ({ racks: [], height: 0 }));
    const sorted = [...p.racks].sort((a, b) => estimateRackPx(b) - estimateRackPx(a));
    sorted.forEach(r => {
      const shortest = cols.reduce((m, c) => c.height < m.height ? c : m, cols[0]);
      shortest.racks.push(r);
      shortest.height += estimateRackPx(r) + 16;
    });
    html += `<div class="rack-area">` +
      cols.map(col => `<div class="rack-col">` + col.racks.map(r => buildRackHTML(r, p)).join('') + `</div>`).join('') +
      `</div>`;
  }
  document.getElementById('view-area').innerHTML = html;

  // Wire drag handles on placed devices (edit mode only — attrs exist only then)
  document.querySelectorAll('.slot-label[data-device-id]').forEach(el => {
    el.addEventListener('pointerdown', (e) => _dndDown(e, el.dataset.deviceId, el.dataset.rackId, el, false));
  });
  _wireRackHover();
}

// ── S-Pen / mouse hover: highlight the port, its linked peer port,
//    and show what's connected in a floating tip.
//    Samsung WebViews deliver pen hover through different channels
//    (pointer events on some builds, synthesized mouse moves on others),
//    so we listen to all of them and treat "movement with no contact"
//    as hover, regardless of the reported pointer type. ──
function _wireRackHover() {
  const va = document.getElementById('view-area');
  if (!va || va._rackHoverWired) return;
  va._rackHoverWired = true;
  let tip = document.getElementById('rack-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'rack-tip';
    document.body.appendChild(tip);
  }
  let curEl = null;
  let lastTouch = 0;

  const clear = () => {
    if (!curEl && tip.style.display === 'none') return;
    curEl = null;
    document.querySelectorAll('.port-hl').forEach(x => x.classList.remove('port-hl'));
    tip.style.display = 'none';
  };

  const show = (el) => {
    if (el === curEl) return;
    clear();
    curEl = el;
    el.classList.add('port-hl');
    const pd = el.dataset.peerdev, pp = el.dataset.peerport;
    if (pd && pp) {
      document.querySelectorAll(`[data-owner="${pd}"][data-port="${pp}"]`).forEach(x => x.classList.add('port-hl'));
    }
    tip.textContent = el.dataset.tip;
    tip.style.display = 'block';
    const r = el.getBoundingClientRect();
    tip.style.left = Math.min(window.innerWidth - tip.offsetWidth - 8, Math.max(8, r.left + r.width / 2 - tip.offsetWidth / 2)) + 'px';
    tip.style.top = (r.top > tip.offsetHeight + 60 ? r.top - tip.offsetHeight - 10 : r.bottom + 10) + 'px';
  };

  const HOVER_SEL = '.rack-port-sq, .pp-port, .pcell';
  const onHoverMove = (e) => {
    if (e.pointerType === 'touch') return;               // real touches never hover
    if (Date.now() - lastTouch < 600) return;            // ignore synthesized mouse events after taps
    if (e.buttons) { clear(); return; }                  // contact = drag/tap, not hover
    let el = (e.target && e.target.closest) ? e.target.closest(HOVER_SEL) : null;
    if (!el && typeof e.clientX === 'number') {
      const n = document.elementFromPoint(e.clientX, e.clientY);
      el = (n && n.closest) ? n.closest(HOVER_SEL) : null;
    }
    if (el && el.dataset.tip) show(el);
    else clear();
  };

  va.addEventListener('pointermove', onHoverMove, { passive: true });
  va.addEventListener('mousemove', onHoverMove, { passive: true });
  va.addEventListener('pointerover', onHoverMove, { passive: true });
  va.addEventListener('pointerdown', clear, { passive: true });
  va.addEventListener('touchstart', () => { lastTouch = Date.now(); clear(); }, { passive: true });
  va.addEventListener('touchend', () => { lastTouch = Date.now(); }, { passive: true });
  va.addEventListener('scroll', clear, { passive: true });
  document.addEventListener('pointerout', (e) => {
    if (e.pointerType !== 'touch' && !e.relatedTarget) clear(); // pen pulled away from screen
  }, { passive: true });

  // S-Pen hover, bridged from the native layer (MainActivity.setOnHoverListener):
  // Samsung's WebView never forwards stylus hover to web content, so Android
  // hands us CSS-pixel coordinates directly and we hit-test them here.
  window.__penHover = (x, y, active) => {
    if (!active) { clear(); return; }
    const n = document.elementFromPoint(x, y);
    const el = (n && n.closest) ? n.closest(HOVER_SEL) : null;
    if (el && el.dataset.tip) show(el);
    else clear();
  };
}

function buildRackPortSquares(dev, p) {
  const portCount = dev.ports || 0;
  if (portCount === 0) return '';
  const vlans = dev.portVlans || {};
  const labels = dev.portLabels || {};
  const peers = dev.portPeerPort || {};
  const topRow = [], botRow = [];
  for (let i = 1; i <= portCount; i++) (i % 2 === 1 ? topRow : botRow).push(i);
  function renderSqs(ports) {
    return ports.map(i => {
      const circ = getPortCircuit(dev, i, p);
      const content = circ.content;
      const dc = content ? dtColor(content.deviceType || 'Misc.') : null;
      const vc = getVlanColor(vlans[i] || '1');
      const hasLabel = !!(labels[i]);
      const ovr = (dev.portTypeOverride || {})[i] || '';
      const oc = ovr ? dtColor(ovr) : null;
      const style = content
        ? `border-color:${dc};background:${dc};`
        : ovr
          ? `border-color:${oc};background:${oc}55;`
          : hasLabel
            ? `border-color:var(--accent);`
            : (vlans[i] ? `border-color:${vc};` : '');
      let connStr = ovr ? ` · ${ovr} (no device)` : ' · open';
      if (content) {
        connStr = ` → ${content.name}${content.ip ? ' (' + content.ip + ')' : ''}`;
        if (circ.end && circ.link) connStr += ` · ⇄ ${circ.link.dev.name} P${circ.link.port}`;
        else if (peers[i]) connStr += ' P' + peers[i];
      }
      const tip = `${dev.name} P${i}${labels[i] ? ' · ' + labels[i] : ''}${connStr}${vlans[i] ? ' · VLAN ' + vlans[i] : ''}`;
      return `<div class="rack-port-sq" data-owner="${dev.id}" data-port="${i}" data-peerdev="${circ.assigned ? circ.assigned.id : ''}" data-peerport="${peers[i] || ''}" data-tip="${esc(tip)}" style="${style}" onclick="event.stopPropagation();assignPort('${dev.id}',${i})"></div>`;
    }).join('');
  }
  return `<div class="rack-port-grid">
    <div class="rack-port-row">${renderSqs(topRow)}</div>
    ${botRow.length ? `<div class="rack-port-row">${renderSqs(botRow)}</div>` : ''}
  </div>`;
}

function buildPatchPanelFaceplate(dev, p) {
  const portCount = dev.ports || 24;
  const labels      = dev.portLabels      || {};
  const notes       = dev.portNotes       || {};
  const PORTS_PER_ROW = 12;

  const peers = dev.portPeerPort || {};
  const portEls = [];
  for (let i = 1; i <= portCount; i++) {
    const circ = getPortCircuit(dev, i, p);
    const content = circ.content;
    const assigned = !!content;
    const label = labels[i] || '';
    const note  = notes[i]  || '';
    const ovr   = (dev.portTypeOverride || {})[i] || '';
    const fiber = (dev.portFiber || {})[i] || '';
    const dc = assigned ? dtColor(content.deviceType || 'Misc.') : (ovr ? dtColor(ovr) : null);
    let connStr = ovr && !assigned ? ` · ${ovr} (no device)` : ' · open';
    if (content) {
      connStr = ` → ${content.name}${content.ip ? ' (' + content.ip + ')' : ''}`;
      if (circ.end && circ.link) connStr += ` · ⇄ ${circ.link.dev.name} P${circ.link.port}`;
      else if (peers[i]) connStr += ' P' + peers[i];
    }
    const tip = `${dev.name} P${i}${label ? ' · ' + label : ''}${connStr}${fiber ? ' · Fiber ' + fiber : ''}${note ? ' · ' + note : ''}`;
    const clrStyle = dc ? `--clr:${dc};` : '';
    const labelBold = (!assigned && label) ? 'font-weight:700;' : '';
    const cls = assigned ? ' pp-assigned' : ovr ? ' pp-typed' : (label ? ' pp-labeled' : '');
    const jack = fiber
      ? `<div class="pp-port-jack" style="background:${fiberGrad(fiber)};border-color:rgba(255,255,255,.45)"></div>`
      : `<div class="pp-port-jack"></div>`;
    portEls.push(`<div class="pp-port${cls}" style="${clrStyle}" data-owner="${dev.id}" data-port="${i}" data-peerdev="${circ.assigned ? circ.assigned.id : ''}" data-peerport="${peers[i] || ''}" data-tip="${esc(tip)}" onclick="event.stopPropagation();assignPort('${dev.id}',${i})">
      <div class="pp-port-num">${i}</div>
      ${jack}
      <div class="pp-port-label" style="${labelBold}">${esc(label || (assigned ? (content.name.length>5?content.name.slice(0,4)+'…':content.name) : ''))}</div>
    </div>`);
  }

  let rowsHtml = '';
  for (let r = 0; r < portEls.length; r += PORTS_PER_ROW) {
    rowsHtml += `<div class="pp-row">${portEls.slice(r, r + PORTS_PER_ROW).join('')}</div>`;
  }
  return `<div class="pp-faceplate">${rowsHtml}</div>`;
}

function buildRackHTML(rack, p) {
  const isAsc = rack.uDirection === 'asc';
  const dirLabel = isAsc ? '↑ U1 bottom' : '↓ U1 top';
  let html = `<div class="rack-container" id="rack-${rack.id}">
    <div class="rack-header">
      <div class="rack-header-left">
        <h3>${esc(rack.name)}</h3>
        <p>${esc(rack.location||'No location')} · ${rack.uHeight}U · ${dirLabel}</p>
      </div>
      ${_rackEditMode ? `<div style="display:flex;gap:6px;flex-shrink:0">
        <button class="btn btn-ghost btn-sm btn-icon" onclick="editRack('${rack.id}')" title="Edit rack">✎</button>
        <button class="btn btn-danger btn-sm btn-icon" onclick="deleteRack('${rack.id}')" title="Delete rack">✕</button>
      </div>` : ''}
    </div>
    <div class="rack-body" oncontextmenu="return false">`;
  const uOrder = [];
  if (isAsc) {
    for (let u = rack.uHeight; u >= 1; u--) uOrder.push(u);
  } else {
    for (let u = 1; u <= rack.uHeight; u++) uOrder.push(u);
  }
  const editing = _rackEditMode;
  for (const u of uOrder) {
    const dev = p.devices.find(d => d.rackId === rack.id && d.rackU === u);
    const dc = dev ? dtColor(dev.deviceType||'Misc.') : '';
    const uh = dev ? Math.max(1, dev.deviceUHeight || 1) : 1;
    const isContinuation = !dev && p.devices.some(d =>
      d.rackId === rack.id && d.rackU && d.rackU < u && u < d.rackU + (d.deviceUHeight||1)
    );
    if (isContinuation) continue;
    const isPP = dev && PANEL_LIKE(dev.deviceType || '');
    const minH = uh > 1 ? `style="min-height:${uh * 40 + (uh - 1) * 3}px"` : '';
    // Device name sits ABOVE the ports; drag + remove exist only in edit mode
    const labelAttrs = editing
      ? `data-device-id="${dev ? dev.id : ''}" data-rack-id="${rack.id}" oncontextmenu="return false"`
      : `onclick="editDevice('${dev ? dev.id : ''}')"`;
    html += `<div class="rack-unit" ${minH}>
      <div class="rack-u-num">${u}${uh>1?`<span style="font-size:9px;color:var(--text3)">${uh}U</span>`:''}</div>
      <div class="rack-slot ${dev?'occupied':'slot-empty'} ${editing?'slot-editing':''}" id="slot-${rack.id}-${u}" ${minH}
           ${!dev ? `onclick="addDeviceToRack('${rack.id}',${u})"` : ''}>
        ${dev ? `
          <div class="slot-head">
            <div class="slot-label" style="color:${dc}" ${labelAttrs}>
              ${editing ? `<span class="slot-grip">⠿</span>` : ''}
              <span style="width:9px;height:9px;border-radius:50%;background:${dc};flex-shrink:0"></span>
              <span class="slot-name">${esc(dev.name)}</span>
              ${dev.status ? `<span class="status-dot-rack" style="background:${STATUS_COLORS[dev.status]||'#778899'};position:static" title="${esc(STATUS_LABELS[dev.status]||dev.status)}"></span>` : ''}
            </div>
            ${(dev.ports||0) > 0 ? `<button class="slot-listbtn ${_isPortList(dev.id) ? 'on' : ''}" onclick="event.stopPropagation();togglePortList('${dev.id}')" title="Faceplate / list view">☰</button>` : ''}
            ${editing ? `<button class="slot-remove" onclick="removeFromRack('${dev.id}',event)" title="Remove from rack">✕</button>` : ''}
          </div>
          ${(dev.ports||0) > 0 ? `<div class="slot-ports">${_isPortList(dev.id) ? buildPortListHTML(dev, p) : (isPP ? buildPatchPanelFaceplate(dev, p) : buildRackPortSquares(dev, p))}</div>` : ''}
        ` : ''}
      </div>
    </div>`;
  }
  html += `</div></div>`;
  return html;
}

// ═══════════════════════════════════════════
//  TOUCH + MOUSE DRAG-AND-DROP ENGINE
//  Pool chip: drag vertically to lift, tap for picker.
//  Placed device: drag its name to move; tap to edit.
//  Drop on a slot to place; drop on the dock to unrack.
// ═══════════════════════════════════════════
let _dnd = null;

function _dndDown(e, deviceId, fromRackId, srcEl, isPool) {
  if (_dnd) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  _dnd = {
    deviceId, fromRackId: fromRackId || null, srcEl, isPool,
    startX: e.clientX, startY: e.clientY,
    lastX: e.clientX, lastY: e.clientY,
    started: false, pointerId: e.pointerId,
    downTime: Date.now(), curSlot: null, overDock: false, raf: null
  };
  srcEl.addEventListener('pointermove', _dndMove);
  srcEl.addEventListener('pointerup', _dndUp);
  srcEl.addEventListener('pointercancel', _dndCancel);
}

function _dndMove(e) {
  if (!_dnd || e.pointerId !== _dnd.pointerId) return;
  const dx = e.clientX - _dnd.startX;
  const dy = e.clientY - _dnd.startY;
  _dnd.lastX = e.clientX; _dnd.lastY = e.clientY;

  if (!_dnd.started) {
    const dist = Math.hypot(dx, dy);
    if (_dnd.isPool && e.pointerType !== 'mouse') {
      // In the horizontal pool strip: sideways = native scroll, upward = start drag
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) { _dndCancel(e); return; }
      if (dist > 12 && Math.abs(dy) > Math.abs(dx)) _dndStart(e);
    } else {
      if (dist > 7) _dndStart(e);
    }
    return;
  }
  e.preventDefault();
  _dndTrack(e.clientX, e.clientY);
}

function _dndStart(e) {
  _dnd.started = true;
  try { _dnd.srcEl.setPointerCapture(_dnd.pointerId); } catch(err) {}
  const p = getProject();
  const dev = p.devices.find(d => d.id === _dnd.deviceId);
  const c = dev ? dtColor(dev.deviceType||'Misc.') : '#888';
  const ghost = document.createElement('div');
  ghost.id = 'drag-ghost';
  ghost.innerHTML = `<span class="pc-dot" style="background:${c}"></span><span>${esc(dev?.name || '')}</span><span style="font-size:10px;color:var(--text3)">${dev?(dev.deviceUHeight||1):1}U</span>`;
  document.body.appendChild(ghost);
  _dnd.ghost = ghost;
  _dnd.srcEl.classList.add('dragging');
  if (_dnd.fromRackId) {
    const slot = _dnd.srcEl.closest('.rack-slot');
    if (slot) slot.classList.add('rack-dragging-source');
  }
  if (navigator.vibrate) { try { navigator.vibrate(12); } catch(err) {} }
  _dndTrack(e.clientX, e.clientY);
  _dnd.raf = requestAnimationFrame(_dndAutoScroll);
}

function _dndTrack(x, y) {
  if (!_dnd?.ghost) return;
  _dnd.ghost.style.left = x + 'px';
  _dnd.ghost.style.top = y + 'px';
  // Hit-test what's under the finger
  const el = document.elementFromPoint(x, y);
  const slot = el ? el.closest('.rack-slot') : null;
  const dock = el ? el.closest('#pool-dock') : null;
  if (_dnd.curSlot && _dnd.curSlot !== slot) _dnd.curSlot.classList.remove('drag-over');
  if (slot && slot !== _dnd.curSlot) slot.classList.add('drag-over');
  _dnd.curSlot = slot || null;
  _dnd.overDock = !!dock && !!_dnd.fromRackId;
  const dockEl = document.getElementById('pool-dock');
  if (dockEl) dockEl.style.boxShadow = _dnd.overDock ? 'inset 0 0 0 2px var(--accent)' : '';
}

function _dndAutoScroll() {
  if (!_dnd?.started) return;
  const va = document.getElementById('view-area');
  if (va) {
    const r = va.getBoundingClientRect();
    const y = _dnd.lastY;
    const TOP = r.top + 80, BOT = r.bottom - 190;
    if (y < TOP) va.scrollTop -= Math.min(22, (TOP - y) * 0.35);
    else if (y > BOT) va.scrollTop += Math.min(22, (y - BOT) * 0.35);
    // Re-evaluate hover target while scrolling under a still finger
    _dndTrack(_dnd.lastX, _dnd.lastY);
  }
  _dnd.raf = requestAnimationFrame(_dndAutoScroll);
}

function _dndUp(e) {
  if (!_dnd || e.pointerId !== _dnd.pointerId) return;
  const d = _dnd;
  _dndTeardown();
  if (!d.started) {
    // Treated as a tap
    if (d.isPool) assignPoolDeviceModal(d.deviceId);
    else editDevice(d.deviceId);
    return;
  }
  if (d.curSlot) {
    const m = d.curSlot.id.match(/^slot-(.+)-(\d+)$/);
    if (m) _placeDevice(d.deviceId, m[1], parseInt(m[2]));
  } else if (d.overDock && d.fromRackId) {
    // Dragged down to the dock → remove from rack
    const p = getProject();
    const dev = p.devices.find(x => x.id === d.deviceId);
    if (dev) {
      const rack = p.racks.find(r => r.id === dev.rackId);
      logChange(`Rack removed: ${dev.name} from ${rack ? rack.name + ' U' + dev.rackU : 'rack'}`);
      dev.rackId = null; dev.rackU = null;
      save(); renderRacks(); toast(`${dev.name} moved to pool`);
    }
  }
}

function _dndCancel(e) {
  if (!_dnd) return;
  if (e && e.pointerId !== undefined && e.pointerId !== _dnd.pointerId) return;
  _dndTeardown();
}

function _dndTeardown() {
  if (!_dnd) return;
  const d = _dnd;
  _dnd = null;
  if (d.raf) cancelAnimationFrame(d.raf);
  if (d.ghost) d.ghost.remove();
  if (d.curSlot) d.curSlot.classList.remove('drag-over');
  const dockEl = document.getElementById('pool-dock');
  if (dockEl) dockEl.style.boxShadow = '';
  d.srcEl.classList.remove('dragging');
  document.querySelectorAll('.rack-dragging-source').forEach(el => el.classList.remove('rack-dragging-source'));
  d.srcEl.removeEventListener('pointermove', _dndMove);
  d.srcEl.removeEventListener('pointerup', _dndUp);
  d.srcEl.removeEventListener('pointercancel', _dndCancel);
  try { d.srcEl.releasePointerCapture(d.pointerId); } catch(err) {}
}

// Abort any in-flight drag (called on view switches)
function _dndAbort() { _dndTeardown(); }

// Shared placement with validation (used by drag-drop and the picker modal)
function _placeDevice(deviceId, rackId, u) {
  const p = getProject();
  const dev = p.devices.find(d => d.id === deviceId);
  if (!dev) return false;
  if (!RACK_MOUNTABLE.has(dev.deviceType||'Misc.')) { toast(`${dev.deviceType} devices cannot be rack-mounted`, 'error'); return false; }
  const targetRack = p.racks.find(r => r.id === rackId);
  const devUH = dev.deviceUHeight || 1;
  if (targetRack && u + devUH - 1 > targetRack.uHeight) { toast(`${dev.name} (${devUH}U) doesn't fit at U${u} — rack is ${targetRack.uHeight}U`, 'error'); return false; }
  for (let cu = u; cu < u + devUH; cu++) {
    const blocker = p.devices.find(d => d.id !== deviceId && d.rackId === rackId && d.rackU && d.rackU <= cu && cu < d.rackU + (d.deviceUHeight||1));
    if (blocker && blocker.rackU !== u) { toast(`U${cu} is occupied by ${blocker.name}`, 'error'); return false; }
  }
  const existing = p.devices.find(d => d.rackId === rackId && d.rackU === u && d.id !== deviceId);
  const oldRack = dev.rackId ? p.racks.find(r => r.id === dev.rackId) : null;
  const oldU = dev.rackU;
  if (existing) {
    // Swap: the displaced device takes this device's old spot — but only if it
    // actually fits there (rack height, third devices, and this device's new
    // span). Otherwise it goes to the pool instead of overlapping something.
    const exUH = existing.deviceUHeight || 1;
    let swapOk = false;
    if (oldRack && oldU) {
      const withinRack = oldU + exUH - 1 <= oldRack.uHeight;
      const clashesDevNewSpot = oldRack.id === rackId && oldU < u + devUH && u < oldU + exUH;
      const clashesThird = p.devices.some(d =>
        d.id !== deviceId && d.id !== existing.id && d.rackId === oldRack.id &&
        d.rackU && d.rackU < oldU + exUH && oldU < d.rackU + (d.deviceUHeight || 1));
      swapOk = withinRack && !clashesDevNewSpot && !clashesThird;
    }
    if (swapOk) {
      existing.rackId = oldRack.id;
      existing.rackU  = oldU;
      logChange(`Rack swap: ${existing.name} moved to ${oldRack.name} U${oldU}`);
    } else {
      existing.rackId = null;
      existing.rackU = null;
      logChange(`Rack swap: ${existing.name} moved to unassigned (no room to swap)`);
      if (oldRack) toast(`${existing.name} (${exUH}U) didn't fit at U${oldU} — moved to Unassigned`, 'warning');
    }
  }
  if (oldRack && (oldRack.id !== rackId || oldU !== u)) {
    logChange(`Rack move: ${dev.name} — ${oldRack.name} U${oldU} → ${targetRack ? targetRack.name : rackId} U${u}`);
  } else if (!oldRack) {
    logChange(`Rack assigned: ${dev.name} → ${targetRack ? targetRack.name : rackId} U${u}`);
  }
  dev.rackId = rackId;
  dev.rackU = u;
  save(); renderRacks();
  toast(`${dev.name} → U${u}`, 'success');
  return true;
}

function removeFromRack(deviceId, e) {
  e.stopPropagation();
  const p = getProject();
  const dev = p.devices.find(d => d.id === deviceId);
  if (dev) {
    const rack = p.racks.find(r => r.id === dev.rackId);
    logChange(`Rack removed: ${dev.name} from ${rack ? rack.name + ' U' + dev.rackU : 'rack'}`);
    dev.rackId = null; dev.rackU = null;
  }
  save(); renderRacks();
}

// ── Tap-to-place fallbacks ──
let _pendingRackAssign = null;

function addDeviceToRack(rackId, u) {
  _pendingRackAssign = { rackId, u };
  const typeOpts = ['Switch','Router','Firewall','Server','NAS','APC/UPS','Patch Panel','Fiber Enclosure','Misc Rack-Mounted','Modem','Access Control']
    .map(t => `<option value="${t}">${t}</option>`).join('');
  openModal(`
    <h3>Add Device at U${u}</h3>
    <div class="form-row">
      <label>Device Name *</label>
      <input class="form-control" id="rsd-name" placeholder="e.g. SW-01" autofocus>
    </div>
    <div class="form-row-inline">
      <div class="form-row"><label>Device Type</label>
        <select class="form-control" id="rsd-type">${typeOpts}</select>
      </div>
      <div class="form-row" style="flex:0 0 92px"><label>U Height</label>
        <select class="form-control" id="rsd-uheight">
          ${[1,2,3,4,6,8].map(n=>`<option value="${n}">${n}U</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveDeviceToRack()">Add Device</button>
    </div>
  `);
  setTimeout(() => document.getElementById('rsd-name')?.focus(), 50);
}

function saveDeviceToRack() {
  const name = document.getElementById('rsd-name')?.value?.trim();
  if (!name) return toast('Device name is required', 'error');
  const type = document.getElementById('rsd-type')?.value || 'Misc Rack-Mounted';
  const uheight = parseInt(document.getElementById('rsd-uheight')?.value) || 1;
  const { rackId, u } = _pendingRackAssign || {};
  if (!rackId) return;
  const p = getProject();
  const targetRack = p.racks.find(r => r.id === rackId);
  if (targetRack && u + uheight - 1 > targetRack.uHeight) return toast(`${uheight}U device doesn't fit at U${u}`, 'error');
  for (let cu = u; cu < u + uheight; cu++) {
    const blocker = p.devices.find(d => d.rackId === rackId && d.rackU && d.rackU <= cu && cu < d.rackU + (d.deviceUHeight||1));
    if (blocker) return toast(`U${cu} is occupied by ${blocker.name}`, 'error');
  }
  const dev = {
    id: genId(), name, deviceType: type,
    type: type === 'Switch' ? 'switching' : 'non-switching',
    ip: '', mac: '', manufacturer: '', model: '', notes: '',
    ports: type === 'Switch' ? 24 : type === 'Patch Panel' ? 24 : type === 'Fiber Enclosure' ? 12 : 0,
    deviceUHeight: uheight, rackId, rackU: u,
    portAssignments: {}, portNotes: {}, portVlans: {}, portPeerPort: {}, portPoe: {}, portLabels: {},
    status: '', addedDate: new Date().toISOString()
  };
  p.devices.push(dev);
  logChange(`Device added to rack at U${u}: ${name}`);
  save(); closeModal(); renderRacks();
  toast(`"${name}" added at U${u} — tap it to edit details`, 'success');
  _pendingRackAssign = null;
}

function assignPoolDeviceModal(deviceId) {
  const p = getProject();
  const dev = p.devices.find(d => d.id === deviceId);
  if (!dev) return;
  if (p.racks.length === 0) return toast('Create a rack first', 'error');
  const rackOpts = p.racks.map(r => `<option value="${r.id}">${esc(r.name)} (${r.uHeight}U)</option>`).join('');
  openModal(`
    <h3>Place "${esc(dev.name)}"</h3>
    <p style="color:var(--text3);font-size:12px;margin-bottom:12px">Tip: you can also drag the chip straight into a rack slot.</p>
    <div class="form-row"><label>Rack</label>
      <select class="form-control" id="apm-rack" onchange="updatePoolSlotOptions()">${rackOpts}</select>
    </div>
    <div class="form-row"><label>U Slot</label>
      <select class="form-control" id="apm-u"></select>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal();editDevice('${deviceId}')">✎ Edit</button>
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="savePoolAssign('${deviceId}')">Place</button>
    </div>
  `);
  updatePoolSlotOptions();
}

function updatePoolSlotOptions() {
  const p = getProject();
  const rackId = document.getElementById('apm-rack')?.value;
  const rack = p.racks.find(r => r.id === rackId);
  if (!rack) return;
  const sel = document.getElementById('apm-u');
  if (!sel) return;
  let opts = '';
  for (let u = 1; u <= rack.uHeight; u++) {
    const occupied = p.devices.some(d => d.rackId === rackId && d.rackU && d.rackU <= u && u < d.rackU + (d.deviceUHeight || 1));
    if (!occupied) opts += `<option value="${u}">U${u}</option>`;
  }
  sel.innerHTML = opts || '<option value="">No open slots</option>';
}

function savePoolAssign(deviceId) {
  const rackId = document.getElementById('apm-rack')?.value;
  const u = parseInt(document.getElementById('apm-u')?.value);
  if (!rackId || !u) return toast('Select a rack and slot', 'error');
  closeModal();
  _placeDevice(deviceId, rackId, u);
}

// ── Rack CRUD ──
function addRack() { openRackModal(null); }
function editRack(id) { openRackModal(id); }

function openRackModal(id) {
  const p = getProject();
  const r = id ? p.racks.find(x => x.id === id) : null;
  const isNew = !r;
  const curDir = r?.uDirection || 'desc';
  openModal(`
    <h3>${isNew ? 'New Rack' : 'Edit Rack'}</h3>
    <div class="form-row"><label>Rack Name *</label>
      <input class="form-control" id="r-name" value="${esc(r?.name||'')}" placeholder="e.g. MDF Rack 1"></div>
    <div class="form-row-inline">
      <div class="form-row"><label>U Height</label>
        <input class="form-control" id="r-height" type="number" min="4" max="56" value="${r?.uHeight||42}" inputmode="numeric"></div>
      <div class="form-row"><label>Location</label>
        <input class="form-control" id="r-loc" value="${esc(r?.location||'')}" placeholder="Server Room A"></div>
    </div>
    <div class="form-row"><label>U Numbering</label>
      <select class="form-control" id="r-udir">
        <option value="desc" ${curDir==='desc'?'selected':''}>U1 at top (descending)</option>
        <option value="asc" ${curDir==='asc'?'selected':''}>U1 at bottom (ascending)</option>
      </select>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveRack('${id||''}')">Save</button>
    </div>`);
  setTimeout(() => document.getElementById('r-name')?.focus(), 50);
}

function saveRack(id) {
  const p = getProject();
  const name = document.getElementById('r-name')?.value?.trim();
  if (!name) return toast('Rack name is required', 'error');
  const uDirection = document.getElementById('r-udir')?.value || 'desc';
  const data = { name, uHeight: parseInt(document.getElementById('r-height')?.value)||42, location: document.getElementById('r-loc')?.value?.trim()||'', uDirection };
  if (id) {
    const idx = p.racks.findIndex(r => r.id === id);
    if (idx >= 0) { Object.assign(p.racks[idx], data); logChange(`Rack updated: ${name}`); }
  } else {
    p.racks.push({ id: genId(), ...data });
    logChange(`Rack created: ${name} (${data.uHeight}U, ${data.location||'no location'})`);
  }
  save(); closeModal(); renderRacks(); toast(id ? 'Rack updated' : 'Rack created', 'success');
}

function deleteRack(id) {
  if (!confirm('Delete this rack? Devices will be unassigned.')) return;
  const p = getProject();
  const rack = p.racks.find(r => r.id === id);
  if (rack) logChange(`Rack deleted: ${rack.name}`);
  p.devices.forEach(d => { if (d.rackId === id) { d.rackId = null; d.rackU = null; } });
  p.racks = p.racks.filter(r => r.id !== id);
  save(); renderRacks(); toast('Rack deleted');
}

// Smooth-scroll to a rack from the jump list, with a highlight pulse
function scrollToRack(rackId) {
  const el = document.getElementById('rack-' + rackId);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.classList.remove('rack-flash');
  void el.offsetWidth;
  el.classList.add('rack-flash');
}

function checkFocusRack() {
  const rackId = sessionStorage.getItem('netrack_focus_rack');
  if (rackId) {
    sessionStorage.removeItem('netrack_focus_rack');
    setTimeout(() => {
      const el = document.getElementById('rack-' + rackId);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }
}

// ═══════════════════════════════════════════
//  PORTS
// ═══════════════════════════════════════════
function renderPorts() {
  const p = getProject();
  const portDevs = p.devices.filter(d => (d.ports||0) > 0 && d.deviceType !== 'Patch Panel');
  const patchPanels = p.devices.filter(d => d.deviceType === 'Patch Panel' && (d.ports||0) > 0);

  if (portDevs.length === 0 && patchPanels.length === 0) {
    setTopbarActions('');
    setFab(`<button class="fab" onclick="addPatchPanel()" title="New patch panel">＋</button>`);
    document.getElementById('view-area').innerHTML = `<div class="empty-state"><div class="empty-icon">⊡</div><h3>No port-capable devices</h3><p>Add a switch with a port count, or create a patch panel.</p><br><button class="btn btn-primary" onclick="addPatchPanel()">⊟ New Patch Panel</button></div>`;
    return;
  }

  // Sort by rack (rack name, then U position top-down), unracked gear last
  const rackOf = d => p.racks.find(r => r.id === d.rackId) || null;
  const allPortDevs = [...portDevs, ...patchPanels].sort((a, b) => {
    const ra = rackOf(a), rb = rackOf(b);
    if (!!ra !== !!rb) return ra ? -1 : 1;
    if (ra && rb && ra.id !== rb.id) return (ra.name||'').localeCompare(rb.name||'', undefined, { numeric: true });
    if (ra && rb && (a.rackU||0) !== (b.rackU||0)) return (a.rackU||0) - (b.rackU||0);
    return (a.name||'').localeCompare(b.name||'', undefined, { numeric: true });
  });
  const selId = state.selectedSwitch && allPortDevs.find(d=>d.id===state.selectedSwitch) ? state.selectedSwitch : allPortDevs[0].id;
  state.selectedSwitch = selId;
  const sw = p.devices.find(d => d.id === selId);
  setTopbarActions(`<button class="btn btn-ghost btn-sm" onclick="printPortLabels('${selId}')">🖨 Labels</button>`);
  setFab('');

  // Device picker: chips wrap under their rack label — no sideways scrolling
  let chips = '';
  let lastGroup = null;
  allPortDevs.forEach(s => {
    const r = rackOf(s);
    const group = r ? r.name : 'Unracked';
    if (group !== lastGroup) {
      chips += `${lastGroup !== null ? '</div></div>' : ''}<div class="pcg-group"><div class="pcg-label">▤ ${esc(group)}</div><div class="pcg-chips">`;
      lastGroup = group;
    }
    const used = Object.keys(s.portAssignments||{}).length;
    const isPP = PANEL_LIKE(s.deviceType || '');
    const c = dtColor(s.deviceType||'Misc.');
    const active = s.id === selId;
    chips += `<div class="filter-tab ${active?'active':''}" style="${active?'border-color:'+c+';color:'+c+';':''}display:flex;align-items:center;gap:6px"
      onclick="state.selectedSwitch='${s.id}';renderPorts()">
      <span style="width:9px;height:9px;border-radius:${isPP?'2px':'50%'};background:${c}"></span>
      ${esc(s.name)}${r && s.rackU ? ` <span style="font-family:var(--mono);font-size:9px;opacity:.6">U${s.rackU}</span>` : ''} <span style="font-family:var(--mono);font-size:10px;opacity:.7">${used}/${s.ports||0}</span>
    </div>`;
  });
  if (lastGroup !== null) chips += '</div></div>';

  let panelHtml = '';
  if (sw) {
    const portCount = sw.ports || 24;
    const assignments = sw.portAssignments || {};
    const vlans = sw.portVlans || {};
    const peerPorts = sw.portPeerPort || {};
    const notes = sw.portNotes || {};
    const labels = sw.portLabels || {};
    const usedCount = Object.keys(assignments).length;

    const cells = [];
    for (let i = 1; i <= portCount; i++) {
      const circ = getPortCircuit(sw, i, p);
      const dev = circ.content;
      const vlan = vlans[i];
      const vc = getVlanColor(vlan || '1');
      const pp = peerPorts[i];
      const dc = dev ? dtColor(dev.deviceType||'Misc.') : '';
      const isPoe = !!(sw.portPoe||{})[i];
      const lbl = labels[i] || '';
      const ovr = (sw.portTypeOverride||{})[i] || '';
      const oc = ovr ? dtColor(ovr) : '';
      const fib = (sw.portFiber||{})[i] || '';
      const borderStyle = dev ? `border-color:${dc};` : ovr ? `border-color:${oc};` : (vlan ? `border-color:${vc};` : '');
      let connStr = ovr && !dev ? ` · ${ovr} (no device)` : ' · open';
      if (dev) {
        connStr = ` → ${dev.name}${dev.ip ? ' (' + dev.ip + ')' : ''}`;
        if (circ.end && circ.link) connStr += ` · ⇄ ${circ.link.dev.name} P${circ.link.port}`;
        else if (pp) connStr += ' P' + pp;
      }
      const tip = `${sw.name} P${i}${lbl ? ' · ' + lbl : ''}${connStr}${fib ? ' · Fiber ' + fib : ''}${vlan ? ' · VLAN ' + vlan : ''}${notes[i] ? ' · ' + notes[i] : ''}`;
      const viaBadge = circ.end && circ.link
        ? `<span class="port-conn-badge">⇄ ${esc(circ.link.dev.name.length > 9 ? circ.link.dev.name.slice(0, 8) + '…' : circ.link.dev.name)} P${circ.link.port}</span>`
        : (pp && dev ? `<span class="port-conn-badge">↔P${pp}</span>` : '');
      cells.push(`<div class="pcell" style="${borderStyle}" data-owner="${sw.id}" data-port="${i}" data-peerdev="${circ.assigned ? circ.assigned.id : ''}" data-peerport="${pp || ''}" data-tip="${esc(tip)}" onclick="assignPort('${sw.id}',${i})">
        ${lbl ? `<div class="pc-lbl">${esc(lbl)}</div>` : ''}
        <div class="pc-num">P${i}${isPoe?'<span style="color:#ffcc00" title="PoE">⚡</span>':''}</div>
        ${dev ? `<div class="pc-dev" style="color:${dc}">${esc(dev.name)}</div>` : ovr ? `<div class="pc-dev" style="color:${oc};opacity:.8">${esc(ovr)}</div>` : `<div class="pc-empty">—</div>`}
        <div class="pc-meta">
          ${fib ? fiberDotHtml(fib) : ''}
          ${viaBadge}
          ${vlan ? `<span class="port-vlan-tag" style="background:${vc}22;color:${vc}">V${vlan}</span>` : ''}
        </div>
      </div>`);
    }

    const usedVlans = [...new Set(Object.values(vlans).filter(Boolean))].sort((a,b)=>+a-+b);
    panelHtml = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin:12px 2px 10px">
        <div style="min-width:0">
          <div style="font-size:16px;font-weight:800;display:flex;align-items:center;gap:8px">
            <span style="width:12px;height:12px;border-radius:50%;background:${dtColor(sw.deviceType||'Misc.')};flex-shrink:0"></span>
            <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(sw.name)}</span>
          </div>
          <div style="font-size:11.5px;color:var(--text2);font-family:var(--mono);margin-top:3px">${esc(sw.manufacturer||'')} ${esc(sw.model||'')} · ${usedCount}/${portCount} used</div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="clearAllPorts('${sw.id}')">Clear All</button>
      </div>
      <div class="port-grid">${cells.join('')}</div>
      ${usedVlans.length > 0 ? `<div class="chip-row" style="margin-top:12px">
        ${usedVlans.map(v => { const vc = getVlanColor(v); return `<span class="filter-tab" style="border-color:${vc};color:${vc};pointer-events:none">VLAN ${v}</span>`; }).join('')}
      </div>` : ''}`;
  }

  document.getElementById('view-area').innerHTML = `
    <div class="pc-groups">${chips}</div>
    ${panelHtml}`;
  _wireRackHover();
}

function assignPort(switchId, portNum) {
  const p = getProject();
  const sw = p.devices.find(d => d.id === switchId);
  if (!sw) return;
  const circ = getPortCircuit(sw, portNum, p);
  const currVlan = (sw.portVlans||{})[portNum] || '';
  const currPeerPort = (sw.portPeerPort||{})[portNum] || '';
  const currLabel = (sw.portLabels||{})[portNum] || '';
  const isPanel = PANEL_LIKE(sw.deviceType || '');
  const isFiberEnc = sw.deviceType === 'Fiber Enclosure';
  const currOvr = (sw.portTypeOverride||{})[portNum] || '';
  const currFiber = (sw.portFiber||{})[portNum] || '';

  // Patch partners: from a switch port → panels/enclosures; from a panel port → switches/routers/etc.
  const patchCands = p.devices.filter(d => d.id !== switchId && (d.ports||0) > 0 && (isPanel
    ? (PORT_CAPABLE.has(d.deviceType||'') && !PANEL_LIKE(d.deviceType||''))
    : PANEL_LIKE(d.deviceType||'')));
  const patchIds = new Set(patchCands.map(d => d.id));
  const others = p.devices.filter(d => d.id !== switchId && !patchIds.has(d.id));

  // A mirrored link to a patch partner fills the patch section; the device
  // riding that circuit (or a plain assignment) fills the device picker.
  const currPatchDev = (circ.link && patchIds.has(circ.link.dev.id)) ? circ.link.dev : null;
  const currEndDev = currPatchDev ? circ.end : null;
  const currGenericDev = currPatchDev ? null : circ.assigned;
  const currDev = circ.content;
  const pickSelId = currEndDev?.id || currGenericDev?.id || '';

  const patchDevOpts = `<option value="">— Not patched —</option>` +
    patchCands.map(d => `<option value="${d.id}" ${currPatchDev?.id === d.id ? 'selected' : ''}>${esc(d.name)} (${Object.keys(d.portAssignments||{}).length}/${d.ports||0})</option>`).join('');

  const genericOpts = (() => {
    const byType = {};
    others.forEach(d => { const t = d.deviceType || 'Misc.'; if (!byType[t]) byType[t] = []; byType[t].push(d); });
    const typeOrder = ['Switch','Router','Firewall','Modem','Server','NAS','AP','PC/Workstation','IP Phone','IP Camera','Access Control','APC/UPS','Patch Panel','Misc Rack-Mounted','IoT Device','Printer','Fax Machine','Smartphone/Tablet','Misc.','Other'];
    const sorted = [...typeOrder.filter(t => byType[t]), ...Object.keys(byType).filter(t => !typeOrder.includes(t))];
    return sorted.map(type => {
      const devs = byType[type].sort((a,b) => (a.name||'').localeCompare(b.name||''));
      return `<optgroup label="${esc(type)}">` +
        devs.map(d => `<option value="${d.id}" ${d.id === pickSelId ? 'selected' : ''}>${esc(d.name)}${d.ip?' · '+esc(d.ip):''}</option>`).join('') +
        `</optgroup>`;
    }).join('');
  })();

  const [curFa, curFb] = currFiber.split('/');
  const fiberOpts = sel => `<option value="">—</option>` +
    FIBER_COLORS.map(c => `<option value="${c}" ${sel === c ? 'selected' : ''}>${c}</option>`).join('');
  const hasPortData = !!(circ.assigned || circ.end || currLabel || currVlan ||
    (sw.portNotes||{})[portNum] || (sw.portPoe||{})[portNum] || currOvr || currFiber);

  openModal(`
    <h3>Port ${portNum} — ${esc(sw.name)}${isPanel ? ` <span style="font-size:11px;color:var(--amber);font-family:var(--mono)">[${isFiberEnc ? 'Fiber' : 'Panel'}]</span>` : ''}</h3>
    <div class="form-row-inline">
      <div class="form-row"><label>Port Label</label>
        <input class="form-control" id="port-label" value="${esc(currLabel)}" placeholder="e.g. Rm 101"></div>
      <div class="form-row" style="flex:0 0 110px"><label>VLAN</label>
        <input class="form-control" id="port-vlan" value="${esc(currVlan)}" placeholder="10" type="number" min="1" max="4094" inputmode="numeric"></div>
    </div>
    <div class="form-row"><label>Port Type <span style="color:var(--text3)">(color-codes the port — no device needed)</span></label>
      <select class="form-control" id="port-type-ovr">
        <option value="">— Auto (from connected device) —</option>
        ${DEVICE_TYPES.map(t => `<option value="${t}" ${currOvr === t ? 'selected' : ''}>${t}</option>`).join('')}
      </select></div>
    ${isFiberEnc ? `
    <div class="form-row-inline">
      <div class="form-row"><label>🧵 Fiber Strand A</label>
        <select class="form-control" id="port-fiber-a">${fiberOpts(curFa === '—' ? '' : curFa)}</select></div>
      <div class="form-row"><label>🧵 Fiber Strand B</label>
        <select class="form-control" id="port-fiber-b">${fiberOpts(curFb === '—' ? '' : curFb)}</select></div>
    </div>` : ''}

    <div style="border:1px solid ${isPanel ? 'rgba(0,232,122,.3)' : 'rgba(232,160,32,.35)'};border-radius:12px;padding:12px 12px 4px;margin-bottom:13px">
      <div style="font-size:11px;font-family:var(--mono);text-transform:uppercase;letter-spacing:1px;color:${isPanel ? 'var(--green)' : '#e8a020'};margin-bottom:10px">
        ${isPanel ? '⇄ Patched to switch port' : '⊟ Patched to panel port'}
      </div>
      <div class="form-row-inline">
        <div class="form-row"><label>${isPanel ? 'Switch / Device' : 'Panel / Enclosure'}</label>
          <select class="form-control" id="port-patch-dev" onchange="onPatchDevChange('${switchId}',${portNum})">${patchDevOpts}</select></div>
        <div class="form-row" style="flex:0 0 42%"><label>Their Port</label>
          <select class="form-control" id="port-patch-port"></select></div>
      </div>
    </div>

    <div class="form-row"><label>Connected Device <span style="color:var(--text3)">(${isPanel ? 'camera / wall gear on this line' : 'attached, or riding the patched line'})</span></label>
      <select class="form-control" id="port-device" onchange="onPortDeviceChange(this,'${switchId}',${portNum})">
        <option value="">— Empty / Unassign —</option>
        <option value="__new__" style="color:var(--accent);font-weight:700">＋ New Device…</option>
        ${genericOpts}
      </select>
    </div>
    <div id="peer-port-section" style="display:none"></div>
    <div class="form-row"><label>Note</label>
      <textarea class="form-control" id="port-note" rows="2" placeholder="e.g. Uplink to floor 2" style="resize:vertical;font-family:inherit">${esc((sw.portNotes||{})[portNum]||'')}</textarea></div>
    ${!isPanel ? `<div style="display:flex;align-items:center;gap:10px;margin:4px 0 8px">
      <label style="display:flex;align-items:center;gap:10px;cursor:pointer;user-select:none">
        <input type="checkbox" id="port-poe" ${(sw.portPoe||{})[portNum] ? 'checked' : ''}>
        <span style="font-size:14px;font-weight:600;color:var(--text2)">⚡ PoE</span>
      </label>
    </div>` : ''}
    <div class="modal-actions">
      ${currDev ? `<button class="btn btn-ghost btn-sm" style="margin-right:auto;flex:0 0 auto" onclick="closeModal();editDevice('${currDev.id}')">⇢ ${esc(currDev.name.length > 14 ? currDev.name.slice(0,13)+'…' : currDev.name)}</button>` : ''}
      ${hasPortData ? `<button class="btn btn-ghost btn-sm" style="flex:0 0 auto;min-width:0${currDev ? '' : ';margin-right:auto'}" onclick="openMovePort('${switchId}',${portNum})" title="Move everything on this port to another port">⇄ Move</button>` : ''}
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="savePort('${switchId}',${portNum})">Save</button>
    </div>`);

  // Populate the patch-port list (and peer section) for the current state
  onPatchDevChange(switchId, portNum, currPatchDev ? circ.link.port : '');
  if (currGenericDev) onPortDeviceChange(document.getElementById('port-device'), switchId, portNum, currPeerPort);
}

// Fill the "their port" dropdown for the chosen patch partner, showing
// what's on each port so free ones are easy to spot.
function onPatchDevChange(switchId, portNum, preselect) {
  const p = getProject();
  const devId = document.getElementById('port-patch-dev')?.value || '';
  const portSel = document.getElementById('port-patch-port');
  const genericSel = document.getElementById('port-device');
  if (!portSel) return;
  const dev = devId ? p.devices.find(d => d.id === devId) : null;
  if (!dev) {
    portSel.innerHTML = '<option value="">—</option>';
    portSel.disabled = true;
    // Unpatched again — the picked device may need its own port select back
    if (genericSel && genericSel.value) onPortDeviceChange(genericSel, switchId, portNum);
    return;
  }
  portSel.disabled = false;
  // Patched: the far end is fixed by the link, so the riding device needs no port picker
  const peerSection = document.getElementById('peer-port-section');
  if (peerSection) { peerSection.style.display = 'none'; peerSection.innerHTML = ''; }
  let opts = '<option value="">— pick port —</option>';
  for (let i = 1; i <= (dev.ports || 0); i++) {
    const occId = (dev.portAssignments||{})[i];
    const lbl = (dev.portLabels||{})[i];
    let info = '';
    if (occId === switchId && (dev.portPeerPort||{})[i] == portNum) info = ' · this port';
    else if (occId || (dev.portEndDevice||{})[i]) {
      const occ = getPortCircuit(dev, i, p).content;
      info = occ ? ` · ${occ.name}` : ' · in use';
    }
    else info = ' · free';
    if (lbl) info = ` · ${lbl}${info === ' · free' ? '' : info}`;
    const selAttr = preselect && +preselect === i ? 'selected' : '';
    opts += `<option value="${i}" ${selAttr}>P${i}${esc(info)}</option>`;
  }
  portSel.innerHTML = opts;
}

function onPortDeviceChange(sel, switchId, portNum, preselect) {
  const p = getProject();
  const devId = sel.value;
  const dev = devId ? p.devices.find(d => d.id === devId) : null;
  const section = document.getElementById('peer-port-section');
  // When patched, the picked device rides the circuit — no own-port select needed
  const patched = !!document.getElementById('port-patch-dev')?.value;
  if (!section) return;
  if (devId === '__new__') {
    // Build a brand-new device right here; it gets assigned to this port on Save
    const owner = p.devices.find(d => d.id === switchId);
    const defType = PANEL_LIKE(owner?.deviceType || '') ? 'IP Camera' : 'Misc.';
    section.innerHTML = `
      <div style="border:1px solid rgba(0,200,255,.35);border-radius:12px;padding:12px 12px 2px;margin-bottom:13px">
        <div style="font-size:11px;font-family:var(--mono);text-transform:uppercase;letter-spacing:1px;color:var(--accent);margin-bottom:10px">＋ New device on this port</div>
        <div class="form-row-inline">
          <div class="form-row"><label>Name *</label>
            <input class="form-control" id="nd-name" placeholder="e.g. Cam Lobby NE"></div>
          <div class="form-row" style="flex:0 0 46%"><label>Type</label>
            <select class="form-control" id="nd-type">${DEVICE_TYPES.map(t => `<option value="${t}" ${t === defType ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        </div>
        <div class="form-row-inline">
          <div class="form-row"><label>IP <span style="color:var(--text3)">(optional)</span></label>
            <input class="form-control" id="nd-ip" placeholder="192.168.1.50" inputmode="decimal"></div>
          <div class="form-row"><label>MAC <span style="color:var(--text3)">(optional)</span></label>
            <input class="form-control" id="nd-mac" placeholder="00:11:22:33:44:55"></div>
        </div>
      </div>`;
    section.style.display = '';
    setTimeout(() => document.getElementById('nd-name')?.focus(), 50);
    return;
  }
  if (dev && (dev.ports||0) > 0 && !patched) {
    const opts = Array.from({length: dev.ports}, (_,i) => `<option value="${i+1}" ${preselect && +preselect === i+1 ? 'selected' : ''}>${i+1}</option>`).join('');
    section.innerHTML = `<div class="form-row"><label>Port on ${esc(dev.name)}</label>
      <select class="form-control" id="port-peer">
        <option value="">— Not specified —</option>${opts}
      </select></div>`;
    section.style.display = '';
  } else {
    section.style.display = 'none';
    section.innerHTML = '';
  }
}

function savePort(switchId, portNum) {
  const p = getProject();
  const sw = p.devices.find(d => d.id === switchId);
  if (!sw) return;
  if (!sw.portAssignments) sw.portAssignments = {};
  if (!sw.portNotes) sw.portNotes = {};
  if (!sw.portVlans) sw.portVlans = {};
  if (!sw.portPeerPort) sw.portPeerPort = {};
  if (!sw.portPoe) sw.portPoe = {};
  if (!sw.portEndDevice) sw.portEndDevice = {};

  const prevDevId   = sw.portAssignments[portNum] || null;
  // Patched port: the link lives in portAssignments (mirrored both sides) and
  // the picked device rides the circuit. Unpatched: the picked device IS the
  // assignment, exactly as before.
  const patchDevId  = document.getElementById('port-patch-dev')?.value || null;
  const patchPortRaw = document.getElementById('port-patch-port')?.value;
  let genDevId      = document.getElementById('port-device')?.value || null;
  const genPeerRaw  = document.getElementById('port-peer')?.value;
  if (genDevId === '__new__') {
    const ndName = document.getElementById('nd-name')?.value?.trim();
    if (!ndName) { toast('Name the new device first', 'error'); return; }
    const ndType = document.getElementById('nd-type')?.value || 'Misc.';
    const ndIp = document.getElementById('nd-ip')?.value?.trim() || '';
    const ndMac = document.getElementById('nd-mac')?.value?.trim() || '';
    // Same duplicate sanity check the device editor runs
    const macNorm = s => String(s || '').toLowerCase().replace(/[^a-f0-9]/g, '');
    const dups = [];
    if (ndIp) {
      const c = p.devices.find(d => (d.ip || '').trim() === ndIp);
      if (c) dups.push(`IP ${ndIp} is already on "${c.name}"`);
    }
    if (ndMac && macNorm(ndMac).length >= 6) {
      const c = p.devices.find(d => d.mac && macNorm(d.mac) === macNorm(ndMac));
      if (c) dups.push(`MAC ${ndMac} is already on "${c.name}"`);
    }
    if (dups.length && !confirm(`⚠ Possible duplicate:\n\n${dups.join('\n')}\n\nCreate anyway?`)) return;
    const nd = migrateDevice({
      id: genId(), name: ndName, deviceType: ndType,
      type: ndType === 'Switch' ? 'switching' : 'non-switching',
      ip: ndIp, mac: ndMac,
      manufacturer: '', model: '', notes: '',
      ports: ndType === 'Switch' ? 24 : 0,
      deviceUHeight: 1, rackId: null, rackU: null, status: '',
      portAssignments: {}, portNotes: {}, portVlans: {}, portPeerPort: {}, portPoe: {}, portLabels: {},
      addedDate: new Date().toISOString()
    });
    p.devices.push(nd);
    logChange(`Device added: ${ndName} (${ndType}) — created from ${sw.name} Port ${portNum}`);
    genDevId = nd.id;
  }
  const devId       = patchDevId || genDevId;
  const endDevId    = patchDevId ? genDevId : null;
  const peerPort    = patchDevId
    ? (patchPortRaw ? parseInt(patchPortRaw) : null)
    : (genPeerRaw ? parseInt(genPeerRaw) : null);
  const note        = document.getElementById('port-note')?.value?.trim() || null;
  const label       = document.getElementById('port-label')?.value?.trim() || null;
  const vlan        = document.getElementById('port-vlan')?.value?.trim() || null;
  const poe         = document.getElementById('port-poe')?.checked || false;

  // Remove old reverse link if device changed, peer port changed, or port cleared
  const prevPeerPort = (sw.portPeerPort||{})[portNum] || null;
  if (prevDevId && prevPeerPort) {
    const needsCleanup = !devId || prevDevId !== devId || (+prevPeerPort !== peerPort);
    if (needsCleanup) {
      const prevDev = p.devices.find(d => d.id === prevDevId);
      if (prevDev) {
        if (prevDev.portAssignments && prevDev.portAssignments[prevPeerPort] === switchId) {
          delete prevDev.portAssignments[prevPeerPort];
        }
        if (prevDev.portPeerPort && prevDev.portPeerPort[prevPeerPort] == portNum) {
          delete prevDev.portPeerPort[prevPeerPort];
        }
        if (prevDev.portEndDevice) delete prevDev.portEndDevice[prevPeerPort];
        logChange(`Port auto-cleared (reverse): ${prevDev.name} Port ${prevPeerPort}`);
      }
    }
  }

  if (devId) {
    sw.portAssignments[portNum] = devId;
    const dev = p.devices.find(d => d.id === devId);
    const vlanStr = vlan ? ` VLAN ${vlan}` : '';
    const peerStr = peerPort ? ` ↔ ${dev?dev.name:'?'} Port ${peerPort}` : '';
    logChange(`Port assigned: ${sw.name} Port ${portNum}${peerStr}${vlanStr} → ${dev?dev.name:'device'}`);

    if (peerPort && dev) {
      if (!dev.portAssignments) dev.portAssignments = {};
      if (!dev.portPeerPort) dev.portPeerPort = {};
      if (!dev.portVlans) dev.portVlans = {};
      const existingTarget = dev.portAssignments[peerPort];
      if (!existingTarget || existingTarget === switchId) {
        dev.portAssignments[peerPort] = switchId;
        dev.portPeerPort[peerPort] = portNum;
        if (vlan) dev.portVlans[peerPort] = vlan; else delete dev.portVlans[peerPort];
        logChange(`Port auto-linked (reverse): ${dev.name} Port ${peerPort} → ${sw.name} Port ${portNum}`);
      }
    }
  } else {
    delete sw.portAssignments[portNum];
    logChange(`Port cleared: ${sw.name} Port ${portNum}`);
  }

  // End device riding the circuit — recorded on the side just edited so there
  // is exactly one holder; getPortCircuit resolves it from either side.
  const prevEndId = sw.portEndDevice[portNum] || null;
  if (endDevId) sw.portEndDevice[portNum] = endDevId; else delete sw.portEndDevice[portNum];
  if (patchDevId && peerPort) {
    const pd = p.devices.find(d => d.id === patchDevId);
    if (pd && pd.portEndDevice) delete pd.portEndDevice[peerPort];
  }
  if (endDevId && endDevId !== prevEndId) {
    const ed = p.devices.find(d => d.id === endDevId);
    const ld = p.devices.find(d => d.id === patchDevId);
    if (ed) logChange(`Circuit: ${sw.name} Port ${portNum} ⇄ ${ld ? ld.name + (peerPort ? ' Port ' + peerPort : '') : '?'} carries ${ed.name}`);
  }

  if (!sw.portLabels) sw.portLabels = {};
  if (note)  sw.portNotes[portNum] = note;         else delete sw.portNotes[portNum];
  if (label) sw.portLabels[portNum] = label;       else delete sw.portLabels[portNum];
  if (vlan)  sw.portVlans[portNum] = vlan;         else delete sw.portVlans[portNum];
  if (peerPort) sw.portPeerPort[portNum] = peerPort; else delete sw.portPeerPort[portNum];
  if (poe) { sw.portPoe[portNum] = true; }
  else { delete sw.portPoe[portNum]; }

  // Manual port type (color without a connected device)
  const ovrEl = document.getElementById('port-type-ovr');
  if (ovrEl) {
    if (!sw.portTypeOverride) sw.portTypeOverride = {};
    const prevOvr = sw.portTypeOverride[portNum] || '';
    const ovr = ovrEl.value || '';
    if (ovr) sw.portTypeOverride[portNum] = ovr; else delete sw.portTypeOverride[portNum];
    if (ovr !== prevOvr) logChange(`Port type set: ${sw.name} Port ${portNum} → ${ovr || 'auto'}`);
  }
  // Fiber color pair (Fiber Enclosure ports)
  const fibAEl = document.getElementById('port-fiber-a');
  if (fibAEl) {
    if (!sw.portFiber) sw.portFiber = {};
    const fa = fibAEl.value || '', fb = document.getElementById('port-fiber-b')?.value || '';
    const prevFib = sw.portFiber[portNum] || '';
    const fib = (fa || fb) ? `${fa || '—'}/${fb || '—'}` : '';
    if (fib) sw.portFiber[portNum] = fib; else delete sw.portFiber[portNum];
    if (fib !== prevFib) logChange(`Fiber pair set: ${sw.name} Port ${portNum} → ${fib || 'cleared'}`);
  }

  save(); closeModal();
  if (state.currentView === 'racks') {
    renderRacks();
  } else {
    renderPorts();
  }
  toast('Port saved', 'success');
}

// ═══════════════════════════════════════════
//  CHANGE PORT — move everything on one port
//  (link, riding device, label, VLAN, notes,
//  PoE, fiber pair) to another port, fixing
//  the mirrored far side automatically.
// ═══════════════════════════════════════════
const _PORT_MAPS = ['portAssignments', 'portPeerPort', 'portEndDevice', 'portLabels', 'portNotes', 'portVlans', 'portPoe', 'portFiber', 'portTypeOverride'];

function openMovePort(switchId, portNum) {
  const p = getProject();
  const sw = p.devices.find(d => d.id === switchId);
  if (!sw) return;
  const devs = p.devices.filter(d => (d.ports || 0) > 0)
    .sort((a, b) => (a.name||'').localeCompare(b.name||'', undefined, { numeric: true }));
  openModal(`
    <h3>⇄ Change Port — ${esc(sw.name)} P${portNum}</h3>
    <p style="color:var(--text2);font-size:13px;margin-bottom:14px">Moves everything on this port — patch link, connected device, label, VLAN, notes — to another port. Handy when a cable gets moved to a different jack or switch.</p>
    <div class="form-row"><label>To Device</label>
      <select class="form-control" id="mp-dev" onchange="_movePortPorts('${switchId}',${portNum})">
        ${devs.map(d => `<option value="${d.id}" ${d.id === switchId ? 'selected' : ''}>${esc(d.name)}${PANEL_LIKE(d.deviceType||'') ? ' ⊟' : ''} (${Object.keys(d.portAssignments||{}).length}/${d.ports||0})</option>`).join('')}
      </select></div>
    <div class="form-row"><label>To Port</label>
      <select class="form-control" id="mp-port"></select></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="assignPort('${switchId}',${portNum})">‹ Back</button>
      <button class="btn btn-primary" onclick="confirmMovePort('${switchId}',${portNum})">Move</button>
    </div>`);
  _movePortPorts(switchId, portNum);
}

function _movePortPorts(switchId, portNum) {
  const p = getProject();
  const devId = document.getElementById('mp-dev')?.value;
  const dev = p.devices.find(d => d.id === devId);
  const sel = document.getElementById('mp-port');
  if (!dev || !sel) return;
  let opts = '';
  for (let i = 1; i <= (dev.ports || 0); i++) {
    if (dev.id === switchId && i === portNum) continue;
    const used = (dev.portAssignments || {})[i] || (dev.portEndDevice || {})[i];
    let info = ' · free';
    if (used) {
      const occ = getPortCircuit(dev, i, p).content;
      info = ` · ${occ ? occ.name : 'in use'}`;
    } else if ((dev.portLabels || {})[i]) info = ` · ${(dev.portLabels || {})[i]}`;
    opts += `<option value="${i}" ${used ? 'disabled' : ''}>P${i}${esc(info)}</option>`;
  }
  sel.innerHTML = opts || '<option value="">No ports</option>';
  const firstFree = [...sel.options].find(o => !o.disabled && o.value);
  if (firstFree) sel.value = firstFree.value;
}

function confirmMovePort(switchId, portNum) {
  const p = getProject();
  const sw = p.devices.find(d => d.id === switchId);
  const tgtId = document.getElementById('mp-dev')?.value;
  const tgtPort = parseInt(document.getElementById('mp-port')?.value);
  const tgt = p.devices.find(d => d.id === tgtId);
  if (!sw || !tgt || !tgtPort) return toast('Pick a destination port', 'error');
  if (tgt.id === sw.id && tgtPort === portNum) return toast('That is the same port', 'error');
  if ((tgt.portAssignments || {})[tgtPort] || (tgt.portEndDevice || {})[tgtPort]) {
    return toast(`P${tgtPort} on ${tgt.name} is already in use`, 'error');
  }
  const rawId = (sw.portAssignments || {})[portNum] || null;
  if (rawId && rawId === tgt.id) {
    return toast(`This port is patched to ${tgt.name} — it can't move onto that same device`, 'error');
  }

  _PORT_MAPS.forEach(k => {
    const src = sw[k] || {};
    if (src[portNum] !== undefined) {
      if (!tgt[k]) tgt[k] = {};
      tgt[k][tgtPort] = src[portNum];
      delete src[portNum];
    }
  });
  // Mirrored link: point the far side back at the port's new home
  const movedAssigned = (tgt.portAssignments || {})[tgtPort];
  const movedPeer = (tgt.portPeerPort || {})[tgtPort];
  if (movedAssigned && movedPeer) {
    const peer = p.devices.find(d => d.id === movedAssigned);
    if (peer && (peer.portAssignments || {})[movedPeer] === sw.id && (peer.portPeerPort || {})[movedPeer] == portNum) {
      peer.portAssignments[movedPeer] = tgt.id;
      peer.portPeerPort[movedPeer] = tgtPort;
    }
  }
  logChange(`Port moved: ${sw.name} Port ${portNum} → ${tgt.name} Port ${tgtPort} (link, device & settings)`);
  save(); closeModal();
  if (state.currentView === 'racks') renderRacks();
  else if (state.currentView === 'ports') { state.selectedSwitch = tgt.id; renderPorts(); }
  toast(`Moved to ${tgt.name} P${tgtPort}`, 'success');
}

function clearAllPorts(switchId) {
  if (!confirm('Clear all port assignments for this device?')) return;
  const p = getProject();
  const sw = p.devices.find(d => d.id === switchId);
  if (sw) {
    p.devices.forEach(d => {
      if (d.id === switchId) return;
      if (d.portAssignments) {
        Object.keys(d.portAssignments).forEach(k => {
          if (d.portAssignments[k] === switchId) {
            delete d.portAssignments[k];
            if (d.portPeerPort) delete d.portPeerPort[k];
          }
        });
      }
    });
    sw.portAssignments = {};
    sw.portNotes = {};
    sw.portVlans = {};
    sw.portPeerPort = {};
    sw.portLabels = {};
    sw.portPoe = {};
    sw.portEndDevice = {};
    sw.portFiber = {};
    sw.portTypeOverride = {};
    logChange(`All ports cleared: ${sw.name}`);
  }
  save(); renderPorts(); toast('Ports cleared');
}

// ═══════════════════════════════════════════
//  PORT LABEL SHEET (print)
// ═══════════════════════════════════════════
function printPortLabels(switchId) {
  const p = getProject();
  const sw = p.devices.find(d=>d.id===switchId);
  if (!sw) return;
  const portCount = sw.ports||24;
  const labels = sw.portLabels||{};
  const now = new Date().toLocaleDateString();

  const labelCss = `#print-host{font-family:Arial,sans-serif;font-size:9px;background:#fff;color:#111}
    #print-host h1{font-size:14px;margin:0 0 8px;border-bottom:2px solid #333;padding-bottom:6px}
    #print-host .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:0.1in;margin-top:0.1in}
    #print-host .label{border:1px solid #999;border-radius:3px;padding:4px 6px;height:0.85in;display:flex;flex-direction:column;justify-content:center;overflow:hidden;box-sizing:border-box;page-break-inside:avoid}
    #print-host .port-num{font-size:10px;font-weight:700;color:#333;margin-bottom:2px}
    #print-host .port-lbl{font-size:9px;color:#555;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #print-host .port-dev{font-size:8px;color:#777;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    @page{size:letter;margin:0.5in}`;

  let labelHtml = '';
  for(let i=1;i<=portCount;i++){
    const circ = getPortCircuit(sw, i, p);
    const connDev = circ.content;
    const via = circ.end && circ.link ? ` ⇄ ${circ.link.dev.name} P${circ.link.port}` : '';
    const lbl = labels[i]||'';
    const fib = (sw.portFiber||{})[i]||'';
    labelHtml += `<div class="label">
      <div class="port-num">Port ${i}</div>
      ${lbl?`<div class="port-lbl">${esc(lbl)}</div>`:'<div class="port-lbl" style="color:#ccc">—</div>'}
      ${connDev?`<div class="port-dev">→ ${esc(connDev.name + via)}</div>`:''}
      ${fib?`<div class="port-dev">Fiber: ${esc(fib)}</div>`:''}
    </div>`;
  }

  _printHtml(`Port Labels — ${sw.name}`,
    `<h1>${esc(sw.name)} — Port Labels &nbsp;<span style="font-size:11px;color:#777;font-weight:400">Printed: ${now}</span></h1>
     <div class="grid">${labelHtml}</div>`,
    labelCss);
}

// ═══════════════════════════════════════════
//  CABLE RUNS
// ═══════════════════════════════════════════
const CABLE_TYPES = ['Cat5e','Cat6','Cat6A','Fiber SM','Fiber MM','Coax','Other'];

function renderCableRuns() {
  const p = getProject();
  if (!p.cableRuns) p.cableRuns=[];
  const runs = p.cableRuns;
  const filterType = state.cableTypeFilter||'all';
  const filterRoom = (state.cableRoomFilter||'').toLowerCase();

  setTopbarActions('');
  setFab(`<button class="fab" onclick="addCableRun()" title="Add cable run">＋</button>`);

  let filtered = runs.filter(r=>{
    if(filterType!=='all' && r.type!==filterType) return false;
    if(filterRoom && !(r.fromRoom||'').toLowerCase().includes(filterRoom) && !(r.toRoom||'').toLowerCase().includes(filterRoom) && !(r.label||'').toLowerCase().includes(filterRoom) && !(r.notes||'').toLowerCase().includes(filterRoom)) return false;
    return true;
  });

  const byType={};
  runs.forEach(r=>{ byType[r.type||'Other']=(byType[r.type||'Other']||0)+1; });
  const verified = runs.filter(r=>r.verified).length;

  document.getElementById('view-area').innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:10px">
      <div class="search-box">
        <span style="color:var(--text3)">⌕</span>
        <input placeholder="Search runs…" value="${esc(state.cableRoomFilter||'')}" oninput="state.cableRoomFilter=this.value;renderCableRuns()">
      </div>
    </div>
    <div class="chip-row">
      <div class="filter-tab ${filterType==='all'?'active':''}" onclick="state.cableTypeFilter='all';renderCableRuns()">All (${runs.length})</div>
      ${CABLE_TYPES.filter(t=>byType[t]).map(t=>`<div class="filter-tab ${filterType===t?'active':''}" onclick="state.cableTypeFilter='${t}';renderCableRuns()">${esc(t)} (${byType[t]||0})</div>`).join('')}
      <div class="filter-tab" style="pointer-events:none;border-color:rgba(0,232,122,.4);color:var(--green)">✓ ${verified} verified</div>
    </div>
    ${filtered.length===0
      ? `<div class="empty-state"><div class="empty-icon">⇄</div><h3>No cable runs${runs.length?' match':' yet'}</h3><p>Track physical cable paths between rooms and patch panels.</p></div>`
      : `<div style="margin-top:8px">${filtered.map(r=>`
        <div class="list-card" onclick="editCableRun('${r.id}')">
          <div class="lc-title">
            ${r.color?`<span style="width:11px;height:11px;border-radius:50%;background:${esc(r.color)};flex-shrink:0;border:1px solid rgba(255,255,255,.25)"></span>`:''}
            <span class="t-name">${esc(r.label||'(unlabeled)')}</span>
          </div>
          <div class="lc-sub">${esc(r.fromRoom||'?')}${r.fromPort?` <span style="color:var(--text3)">P${esc(r.fromPort)}</span>`:''} → ${esc(r.toRoom||'?')}${r.toPort?` <span style="color:var(--text3)">P${esc(r.toPort)}</span>`:''}</div>
          ${r.notes ? `<div class="lc-sub" style="color:var(--text3)">${esc(r.notes)}</div>` : ''}
          <div class="lc-chips">
            <span class="cable-type-badge">${esc(r.type||'—')}</span>
            ${r.length?`<span class="badge badge-gray">${esc(r.length)}</span>`:''}
            ${(() => { const mf = smRunMappedFloors(r.id); return mf.length ? `<span class="badge badge-green" onclick="event.stopPropagation();openMapStudio('${mf[0].id}')">🗺 ${esc(mf[0].name)}</span>` : ''; })()}
          </div>
          <div class="lc-side">
            <label class="cr-verify" onclick="event.stopPropagation()">
              <input type="checkbox" ${r.verified?'checked':''} onchange="toggleCableVerified('${r.id}',this.checked)"> ✓
            </label>
          </div>
        </div>`).join('')}</div>`}`;
}

function toggleCableVerified(id, val) {
  const p=getProject();
  const r=(p.cableRuns||[]).find(x=>x.id===id);
  if(r){r.verified=val;logChange(`Cable run ${r.label||id}: verified=${val}`);save();renderCableRuns();}
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
      <div class="form-row" style="flex:0 0 100px"><label>Port</label>
        <input class="form-control" id="cr-fromport" value="${esc(r?.fromPort||'')}" placeholder="P12"></div>
    </div>
    <div class="form-row-inline">
      <div class="form-row"><label>To Room</label>
        <input class="form-control" id="cr-toroom" value="${esc(r?.toRoom||'')}" placeholder="MDF"></div>
      <div class="form-row" style="flex:0 0 100px"><label>Port</label>
        <input class="form-control" id="cr-toport" value="${esc(r?.toPort||'')}" placeholder="P24"></div>
    </div>
    <div class="form-row-inline">
      <div class="form-row"><label>Length</label>
        <input class="form-control" id="cr-length" value="${esc(r?.length||'')}" placeholder="100ft"></div>
      <div class="form-row" style="flex:0 0 100px"><label>Color</label>
        <input type="color" class="form-control" id="cr-color" value="${r?.color||'#4488ff'}" style="height:46px;padding:4px"></div>
    </div>
    <div class="form-row"><label>Notes</label>
      <textarea class="form-control" id="cr-notes" rows="2">${esc(r?.notes||'')}</textarea></div>
    <div class="modal-actions">
      ${id ? `<button class="btn btn-danger" style="margin-right:auto;flex:0 0 auto;min-width:0" onclick="closeModal();deleteCableRun('${id}')">✕</button>` : ''}
      ${id ? `<button class="btn btn-ghost" onclick="closeModal();smMapRun('${id}')">🗺 Map It</button>` : ''}
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveCableRun('${id||''}')">Save</button>
    </div>`);
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
  let newId = null;
  if(id){
    const idx=p.cableRuns.findIndex(x=>x.id===id);
    if(idx>=0){Object.assign(p.cableRuns[idx],data);logChange(`Cable run updated: ${data.label||id}`);}
  } else {
    newId = genId();
    p.cableRuns.push({id:newId,...data});
    logChange(`Cable run added: ${data.label||'(unlabeled)'} ${data.fromRoom}→${data.toRoom}`);
  }
  save(); closeModal();
  if (state.currentView === 'cableruns') renderCableRuns();
  toast(id?'Cable run updated':'Cable run added','success');
  // Offer to draw a brand-new run on a floor plan
  if (newId) {
    openModal(`
      <h3>🗺 Map this run?</h3>
      <p style="color:var(--text2);font-size:13.5px;margin-bottom:16px">Draw "${esc(data.label||'this cable run')}" on a floor plan so you can find it later.</p>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="closeModal()">Not now</button>
        <button class="btn btn-primary" onclick="closeModal();smMapRun('${newId}')">🗺 Map It</button>
      </div>`);
  }
}

function deleteCableRun(id) {
  if(!confirm('Delete this cable run?')) return;
  const p=getProject();
  const r=(p.cableRuns||[]).find(x=>x.id===id);
  if(r) logChange(`Cable run deleted: ${r.label||id}`);
  p.cableRuns=(p.cableRuns||[]).filter(x=>x.id!==id);
  save();
  if (state.currentView === 'cableruns') renderCableRuns();
  toast('Deleted');
}
