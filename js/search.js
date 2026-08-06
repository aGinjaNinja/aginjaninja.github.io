// ═══════════════════════════════════════════
//  GLOBAL SEARCH — devices (with connections,
//  rack, maps, tagged photos), racks, cable
//  runs, photos, notes and site maps.
// ═══════════════════════════════════════════

let _searchDebounce = null;
let _searchLastQ = '';

function openSearch() {
  if (document.getElementById('search-overlay')) return;
  const el = document.createElement('div');
  el.id = 'search-overlay';
  el.innerHTML = `
    <div class="srch-top">
      <button class="icon-btn" onclick="closeSearch()" title="Close">←</button>
      <div class="search-box" style="flex:1">
        <span style="color:var(--text3)">⌕</span>
        <input id="srch-input" placeholder="Name, IP, MAC, room, note — anything…"
          oninput="_searchInput(this.value)" autocomplete="off" autocapitalize="off">
      </div>
      <button class="icon-btn" onclick="document.getElementById('srch-input').value='';_searchInput('')" title="Clear">✕</button>
    </div>
    <div class="srch-results" id="srch-results">
      <div class="empty-state" style="padding-top:80px">
        <div class="empty-icon">⌕</div>
        <h3>Search everything</h3>
        <p>Try part of a MAC (“b7:d8”), an IP, a device or room name,<br>a manufacturer, a note — matches show connections,<br>rack spots, maps and photos.</p>
      </div>
    </div>`;
  document.body.appendChild(el);
  if (_searchLastQ) {
    const inp = document.getElementById('srch-input');
    inp.value = _searchLastQ;
    _runSearch(_searchLastQ);
  }
  setTimeout(() => document.getElementById('srch-input')?.focus(), 80);
}

function closeSearch() {
  document.getElementById('search-overlay')?.remove();
}

function _searchInput(val) {
  clearTimeout(_searchDebounce);
  _searchDebounce = setTimeout(() => _runSearch(val), 220);
}

// ── Matching helpers ──
function _sNorm(s) { return String(s || '').toLowerCase(); }
function _sMac(s) { return _sNorm(s).replace(/[^a-f0-9]/g, ''); }

function _sMatches(tokens, hay, macHay) {
  return tokens.every(t => {
    if (hay.includes(t)) return true;
    const tm = _sMac(t);
    return tm.length >= 2 && macHay && macHay.includes(tm);
  });
}

function _runSearch(q) {
  _searchLastQ = q;
  const out = document.getElementById('srch-results');
  if (!out) return;
  const query = _sNorm(q).trim();
  if (query.length < 2) {
    out.innerHTML = `<div class="empty-state" style="padding-top:80px"><div class="empty-icon">⌕</div><h3>Search everything</h3><p>Type at least two characters.</p></div>`;
    return;
  }
  const tokens = query.split(/\s+/).filter(Boolean);
  const p = getProject();
  if (!p) return;
  const CAP = 20;
  let html = '';

  // ═══ DEVICES ═══
  const devMatches = p.devices.filter(d => {
    const portText = Object.values(d.portLabels || {}).join(' ') + ' ' + Object.values(d.portNotes || {}).join(' ');
    const hay = _sNorm([d.name, d.ip, d.mac, d.manufacturer, d.model, d.notes, d.serial, d.deviceType, STATUS_LABELS[d.status] || '', portText].join(' '));
    return _sMatches(tokens, hay, _sMac(d.mac));
  });
  if (devMatches.length) {
    html += `<div class="section-hdr"><span class="sh-title">◈ Devices (${devMatches.length})</span></div>`;
    html += devMatches.slice(0, CAP).map(d => _searchDeviceCard(d, p)).join('');
    if (devMatches.length > CAP) html += `<div class="srch-more">+ ${devMatches.length - CAP} more devices — refine the search</div>`;
  }

  // ═══ RACKS ═══
  const rackMatches = p.racks.filter(r => _sMatches(tokens, _sNorm(r.name + ' ' + (r.location || '')), ''));
  if (rackMatches.length) {
    html += `<div class="section-hdr"><span class="sh-title">▤ Racks (${rackMatches.length})</span></div>`;
    html += rackMatches.slice(0, CAP).map(r => {
      const devCount = p.devices.filter(d => d.rackId === r.id).length;
      return `<div class="list-card" onclick="closeSearch();sessionStorage.setItem('netrack_focus_rack','${r.id}');setView('racks')">
        <div class="lc-title"><span style="color:var(--green)">▤</span><span class="t-name">${esc(r.name)}</span></div>
        <div class="lc-sub">${esc(r.location || '—')} · ${r.uHeight}U · ${devCount} device${devCount!==1?'s':''}</div>
      </div>`;
    }).join('');
  }

  // ═══ CABLE RUNS ═══
  const runMatches = (p.cableRuns || []).filter(r =>
    _sMatches(tokens, _sNorm([r.label, r.fromRoom, r.fromPort, r.toRoom, r.toPort, r.type, r.notes].join(' ')), ''));
  if (runMatches.length) {
    html += `<div class="section-hdr"><span class="sh-title">⇄ Cable Runs (${runMatches.length})</span></div>`;
    html += runMatches.slice(0, CAP).map(r => {
      const mf = smRunMappedFloors(r.id);
      return `<div class="list-card" onclick="editCableRun('${r.id}')">
        <div class="lc-title">${r.color?`<span style="width:10px;height:10px;border-radius:50%;background:${esc(r.color)};flex-shrink:0"></span>`:''}<span class="t-name">${esc(r.label || '(unlabeled)')}</span></div>
        <div class="lc-sub">${esc(r.fromRoom || '?')}${r.fromPort ? ' P' + esc(r.fromPort) : ''} → ${esc(r.toRoom || '?')}${r.toPort ? ' P' + esc(r.toPort) : ''} · ${esc(r.type || '')}</div>
        ${mf.length ? `<div class="lc-chips"><span class="badge badge-green" onclick="event.stopPropagation();closeSearch();openMapStudio('${mf[0].id}')">🗺 ${esc(mf[0].name)}</span></div>` : ''}
      </div>`;
    }).join('');
  }

  // ═══ PHOTOS (caption / filename / folder) ═══
  const folderName = id => (p.photoFolders || []).find(f => f.id === id)?.name || '';
  const photoMatches = (p.photos || []).map((ph, idx) => ({ ph, idx }))
    .filter(({ ph }) => _sMatches(tokens, _sNorm((ph.caption || '') + ' ' + (ph.name || '') + ' ' + folderName(ph.folderId)), ''));
  if (photoMatches.length) {
    html += `<div class="section-hdr"><span class="sh-title">${CAM_SVG} Photos (${photoMatches.length})</span></div>`;
    html += `<div class="srch-photos">` + photoMatches.slice(0, 12).map(({ ph, idx }) =>
      `<div class="srch-photo" style="background-image:url('${ph.thumb || ''}')" onclick="_searchOpenPhoto(${idx})" title="${esc(ph.caption || ph.name || '')}"></div>`
    ).join('') + `</div>`;
    if (photoMatches.length > 12) html += `<div class="srch-more">+ ${photoMatches.length - 12} more photos</div>`;
    window._searchPhotoIdxs = photoMatches.map(x => x.idx);
  }

  // ═══ SITE NOTES ═══
  const noteMatches = (p.siteNotes || []).filter(n => _sMatches(tokens, _sNorm(n.text), ''));
  if (noteMatches.length) {
    html += `<div class="section-hdr"><span class="sh-title">📝 Site Notes (${noteMatches.length})</span></div>`;
    html += noteMatches.slice(0, 8).map(n => `
      <div class="list-card" onclick="closeSearch();setView('home')">
        <div class="lc-sub" style="white-space:normal;color:var(--text)">${esc(n.text.length > 160 ? n.text.slice(0, 158) + '…' : n.text)}</div>
        <div class="lc-sub" style="color:var(--text3);margin-top:5px">${fmtTs(n.ts)}</div>
      </div>`).join('');
  }

  // ═══ SITE MAPS (name / text boxes / path labels / symbol labels) ═══
  const mapMatches = (p.siteMapFloors || []).filter(f => {
    const hay = _sNorm([f.name,
      ...(f.texts || []).map(t => t.text),
      ...(f.cableLines || []).map(l => l.label),
      ...(f.symbols || []).map(s => s.label)].join(' '));
    return _sMatches(tokens, hay, '');
  });
  if (mapMatches.length) {
    html += `<div class="section-hdr"><span class="sh-title">🗺 Site Maps (${mapMatches.length})</span></div>`;
    html += mapMatches.map(f => {
      const hits = [
        ...(f.texts || []).filter(t => _sMatches(tokens, _sNorm(t.text), '')).map(t => '🅣 ' + t.text),
        ...(f.cableLines || []).filter(l => l.label && _sMatches(tokens, _sNorm(l.label), '')).map(l => '⇄ ' + l.label)
      ].slice(0, 3);
      return `<div class="list-card" onclick="closeSearch();openMapStudio('${f.id}')">
        <div class="lc-title"><span>🗺</span><span class="t-name">${esc(f.name)}</span></div>
        ${hits.length ? `<div class="lc-sub">${esc(hits.join(' · '))}</div>` : ''}
      </div>`;
    }).join('');
  }

  out.innerHTML = html || `<div class="empty-state" style="padding-top:80px"><div class="empty-icon">∅</div><h3>No matches</h3><p>Nothing found for “${esc(q)}”.</p></div>`;
}

// Rich device result: identity + rack + connections + maps + tagged photos
function _searchDeviceCard(d, p) {
  const c = dtColor(d.deviceType || 'Misc.');
  const rack = p.racks.find(r => r.id === d.rackId);

  // Connections in both directions, circuit-aware: a camera on a patched
  // line reads "Panel P5 (Rm 101) · MDF ⇄ Switch P12".
  const conns = [];
  const roomOf = h => { const r = p.racks.find(x => x.id === h.rackId); return r ? (r.location || r.name) : ''; };

  // This device's own ports: link + whatever rides the circuit
  Object.keys({ ...(d.portAssignments || {}), ...(d.portEndDevice || {}) })
    .sort((a, b) => +a - +b).forEach(port => {
      const c = getPortCircuit(d, +port, p);
      if (!c.content) return;
      const lbl = (d.portLabels || {})[port];
      let line = `P${port}${lbl ? ` (${lbl})` : ''}`;
      if (c.link) line += ` ⇄ ${c.link.dev.name} P${c.link.port}`;
      else if (c.assigned) line += ` → ${c.assigned.name}${(d.portPeerPort || {})[port] ? ` P${(d.portPeerPort || {})[port]}` : ''}`;
      if (c.end && (!c.assigned || c.end.id !== c.assigned.id)) line += ` · ${c.end.name}`;
      conns.push(line);
    });

  // Circuits this device rides (or inbound one-way links to it)
  p.devices.forEach(h => {
    if (h.id === d.id) return;
    const ports = new Set();
    Object.entries(h.portEndDevice || {}).forEach(([n, v]) => { if (v === d.id) ports.add(n); });
    Object.entries(h.portAssignments || {}).forEach(([n, v]) => {
      if (v !== d.id) return;
      const peer = (h.portPeerPort || {})[n];
      if (peer && (d.portAssignments || {})[peer] === h.id) return; // mirrored — listed above
      ports.add(n);
    });
    [...ports].sort((a, b) => +a - +b).forEach(n => {
      const c = getPortCircuit(h, +n, p);
      const lbl = (h.portLabels || {})[n];
      const room = roomOf(h);
      let line = `${h.name} P${n}${lbl ? ` (${lbl})` : ''}${room ? ` · ${room}` : ''}`;
      let far = '';
      if (c.link && c.link.dev.id !== d.id) far = `${c.link.dev.name} P${c.link.port}`;
      else if (!c.link) {
        // one-way legacy chain: whoever points at this host port is the far side
        for (const x of p.devices) {
          if (x.id === h.id || x.id === d.id) continue;
          const hit = Object.entries(x.portAssignments || {}).find(([m, t]) => t === h.id && (x.portPeerPort || {})[m] == n);
          if (hit) { far = `${x.name} P${hit[0]}`; break; }
        }
      }
      if (far) line += ` ⇄ ${far}`;
      conns.push(line);
    });
  });

  // Maps: floors where this device is pinned, or where its rack is placed
  const mapFloors = (p.siteMapFloors || []).filter(f =>
    (f.markers || []).some(m => m.devId === d.id || (rack && m.rackId === rack.id)));

  // Photos tagged with this device (legacy pin data still counts!)
  const tagged = (p.photos || []).map((ph, idx) => ({ ph, idx }))
    .filter(({ ph }) => (ph.assignments || []).some(a => a && a.itemId === 'dev:' + d.id));

  const netLine = [d.ip, d.mac].filter(Boolean).join(' · ');
  const mfrLine = [d.manufacturer, d.model].filter(Boolean).join(' ');

  return `
  <div class="list-card" onclick="editDevice('${d.id}')">
    <div class="lc-title">
      <span style="width:11px;height:11px;border-radius:50%;background:${c};flex-shrink:0"></span>
      <span class="t-name">${esc(d.name)}</span>
    </div>
    ${netLine ? `<div class="lc-sub">${esc(netLine)}</div>` : ''}
    ${mfrLine ? `<div class="lc-sub" style="color:var(--text3)">${esc(mfrLine)}</div>` : ''}
    ${d.notes ? `<div class="lc-sub" style="color:var(--text3);white-space:normal">${esc(d.notes.length > 90 ? d.notes.slice(0, 88) + '…' : d.notes)}</div>` : ''}
    ${conns.length ? `<div class="srch-conns">${conns.slice(0, 6).map(t => `<div class="srch-conn">⊡ ${esc(t)}</div>`).join('')}${conns.length > 6 ? `<div class="srch-conn" style="color:var(--text3)">+ ${conns.length - 6} more connections</div>` : ''}</div>` : ''}
    <div class="lc-chips">
      ${dtBadge(d.deviceType || 'Misc.')}
      ${statusBadge(d.status || '')}
      ${rack ? `<span class="badge badge-green" onclick="event.stopPropagation();closeSearch();sessionStorage.setItem('netrack_focus_rack','${rack.id}');setView('racks')">▤ ${esc(rack.name)}${d.rackU ? ' · U' + d.rackU : ''}</span>` : ''}
      ${mapFloors.map(f => `<span class="badge" style="background:rgba(0,200,255,.1);border:1px solid rgba(0,200,255,.35);color:var(--accent)" onclick="event.stopPropagation();closeSearch();openMapStudio('${f.id}')">🗺 ${esc(f.name)}</span>`).join('')}
      ${tagged.length ? `<span class="badge badge-gray" onclick="event.stopPropagation();_searchOpenTagged('${d.id}')">${CAM_SVG} ${tagged.length} photo${tagged.length!==1?'s':''}</span>` : ''}
    </div>
  </div>`;
}

// Open a photo from search results with prev/next scoped to the matches
function _searchOpenPhoto(idx) {
  if (Array.isArray(window._searchPhotoIdxs)) _viewerPhotoIndices = window._searchPhotoIdxs;
  openPhotoViewer(idx);
}

function _searchOpenTagged(devId) {
  const p = getProject();
  const idxs = (p.photos || []).map((ph, idx) => ({ ph, idx }))
    .filter(({ ph }) => (ph.assignments || []).some(a => a && a.itemId === 'dev:' + devId))
    .map(x => x.idx);
  if (!idxs.length) return;
  _viewerPhotoIndices = idxs;
  openPhotoViewer(idxs[0]);
}
