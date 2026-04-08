function renderRacks() {
  setTopbarActions(`
    <button class="btn btn-ghost btn-sm" onclick="addPatchPanel()">⊟ New Patch Panel</button>
    <button class="btn btn-primary btn-sm" onclick="addRack()">+ New Rack</button>`);
  const p = getProject();
  const poolDevs = p.devices.filter(d => RACK_MOUNTABLE.has(d.deviceType||'Misc.') && !d.rackId);

  let html = `<div class="rack-layout">
    <div class="device-pool">
      <h3>Unassigned <span style="font-weight:400;color:var(--text3)">(${poolDevs.length})</span></h3>
      ${poolDevs.length === 0
        ? `<div style="color:var(--text3);font-size:12px;padding:10px 0">All rack-mountable devices assigned.</div>`
        : poolDevs.map(d => {
            const c = dtColor(d.deviceType||'Misc.');
            return `<div class="pool-device" data-device-id="${d.id}" draggable="true"
              ondragstart="onDragStart(event,'${d.id}',null)"
              ondragend="onDragEnd(event)">
              <div class="dname" style="color:${c}">${esc(d.name)}</div>
              <div class="dtype" style="margin-top:3px">${dtBadge(d.deviceType||'Misc.')}</div>
            </div>`;
          }).join('')}
      ${buildTemplatePanel()}
    </div>
    <div class="rack-area" id="rack-area">`;

  if (p.racks.length === 0) {
    html += `<div class="empty-state" style="flex:1"><div class="empty-icon">▤</div><h3>No racks yet</h3><p>Create a rack to start assigning devices.</p><br><button class="btn btn-primary" onclick="addRack()">+ New Rack</button></div>`;
  } else {
    // ── Greedy column-packing (shortest-column-first) ──
    // Estimate pixel height of each rack so short ones pack beside tall ones.
    function estimateRackPx(r) {
      const HEADER = 54, BODY_PAD = 20, UNIT_H = 36, VLAN_BAR = 36;
      let slotRows = 0;
      for (let u = 1; u <= r.uHeight; u++) {
        const dev = p.devices.find(d => d.rackId === r.id && d.rackU === u);
        const isCont = !dev && p.devices.some(d =>
          d.rackId === r.id && d.rackU && d.rackU < u && u < d.rackU + (d.deviceUHeight||1)
        );
        if (!isCont) slotRows++;
      }
      const hasVlan = p.devices.some(d => d.rackId === r.id && Object.keys(d.portVlans||{}).length > 0);
      return HEADER + BODY_PAD + slotRows * UNIT_H + (hasVlan ? VLAN_BAR : 0);
    }

    // Decide number of columns based on available space.
    // view-area is already in the DOM; subtract pool width (220px) + gaps.
    const viewAreaEl = document.getElementById('view-area');
    const areaW = viewAreaEl ? Math.max(0, viewAreaEl.offsetWidth - 260) : (window.innerWidth - 480);
    const MIN_COL_W = 560;
    const numCols = Math.max(1, Math.min(p.racks.length, Math.floor((areaW + 20) / (MIN_COL_W + 20))));

    const cols = Array.from({ length: numCols }, () => ({ racks: [], height: 0 }));
    // Sort racks tallest-first so big ones get placed first (better packing)
    const sorted = [...p.racks].sort((a, b) => estimateRackPx(b) - estimateRackPx(a));
    sorted.forEach(r => {
      const shortest = cols.reduce((m, c) => c.height < m.height ? c : m, cols[0]);
      shortest.racks.push(r);
      shortest.height += estimateRackPx(r) + 20;
    });

    cols.forEach(col => {
      html += `<div class="rack-col">`;
      col.racks.forEach(r => { html += buildRackHTML(r, p); });
      html += `</div>`;
    });
  }
  html += `</div></div>`;
  document.getElementById('view-area').innerHTML = html;

  // Auto-scroll when dragging near edges
  const va = document.getElementById('view-area');
  if (va) {
    va.addEventListener('dragover', (e) => {
      const rect = va.getBoundingClientRect();
      const ZONE = 80;
      if (e.clientY > rect.bottom - ZONE) va.scrollTop += 12;
      else if (e.clientY < rect.top + ZONE) va.scrollTop -= 12;
    });
  }
}

// getVlanColor is in core.js

function buildRackPortSquares(dev, p) {
  const portCount = dev.ports || 0;
  if (portCount === 0) return '';
  const assignments = dev.portAssignments || {};
  const vlans = dev.portVlans || {};
  const labels = dev.portLabels || {};
  const topRow = [], botRow = [];
  for (let i = 1; i <= portCount; i++) (i % 2 === 1 ? topRow : botRow).push(i);
  function renderSqs(ports) {
    return ports.map(i => {
      const connDev = assignments[i] ? (p.devices.find(d => d.id === assignments[i]) || null) : null;
      const assigned = !!connDev;
      const dc = assigned ? dtColor(connDev.deviceType || 'Misc.') : null;
      const vc = getVlanColor(vlans[i] || '1');
      const mac4 = connDev?.mac ? connDev.mac.replace(/[:\-]/g,'').slice(-4).toUpperCase() : '';
      const title = assigned
        ? `Port ${i} · ${connDev.name}${vlans[i] ? ' · VLAN ' + vlans[i] : ''}`
        : `Port ${i}${vlans[i] ? ' · VLAN ' + vlans[i] : ''}`;
      const hasLabel = !!(labels[i]);
      const style = assigned
        ? `border-color:${dc};background:${dc};box-shadow:0 0 4px ${dc}88;`
        : hasLabel
          ? `border-color:var(--accent);box-shadow:0 0 3px rgba(0,232,122,0.6);`
          : (vlans[i] ? `border-color:${vc};` : '');
      const dataAttrs = assigned
        ? `data-owner-id="${dev.id}" data-portidx="${i}" data-devid="${connDev.id}" data-portlabel="Port ${i} · ${esc(dev.name)}" data-devname="${esc(connDev.name)}" data-devip="${esc(connDev.ip||'')}" data-devmac="${esc(connDev.mac||'')}"`
        : `data-owner-id="${dev.id}" data-portidx="${i}" data-portnum="Port ${i} · ${esc(dev.name)}"`;
      return `<div class="rack-port-sq" ${dataAttrs} style="${style}" onclick="event.stopPropagation();assignPort('${dev.id}',${i})"></div>`;
    }).join('');
  }
  return `<div class="rack-port-grid">
    <div class="rack-port-row">${renderSqs(topRow)}</div>
    ${botRow.length ? `<div class="rack-port-row">${renderSqs(botRow)}</div>` : ''}
  </div>`;
}

function buildPatchPanelFaceplate(dev, p) {
  const portCount = dev.ports || 24;
  const assignments = dev.portAssignments || {};
  const labels      = dev.portLabels      || {};
  const notes       = dev.portNotes       || {};
  const c = dtColor('Patch Panel');
  const PORTS_PER_ROW = 12;

  // Build all port elements first
  const portEls = [];
  for (let i = 1; i <= portCount; i++) {
    const connDev = assignments[i] ? (p.devices.find(d => d.id === assignments[i]) || null) : null;
    const assigned = !!connDev;
    const dc = assigned ? dtColor(connDev.deviceType || 'Misc.') : null;
    const label = labels[i] || '';
    const note  = notes[i]  || '';
    const displayLabel = label || (assigned ? (connDev.name.length > 5 ? connDev.name.slice(0,5)+'…' : connDev.name) : String(i));
    const titleParts = [`Port ${i}`];
    if (label) titleParts.push(`Label: ${label}`);
    if (connDev) titleParts.push(`→ ${connDev.name} (${connDev.deviceType||''})`);
    if (note) titleParts.push(`Note: ${note}`);
    const title = titleParts.join(' · ');
    const clrStyle = assigned ? `--clr:${dc};` : '';
    const dataAttrs = assigned
      ? `data-owner-id="${dev.id}" data-portidx="${i}" data-devid="${connDev.id}" data-portlabel="Port ${i}${label?' · '+label:''} · ${esc(dev.name)}" data-devname="${esc(connDev.name)}" data-devip="${esc(connDev.ip||'')}" data-devmac="${esc(connDev.mac||'')}"`
      : `data-owner-id="${dev.id}" data-portidx="${i}" data-portnum="Port ${i}${label?' · '+esc(label):''} · ${esc(dev.name)}"`;
    const labelBold = (!assigned && label) ? 'font-weight:700;' : '';
    portEls.push(`<div class="pp-port${assigned?' pp-assigned':(!assigned&&label?' pp-labeled':'')}" style="${clrStyle}" ${dataAttrs} onclick="event.stopPropagation();assignPort('${dev.id}',${i})">
      <div class="pp-port-num">${i}</div>
      <div class="pp-port-jack"></div>
      <div class="pp-port-label" style="${labelBold}">${esc(label || (assigned ? (connDev.name.length>5?connDev.name.slice(0,4)+'…':connDev.name) : ''))}</div>
    </div>`);
  }

  // Group into rows of PORTS_PER_ROW
  let rowsHtml = '';
  for (let r = 0; r < portEls.length; r += PORTS_PER_ROW) {
    rowsHtml += `<div class="pp-row">${portEls.slice(r, r + PORTS_PER_ROW).join('')}</div>`;
  }
  return `<div class="pp-faceplate">${rowsHtml}</div>`;
}

function buildFiberEnclosureFaceplate(dev) {
  const pairs = dev.fiberPairs || 6;
  const c = dtColor('Fiber Enclosure');
  const labeled = Object.keys(dev.fiberLabels || {}).length;
  const labelNote = labeled ? ` · ${labeled} labeled` : '';
  return `<div style="display:flex;align-items:center;gap:6px;padding:0 8px;flex:1;min-width:0">
    <span style="font-size:10px;font-family:var(--mono);color:${c}">${pairs} pair${labelNote}</span>
  </div>`;
}

function buildRackHTML(rack, p) {
  const isAsc = rack.uDirection === 'asc';
  const dirLabel = isAsc ? '↑ U1 Bottom' : '↓ U1 Top';
  let html = `<div class="rack-container" id="rack-${rack.id}">
    <div class="rack-header">
      <div class="rack-header-left">
        <h3>${esc(rack.name)}</h3>
        <p>${esc(rack.location||'No location')} &nbsp;·&nbsp; ${rack.uHeight}U &nbsp;·&nbsp; <span style="font-size:10px;color:var(--text3)">${dirLabel}</span></p>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-ghost btn-sm btn-icon" onclick="editRack('${rack.id}')" title="Edit rack">✎</button>
        <button class="btn btn-danger btn-sm btn-icon" onclick="deleteRack('${rack.id}')" title="Delete rack">✕</button>
      </div>
    </div>
    <div class="rack-body">`;
  // Build U iteration order: ascending = U shown high-to-low (uHeight at top, 1 at bottom)
  const uOrder = [];
  if (isAsc) {
    for (let u = rack.uHeight; u >= 1; u--) uOrder.push(u);
  } else {
    for (let u = 1; u <= rack.uHeight; u++) uOrder.push(u);
  }
  for (const u of uOrder) {
    const dev = p.devices.find(d => d.rackId === rack.id && d.rackU === u);
    const dc = dev ? dtColor(dev.deviceType||'Misc.') : '';
    const uh = dev ? Math.max(1, dev.deviceUHeight || 1) : 1;
    // If this u is a continuation slot for a multi-U device above, skip it
    const isContinuation = !dev && p.devices.some(d =>
      d.rackId === rack.id && d.rackU && d.rackU < u && u < d.rackU + (d.deviceUHeight||1)
    );
    if (isContinuation) continue;
    const isPP = dev && dev.deviceType === 'Patch Panel';
    const isFE = dev && dev.deviceType === 'Fiber Enclosure';
    // Patch panels: fixed 12 ports per row, each row ~32px tall + 3px gap, 8px padding top+bottom
    const ppRows = isPP ? Math.ceil((dev.ports||24) / 12) : 0;
    const ppNaturalH = isPP ? ppRows * 32 + (ppRows - 1) * 3 + 8 : 0;
    const slotNaturalH = uh * 28 + (uh - 1) * 2;
    const ppExtraH = isPP ? Math.max(0, ppNaturalH - slotNaturalH) : 0;
    const slotH = (uh > 1 || ppExtraH > 0)
      ? `style="height:${uh * 28 + (uh - 1) * 2 + ppExtraH}px;min-height:${uh * 28 + (uh - 1) * 2 + ppExtraH}px"`
      : '';
    html += `<div class="rack-unit" ${(uh > 1 || ppExtraH > 0) ? `style="height:${uh * 28 + (uh - 1) * 2 + ppExtraH}px"` : ''}>
      <div class="rack-u-num">${u}${uh>1?`<span style="font-size:9px;color:var(--text3);display:block;margin-top:1px">${uh}U</span>`:''}</div>
      <div class="rack-slot ${dev?'occupied':''}" id="slot-${rack.id}-${u}" ${slotH}
           ondragover="onSlotDragOver(event,'${rack.id}',${u})"
           ondragleave="onSlotDragLeave(event)"
           ondrop="onSlotDrop(event,'${rack.id}',${u})"
           ${!dev ? `ondblclick="addDeviceToRack('${rack.id}',${u})" title="Double-click to add device at U${u}"` : ''}>
        ${dev ? `
          ${dev.status ? `<span class="status-dot-rack" style="background:${STATUS_COLORS[dev.status]||'#778899'}" title="${esc(STATUS_LABELS[dev.status]||dev.status)}"></span>` : ''}
          <div class="slot-label" style="color:${dc};cursor:grab;display:flex;align-items:center;gap:5px;${isPP?'min-width:90px;max-width:90px;':''}flex-shrink:0"
               draggable="true"
               ondblclick="event.stopPropagation();editDevice('${dev.id}')"
               ondragstart="onDragStart(event,'${dev.id}','${rack.id}')"
               ondragend="onDragEnd(event)">
            <span style="width:8px;height:8px;border-radius:50%;background:${dc};flex-shrink:0"></span>
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(dev.name)}</span>
          </div>
          ${isPP ? buildPatchPanelFaceplate(dev, p) : isFE ? buildFiberEnclosureFaceplate(dev) : buildRackPortSquares(dev, p)}
          <button class="slot-remove" onclick="removeFromRack('${dev.id}',event)" title="Remove from rack">✕</button>
        ` : ''}
      </div>
    </div>`;
  }
  html += `</div>`;
  const allDevs = p.devices.filter(d => d.rackId === rack.id && (d.ports||0) > 0);
  const vlanSet = new Set();
  allDevs.forEach(d => Object.values(d.portVlans||{}).forEach(v => { if(v) vlanSet.add(String(v)); }));
  if (vlanSet.size > 0) {
    html += `<div style="padding:6px 10px 10px;display:flex;flex-wrap:wrap;gap:6px;border-top:1px solid var(--border)">
      <span style="font-size:10px;color:var(--text3);font-family:var(--mono);align-self:center">VLAN:</span>`;
    [...vlanSet].sort((a,b)=>+a-+b).forEach(v => {
      html += `<span style="font-size:10px;font-family:var(--mono);padding:1px 6px;border-radius:3px;border:1.5px solid ${getVlanColor(v)};color:${getVlanColor(v)}">VLAN ${v}</span>`;
    });
    html += `</div>`;
  }
  html += `</div>`;
  return html;
}

function onDragStart(e, deviceId, fromRackId) {
  state.dragDevice = deviceId;
  state.dragFromRack = fromRackId || null;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', deviceId);
  setTimeout(() => {
    const el = document.querySelector(`[data-device-id="${deviceId}"]`);
    if (el) el.classList.add('dragging');
    if (fromRackId) {
      const p = getProject();
      const dev = p.devices.find(d => d.id === deviceId);
      if (dev) {
        const slot = document.getElementById(`slot-${dev.rackId}-${dev.rackU}`);
        if (slot) slot.classList.add('rack-dragging-source');
      }
    }
  }, 0);
}
function onDragEnd(e) {
  state.dragDevice = null;
  state.dragFromRack = null;
  document.querySelectorAll('.pool-device').forEach(el => el.classList.remove('dragging'));
  document.querySelectorAll('.rack-dragging-source').forEach(el => el.classList.remove('rack-dragging-source'));
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
}
function onSlotDragOver(e, rackId, u) {
  e.preventDefault(); e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  const slot = document.getElementById(`slot-${rackId}-${u}`);
  if (slot) slot.classList.add('drag-over');
}
function onSlotDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}
function onSlotDrop(e, rackId, u) {
  e.preventDefault();
  const deviceId = e.dataTransfer.getData('text/plain') || state.dragDevice;
  const slot = document.getElementById(`slot-${rackId}-${u}`);
  if (slot) slot.classList.remove('drag-over');
  if (!deviceId) return;
  const p = getProject();
  const dev = p.devices.find(d => d.id === deviceId);
  if (!dev) return;
  if (!RACK_MOUNTABLE.has(dev.deviceType||'Misc.')) return toast(`${dev.deviceType} devices cannot be rack-mounted`, 'error');
  const targetRack = p.racks.find(r => r.id === rackId);
  // Check if device fits and doesn't overlap with other multi-U devices
  const devUH = dev.deviceUHeight || 1;
  if (targetRack && u + devUH - 1 > targetRack.uHeight) return toast(`${dev.name} (${devUH}U) doesn't fit at U${u} — rack is only ${targetRack.uHeight}U`, 'error');
  for (let cu = u; cu < u + devUH; cu++) {
    const blocker = p.devices.find(d => d.id !== deviceId && d.rackId === rackId && d.rackU && d.rackU <= cu && cu < d.rackU + (d.deviceUHeight||1));
    if (blocker && blocker.rackU !== u) return toast(`U${cu} is occupied by ${blocker.name}`, 'error');
  }
  const existing = p.devices.find(d => d.rackId === rackId && d.rackU === u && d.id !== deviceId);
  const oldRack = dev.rackId ? p.racks.find(r => r.id === dev.rackId) : null;
  const oldU = dev.rackU;
  if (existing) {
    const exOldRack = p.racks.find(r => r.id === existing.rackId);
    existing.rackId = dev.rackId || null;
    existing.rackU  = dev.rackId ? dev.rackU : null;
    logChange(`Rack swap: ${existing.name} moved to ${exOldRack ? exOldRack.name + ' U' + dev.rackU : 'unassigned'}`);
  }
  if (oldRack && (oldRack.id !== rackId || oldU !== u)) {
    logChange(`Rack move: ${dev.name} — ${oldRack.name} U${oldU} → ${targetRack ? targetRack.name : rackId} U${u}`);
  } else if (!oldRack) {
    logChange(`Rack assigned: ${dev.name} → ${targetRack ? targetRack.name : rackId} U${u}`);
  }
  dev.rackId = rackId;
  dev.rackU = u;
  save(); renderRacks();
}

function rackPortHover(el, e) {
  const devId   = el.dataset.devid;
  const ownerId = el.dataset.ownerId;
  const portIdx = el.dataset.portidx;

  el.classList.add('port-hl');

  if (devId && ownerId && portIdx) {
    // Highlight only the specific peer port on the connected device
    const proj = getProject();
    const ownerDev = proj.devices.find(d => d.id === ownerId);
    if (ownerDev) {
      const peerPortNum = (ownerDev.portPeerPort || {})[portIdx];
      if (peerPortNum) {
        const peerEl = document.querySelector(`[data-owner-id="${devId}"][data-portidx="${peerPortNum}"]`);
        if (peerEl) peerEl.classList.add('port-hl');
      }
    }
  }

  const tip = document.getElementById('rack-port-tooltip');
  if (!tip) return;
  const portLabel = el.dataset.portlabel || el.dataset.portnum || '';
  const devName   = el.dataset.devname  || '';
  const devIp     = el.dataset.devip    || '';
  const devMac    = el.dataset.devmac   || '';

  if (devId && devName) {
    tip.innerHTML = `
      <div class="rpt-port">${esc(portLabel)}</div>
      <div class="rpt-name">${esc(devName)}</div>
      ${devIp  ? `<div class="rpt-ip">⬡ ${esc(devIp)}</div>` : ''}
      ${devMac ? `<div class="rpt-mac">${esc(devMac)}</div>` : ''}
    `;
  } else {
    tip.innerHTML = `
      <div class="rpt-port">${esc(portLabel)}</div>
      <div style="color:var(--text3);font-size:10px;margin-top:2px">Not connected</div>
    `;
  }
  tip.style.display = 'block';
  positionRackTooltip(e);
}

function rackPortLeave(el) {
  document.querySelectorAll('.port-hl').forEach(p => p.classList.remove('port-hl'));
  const tip = document.getElementById('rack-port-tooltip');
  if (tip) tip.style.display = 'none';
  // Remove the per-element mousemove listener added during hover
  if (el && el._rackTipMove) {
    el.removeEventListener('mousemove', el._rackTipMove);
    el._rackTipMove = null;
  }
}

function positionRackTooltip(e) {
  const tip = document.getElementById('rack-port-tooltip');
  if (!tip) return;
  const xOff = 18, yOff = 28; // push down more to clear browser native tooltip
  const tw = tip.offsetWidth || 200, th = tip.offsetHeight || 80;
  let x = e.clientX + xOff, y = e.clientY + yOff;
  if (x + tw > window.innerWidth  - 10) x = e.clientX - tw - xOff;
  if (y + th > window.innerHeight - 10) y = e.clientY - th - 10;
  tip.style.left = x + 'px';
  tip.style.top  = y + 'px';
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

let _pendingRackAssign = null;

function addDeviceToRack(rackId, u) {
  _pendingRackAssign = { rackId, u };
  const typeOpts = ['Switch','Router','Firewall','Server','NAS','APC/UPS','Patch Panel','Misc Rack-Mounted','Modem','Access Control']
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
      <div class="form-row" style="flex:0 0 80px"><label>U Height</label>
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
  // Check slot is still free and device fits
  const targetRack = p.racks.find(r => r.id === rackId);
  if (targetRack && u + uheight - 1 > targetRack.uHeight) return toast(`${uheight}U device doesn't fit at U${u} — rack is only ${targetRack.uHeight}U`, 'error');
  for (let cu = u; cu < u + uheight; cu++) {
    const blocker = p.devices.find(d => d.rackId === rackId && d.rackU && d.rackU <= cu && cu < d.rackU + (d.deviceUHeight||1));
    if (blocker) return toast(`U${cu} is occupied by ${blocker.name}`, 'error');
  }
  const dev = {
    id: genId(), name, deviceType: type,
    type: type === 'Switch' ? 'switching' : 'non-switching',
    ip: '', mac: '', manufacturer: '', model: '', notes: '',
    ports: type === 'Switch' ? 24 : type === 'Patch Panel' ? 24 : 0,
    deviceUHeight: uheight, rackId, rackU: u,
    portAssignments: {}, portNotes: {}, portVlans: {}, portPeerPort: {}, portPoe: {}, portLabels: {},
    webUser: '', webPassword: '', webProtocol: 'https', parentDeviceId: '',
    status: '', serial: '', warrantyExpiry: '', eolDate: '',
    addedDate: new Date().toISOString()
  };
  p.devices.push(dev);
  logChange(`Device added to rack at U${u}: ${name}`);
  save(); closeModal(); renderRacks();
  toast(`"${name}" added at U${u} — double-click it to edit details`, 'success');
  _pendingRackAssign = null;
}

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
      <input class="form-control" id="r-name" value="${esc(r?.name||'')}" placeholder="e.g. Rack-A1"></div>
    <div class="form-row-inline">
      <div class="form-row"><label>U Height</label>
        <input class="form-control" id="r-height" type="number" min="4" max="56" value="${r?.uHeight||42}" placeholder="42"></div>
      <div class="form-row"><label>Location</label>
        <input class="form-control" id="r-loc" value="${esc(r?.location||'')}" placeholder="Server Room A"></div>
    </div>
    <div class="form-row"><label>U Numbering Direction</label>
      <select class="form-control" id="r-udir">
        <option value="desc" ${curDir==='desc'?'selected':''}>U1 at Top (descending)</option>
        <option value="asc" ${curDir==='asc'?'selected':''}>U1 at Bottom (ascending)</option>
      </select>
      <span style="font-size:10px;color:var(--text3);margin-top:3px;display:block">${curDir === 'asc' ? 'U1 is at the bottom of the rack, numbering goes up' : 'U1 is at the top of the rack, numbering goes down'}</span>
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

// ─── Focus rack from dashboard cross-page navigation ───
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
