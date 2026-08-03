// ═══════════════════════════════════════════
//  SITE REPORT — client-ready PDF via the
//  system print dialog. A section picker lets
//  the user choose which elements to include
//  (racks, panel layouts, port lists, inventory,
//  cable runs, site maps, photos).
// ═══════════════════════════════════════════

const REPORT_CSS = `
#print-host *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
#print-host{font-family:Arial,Helvetica,sans-serif;color:#111;background:#fff;font-size:11px;line-height:1.45;padding:4px}
#print-host .cover{text-align:center;padding:60px 20px 30px;page-break-after:always}
#print-host .cover img{width:96px;height:96px;border-radius:50%;object-fit:cover;margin-bottom:14px}
#print-host .cover h1{font-size:26px;margin:6px 0 2px}
#print-host .cover .sub{font-size:13px;color:#666;letter-spacing:2px;text-transform:uppercase;margin-bottom:26px}
#print-host .meta{margin:0 auto 22px;border-collapse:collapse}
#print-host .meta td{padding:4px 12px;font-size:12px;text-align:left;border:none}
#print-host .meta td:first-child{color:#888;text-transform:uppercase;font-size:9.5px;letter-spacing:1px;text-align:right}
#print-host .stats{font-size:12px;color:#444;margin-bottom:34px}
#print-host .foot{font-size:10px;color:#999}
#print-host section{page-break-before:always}
#print-host h2{font-size:17px;border-bottom:2.5px solid #222;padding-bottom:5px;margin:4px 0 12px}
#print-host h3{font-size:13px;margin:16px 0 4px}
#print-host .dim{color:#777;font-weight:400}
#print-host table{width:100%;border-collapse:collapse;margin:4px 0 10px;page-break-inside:auto}
#print-host tr{page-break-inside:avoid}
#print-host th,#print-host td{border:1px solid #bbb;padding:3.5px 6px;text-align:left;font-size:9.5px;vertical-align:top}
#print-host th{background:#eee;text-transform:uppercase;font-size:8.5px;letter-spacing:.5px}
#print-host td.u{font-weight:700;white-space:nowrap;width:40px;background:#f6f6f6}
#print-host img.map{width:100%;border:1px solid #ccc;margin:4px 0 12px;page-break-inside:avoid}
#print-host .ph-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
#print-host figure{margin:0;page-break-inside:avoid}
#print-host figure img{width:100%;border:1px solid #ccc;border-radius:3px}
#print-host figcaption{font-size:9px;color:#555;padding-top:2px}
#print-host .fp{border:2px solid #555;border-radius:8px;background:#dfe3e8;padding:7px 9px;margin:4px 0 4px;page-break-inside:avoid}
#print-host .fp-row{display:flex;gap:3px;margin:3px 0}
#print-host .fp-port{flex:1 1 0;min-width:0;background:#fff;border:1.6px solid #aaa;border-radius:3px;padding:2px 1px 3px;text-align:center}
#print-host .fp-num{font-size:7.5px;font-weight:700;color:#333}
#print-host .fp-jack{width:72%;height:9px;margin:1px auto;border:1px solid #888;border-radius:2px;background:#eee}
#print-host .fp-lbl{font-size:6.5px;color:#222;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;padding:0 1px;min-height:8px}
#print-host .fp-legend{font-size:8.5px;color:#444;margin:0 0 14px}
#print-host .fp-legend .sw{display:inline-block;width:8px;height:8px;border-radius:2px;vertical-align:-1px;margin-right:3px;border:1px solid #999}
@page{size:letter;margin:0.55in}
`;

// Report sections the user can toggle in the picker (key, label)
const _REPORT_SECTIONS = [
  ['racks',     '▤ Rack elevations'],
  ['panels',    '⊟ Patch panel layouts'],
  ['ports',     '⊡ Port lists (wiring charts)'],
  ['inventory', '≡ Device inventory'],
  ['runs',      '∿ Cable runs'],
  ['maps',      '🗺 Site maps'],
  ['photos',    CAM_SVG + ' Photos'],
];

// Entry point: ask which elements to include, then build
function generateSiteReport() {
  const p = getProject();
  if (!p) return;
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('netrack_report_opts') || '{}'); } catch (e) {}
  const rows = _REPORT_SECTIONS.map(([k, lbl]) =>
    `<label class="rpt-opt"><input type="checkbox" id="rpt-${k}" ${saved[k] === false ? '' : 'checked'}><span>${lbl}</span></label>`).join('');
  openModal(`
    <h3>🖨 Site Report</h3>
    <p style="font-size:12px;color:var(--text2);margin:2px 0 10px">Choose what to include:</p>
    ${rows}
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="_reportGo()">Generate</button>
    </div>`);
}

function _reportGo() {
  const o = {};
  _REPORT_SECTIONS.forEach(([k]) => { const el = document.getElementById('rpt-' + k); o[k] = el ? el.checked : true; });
  try { localStorage.setItem('netrack_report_opts', JSON.stringify(o)); } catch (e) {}
  closeModal();
  _runSiteReport(o);
}

async function _runSiteReport(o) {
  const p = getProject();
  if (!p) return;
  toast('Building site report…');

  // Site maps: compose floor image + drawn lines/markers onto a canvas
  const maps = [];
  if (o.maps) {
    for (const f of (p.siteMapFloors || [])) {
      try { const url = await _reportMapImage(p, f); if (url) maps.push({ f, url }); } catch (e) {}
    }
  }

  const today = new Date().toLocaleDateString();
  const runs = p.cableRuns || [];
  const photos = p.photos || [];
  const rackOf = d => p.racks.find(r => r.id === d.rackId);

  const devRows = [...p.devices].sort((a, b) => (a.deviceType || '').localeCompare(b.deviceType || '') || (a.name || '').localeCompare(b.name || ''))
    .map(d => {
      const r = rackOf(d);
      return `<tr><td><b>${esc(d.name)}</b></td><td>${esc(d.deviceType || '')}</td><td>${esc(d.ip || '')}</td><td>${esc(d.mac || '')}</td><td>${esc([d.manufacturer, d.model].filter(Boolean).join(' '))}</td><td>${r ? esc(r.name) + (d.rackU ? ' · U' + d.rackU : '') : ''}</td><td>${esc(STATUS_LABELS[d.status] || d.status || '')}</td></tr>`;
    }).join('');

  const runRows = runs.map(r => {
    const floors = smRunMappedFloors(r.id).map(f => f.name).join(', ');
    return `<tr><td><b>${esc(r.label || '(unlabeled)')}</b></td><td>${esc(r.fromRoom || '?')}${r.fromPort ? ' P' + esc(r.fromPort) : ''} → ${esc(r.toRoom || '?')}${r.toPort ? ' P' + esc(r.toPort) : ''}</td><td>${esc(r.type || '')}</td><td>${r.verified ? '✓' : ''}</td><td class="dim">${esc(floors)}</td><td class="dim">${esc(r.notes || '')}</td></tr>`;
  }).join('');

  const body = `
    <div class="cover">
      ${LOGO_URI ? `<img src="${LOGO_URI}" alt="">` : ''}
      <h1>${esc(p.name)}</h1>
      <div class="sub">Site Documentation Report</div>
      <table class="meta">
        ${p.company ? `<tr><td>Company</td><td>${esc(p.company)}</td></tr>` : ''}
        ${p.location ? `<tr><td>Location</td><td>${esc(p.location)}</td></tr>` : ''}
        ${p.contactMgmt ? `<tr><td>Management</td><td>${esc(p.contactMgmt)}</td></tr>` : ''}
        ${p.contactIT ? `<tr><td>IT Contact</td><td>${esc(p.contactIT)}</td></tr>` : ''}
        <tr><td>Date</td><td>${today}</td></tr>
      </table>
      <div class="stats">${p.devices.length} devices · ${p.racks.length} racks · ${runs.length} cable runs · ${photos.length} photos${maps.length ? ` · ${maps.length} site maps` : ''}</div>
      <div class="foot">Van Nice Guys, LLC · Network documentation, rack layout &amp; port assignment</div>
    </div>
    ${o.racks ? `<section><h2>Racks</h2>${p.racks.map(r => _reportRack(r, p)).join('') || '<p class="dim">No racks documented.</p>'}</section>` : ''}
    ${o.panels ? `<section><h2>Patch Panel Layouts</h2>${_reportPanels(p)}</section>` : ''}
    ${o.ports ? `<section><h2>Port Lists</h2>${p.devices.filter(d => (d.ports || 0) > 0).map(d => _reportPorts(d, p)).join('') || '<p class="dim">No port-capable devices.</p>'}</section>` : ''}
    ${o.inventory ? `<section><h2>Device Inventory</h2>
      <table><thead><tr><th>Name</th><th>Type</th><th>IP</th><th>MAC</th><th>Make / Model</th><th>Rack</th><th>Status</th></tr></thead>
      <tbody>${devRows || '<tr><td colspan="7" class="dim">No devices.</td></tr>'}</tbody></table></section>` : ''}
    ${o.runs && runs.length ? `<section><h2>Cable Runs</h2>
      <table><thead><tr><th>Label</th><th>Route</th><th>Type</th><th>Verified</th><th>Mapped On</th><th>Notes</th></tr></thead>
      <tbody>${runRows}</tbody></table></section>` : ''}
    ${maps.length ? `<section><h2>Site Maps</h2>${maps.map(m => `<h3>🗺 ${esc(m.f.name)}</h3><img class="map" src="${m.url}">`).join('')}</section>` : ''}
    ${o.photos && photos.length ? `<section><h2>Photos</h2>
      <div class="ph-grid">${photos.slice(0, 12).map(ph => `<figure><img src="${ph.thumb || ''}"><figcaption>${esc(ph.caption || ph.name || '')}</figcaption></figure>`).join('')}</div>
      ${photos.length > 12 ? `<p class="dim">+ ${photos.length - 12} more photos in the app.</p>` : ''}</section>` : ''}
  `;
  _printHtml(`Site Report — ${p.name}`, body, REPORT_CSS);
}

// One rack elevation as a compact U-by-U table
function _reportRack(rack, p) {
  const uOrder = [];
  if (rack.uDirection === 'asc') { for (let u = rack.uHeight; u >= 1; u--) uOrder.push(u); }
  else { for (let u = 1; u <= rack.uHeight; u++) uOrder.push(u); }
  const devAt = u => p.devices.find(d => d.rackId === rack.id && u >= (d.rackU || 0) && u < (d.rackU || 0) + (d.deviceUHeight || 1));
  const rows = uOrder.map(u => {
    const dev = p.devices.find(d => d.rackId === rack.id && d.rackU === u);
    const cont = !dev && devAt(u);
    const cell = dev
      ? `<td style="border-left:4px solid ${dtColor(dev.deviceType || 'Misc.')}"><b>${esc(dev.name)}</b> <span class="dim">${esc(dev.deviceType || '')}${dev.model ? ' · ' + esc(dev.model) : ''}${dev.ip ? ' · ' + esc(dev.ip) : ''}</span></td>`
      : cont
        ? `<td class="dim" style="border-left:4px solid ${dtColor(cont.deviceType || 'Misc.')}">⌐ ${esc(cont.name)} <span class="dim">(cont.)</span></td>`
        : `<td class="dim">—</td>`;
    return `<tr><td class="u">U${u}</td>${cell}</tr>`;
  }).join('');
  return `<h3>▤ ${esc(rack.name)} <span class="dim">${esc(rack.location || '')} · ${rack.uHeight}U</span></h3>
    <table>${rows}</table>`;
}

// Visual faceplate layout for each patch panel / fiber enclosure — jacks
// colored by connected-device type (or override), fiber pairs as split jacks
function _reportPanels(p) {
  const panels = p.devices.filter(d => PANEL_LIKE(d.deviceType || '') && (d.ports || 0) > 0);
  if (!panels.length) return '<p class="dim">No patch panels or fiber enclosures.</p>';
  return panels.map(dev => {
    const r = p.racks.find(x => x.id === dev.rackId);
    const legend = new Map();
    const cells = [];
    for (let i = 1; i <= (dev.ports || 0); i++) {
      const circ = getPortCircuit(dev, i, p);
      const lbl = (dev.portLabels || {})[i] || '';
      const ovr = (dev.portTypeOverride || {})[i] || '';
      const fib = (dev.portFiber || {})[i] || '';
      const type = circ.content ? (circ.content.deviceType || 'Misc.') : ovr;
      const c = type ? dtColor(type) : null;
      if (type) legend.set(type, c);
      const jackBg = fib ? fiberGrad(fib) : (c || '#eee');
      cells.push(`<div class="fp-port"${c ? ` style="border-color:${c}"` : ''}>
        <div class="fp-num">${i}</div>
        <div class="fp-jack" style="background:${jackBg}"></div>
        <div class="fp-lbl">${esc(lbl || (circ.content ? circ.content.name : ''))}</div>
      </div>`);
    }
    let rows = '';
    for (let i = 0; i < cells.length; i += 12) rows += `<div class="fp-row">${cells.slice(i, i + 12).join('')}</div>`;
    const legendHtml = legend.size
      ? `<p class="fp-legend">${[...legend].map(([t, c]) => `<span class="sw" style="background:${c}"></span>${esc(t)}`).join(' &nbsp; ')}</p>`
      : '<p class="fp-legend dim">No ports documented yet.</p>';
    return `<h3>${dev.deviceType === 'Fiber Enclosure' ? '◫' : '⊟'} ${esc(dev.name)} <span class="dim">${esc(dev.deviceType || '')}${r ? ' · ' + esc(r.name) : ''} · ${dev.ports} ports</span></h3>
      <div class="fp">${rows}</div>${legendHtml}`;
  }).join('');
}

// One switch/panel port table — empty ports are omitted to keep it tight
function _reportPorts(sw, p) {
  const rows = [];
  let skipped = 0;
  for (let i = 1; i <= (sw.ports || 0); i++) {
    const circ = getPortCircuit(sw, i, p);
    const lbl = (sw.portLabels || {})[i], vlan = (sw.portVlans || {})[i];
    const note = (sw.portNotes || {})[i], poe = (sw.portPoe || {})[i];
    if (!circ.content && !lbl && !vlan && !note) { skipped++; continue; }
    let conn = circ.content ? `<b>${esc(circ.content.name)}</b>${circ.content.ip ? ` <span class="dim">${esc(circ.content.ip)}</span>` : ''}` : '<span class="dim">—</span>';
    if (circ.end && circ.link) conn += ` <span class="dim">⇄ ${esc(circ.link.dev.name)} P${circ.link.port}</span>`;
    else if (circ.assigned && (sw.portPeerPort || {})[i]) conn += ` <span class="dim">P${(sw.portPeerPort || {})[i]}</span>`;
    rows.push(`<tr><td class="u">P${i}${poe ? ' ⚡' : ''}</td><td>${lbl ? esc(lbl) : '<span class="dim">—</span>'}</td><td>${conn}</td><td>${vlan ? esc(vlan) : ''}</td><td class="dim">${note ? esc(note) : ''}</td></tr>`);
  }
  if (!rows.length) return '';
  const r = p.racks.find(x => x.id === sw.rackId);
  return `<h3>${sw.deviceType === 'Patch Panel' ? '⊟' : '⊡'} ${esc(sw.name)} <span class="dim">${esc(sw.deviceType || '')}${r ? ' · ' + esc(r.name) : ''} · ${sw.ports} ports</span></h3>
    <table><thead><tr><th>Port</th><th>Label</th><th>Connected</th><th>VLAN</th><th>Note</th></tr></thead><tbody>${rows.join('')}</tbody></table>
    ${skipped ? `<p class="dim" style="font-size:8.5px;margin:0 0 8px">${skipped} empty ports omitted</p>` : ''}`;
}

// Compose a floor image + its drawn layers into one printable image
async function _reportMapImage(p, f) {
  const src = (await _lazyGetPhotoData('sitemap_' + p.id + '_' + f.id).catch(() => null)) || f.thumb;
  if (!src) return null;
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const W = Math.min(1600, img.naturalWidth || 1600);
  const H = Math.round(W * ((img.naturalHeight || 1200) / (img.naturalWidth || 1600)));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
  x.drawImage(img, 0, 0, W, H);
  const px = pt => ({ x: pt.x / 100 * W, y: pt.y / 100 * H });
  (f.cableLines || []).forEach(l => {
    const pts = (l.points || []).map(px);
    if (pts.length < 2) return;
    x.strokeStyle = l.color || '#00c8ff';
    x.lineWidth = Math.max(2.5, W / 380);
    x.lineJoin = x.lineCap = 'round';
    x.beginPath();
    pts.forEach((q, i) => i ? x.lineTo(q.x, q.y) : x.moveTo(q.x, q.y));
    x.stroke();
    if (l.label) { const mid = pts[Math.floor(pts.length / 2)]; _reportTag(x, mid.x, mid.y, l.label, l.color || '#00c8ff', W); }
  });
  (f.symbols || []).forEach(sy => {
    const q = px(sy);
    const def = SM_SYMBOLS[sy.type] || { icon: '?' };
    _reportTag(x, q.x, q.y, def.icon + (sy.label ? ' ' + sy.label : ''), sy.color || '#00c8ff', W);
  });
  (f.texts || []).forEach(t => { const q = px(t); _reportTag(x, q.x, q.y, t.text, t.color || '#fff', W); });
  (f.markers || []).forEach(m => {
    const q = px(m);
    if (m.rackId) { const r = p.racks.find(r => r.id === m.rackId); if (r) _reportMarker(x, q.x, q.y, '▤ ' + r.name, '#0092c8', W); }
    else if (m.devId) { const d = p.devices.find(d => d.id === m.devId); if (d) _reportMarker(x, q.x, q.y, d.name, dtColor(d.deviceType || 'Misc.'), W); }
  });
  return c.toDataURL('image/jpeg', 0.85);
}

function _reportMarker(x, cx, cy, label, color, W) {
  const r = Math.max(5, W / 230);
  x.fillStyle = color;
  x.strokeStyle = '#08131f';
  x.lineWidth = 2;
  x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); x.stroke();
  _reportTag(x, cx, cy + r * 2.6, label, color, W);
}

function _reportTag(x, cx, cy, text, color, W) {
  const fs = Math.max(11, W / 92);
  x.font = `bold ${fs}px Arial`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  const w = x.measureText(text).width;
  x.fillStyle = 'rgba(8,17,28,.84)';
  x.fillRect(cx - w / 2 - 4, cy - fs / 2 - 3, w + 8, fs + 6);
  x.fillStyle = color;
  x.fillText(text, cx, cy);
}
