function renderPorts() {
  const p = getProject();
  const portDevs = p.devices.filter(d => (d.ports||0) > 0 && d.deviceType !== 'Patch Panel');
  const patchPanels = p.devices.filter(d => d.deviceType === 'Patch Panel' && (d.ports||0) > 0);

  if (portDevs.length === 0 && patchPanels.length === 0) {
    setTopbarActions(`<button class="btn btn-ghost btn-sm" onclick="addPatchPanel()">⊟ New Patch Panel</button>`);
    document.getElementById('view-area').innerHTML = `<div class="empty-state"><div class="empty-icon">⊡</div><h3>No port-capable devices</h3><p>Add a Switch, Router, Firewall, Server, or NAS with a port count, or create a Patch Panel.</p><br><div style="display:flex;gap:10px;justify-content:center"><button class="btn btn-ghost" onclick="setView('devices')">Go to Device List</button><button class="btn btn-primary" onclick="addPatchPanel()">⊟ New Patch Panel</button></div></div>`;
    return;
  }

  const allPortDevs = [...portDevs, ...patchPanels];
  const selId = state.selectedSwitch && allPortDevs.find(d=>d.id===state.selectedSwitch) ? state.selectedSwitch : allPortDevs[0].id;
  state.selectedSwitch = selId;
  setTopbarActions(`
    <button class="btn btn-ghost btn-sm" onclick="addPatchPanel()">⊟ New Patch Panel</button>
    <button class="btn btn-ghost btn-sm" onclick="printPortLabels('${selId}')">🖨 Print Labels</button>
  `);
  const sw = p.devices.find(d => d.id === selId);

  let html = `<div class="port-layout">
    <div class="port-switch-selector">`;

  // ── Regular port-capable devices ──
  if (portDevs.length > 0) {
    html += `<div style="font-size:10px;color:var(--text3);font-family:var(--mono);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid var(--border)">Devices</div>`;
    portDevs.forEach(s => {
      const used = Object.keys(s.portAssignments||{}).length;
      const c = dtColor(s.deviceType||'Misc.');
      html += `<div class="switch-item ${s.id===selId?'active':''}" onclick="state.selectedSwitch='${s.id}';renderPorts()" ondblclick="editDevice('${s.id}')">
        <div class="sname" style="display:flex;align-items:center;gap:6px">
          <span style="width:8px;height:8px;border-radius:50%;background:${c};flex-shrink:0"></span>${esc(s.name)}
        </div>
        <div class="smeta">${dtBadge(s.deviceType||'Misc.')} &nbsp; ${used}/${s.ports||0} ports used</div>
      </div>`;
    });
  }

  // ── Patch Panels ──
  if (patchPanels.length > 0) {
    html += `<div style="font-size:10px;color:${dtColor('Patch Panel')};font-family:var(--mono);text-transform:uppercase;letter-spacing:1px;margin:${portDevs.length>0?'14px':0} 0 6px;padding-bottom:4px;border-bottom:1px solid var(--border)">Patch Panels</div>`;
    patchPanels.forEach(s => {
      const used = Object.keys(s.portAssignments||{}).length;
      const c = dtColor('Patch Panel');
      html += `<div class="switch-item ${s.id===selId?'active':''}" onclick="state.selectedSwitch='${s.id}';renderPorts()" ondblclick="editDevice('${s.id}')">
        <div class="sname" style="display:flex;align-items:center;gap:6px">
          <span style="width:8px;height:8px;border-radius:2px;background:${c};flex-shrink:0"></span>${esc(s.name)}
        </div>
        <div class="smeta" style="color:${c}88">⊟ Patch Panel &nbsp; ${used}/${s.ports||0} ports labeled</div>
      </div>`;
    });
  }

  html += `</div><div class="port-panel">`;

  if (sw) {
    const portCount = sw.ports || 24;
    const assignments = sw.portAssignments || {};
    const vlans = sw.portVlans || {};
    const peerPorts = sw.portPeerPort || {};
    const notes = sw.portNotes || {};
    const labels = sw.portLabels || {};

    html += `<div style="margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
      <div>
        <div style="font-size:16px;font-weight:600;display:flex;align-items:center;gap:8px">
          <span style="width:12px;height:12px;border-radius:50%;background:${dtColor(sw.deviceType||'Misc.')}"></span>
          ${esc(sw.name)}
        </div>
        <div style="font-size:12px;color:var(--text2);font-family:var(--mono)">${dtBadge(sw.deviceType||'Misc.')} ${esc(sw.manufacturer||'')} ${esc(sw.model||'')} &nbsp;·&nbsp; ${portCount} ports</div>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="clearAllPorts('${sw.id}')">Clear All</button>
    </div>`;

    // Port grid: <=8 single row, >8 two-row (odd top, even bottom like a physical switch)
    function portCell(i, wide) {
      const devId = assignments[i];
      const dev = devId ? p.devices.find(d => d.id === devId) : null;
      const vlan = vlans[i];
      const vc = getVlanColor(vlan || '1');
      const pp = peerPorts[i];
      const peerPortLabel = pp && dev ? `↔ Port ${pp}` : '';
      const dc = dev ? dtColor(dev.deviceType||'Misc.') : '';
      const isPoe = !!(sw.portPoe||{})[i];
      const borderStyle = dev ? `border-color:${dc};box-shadow:0 0 6px ${dc}66;` : (vlan ? `border-color:${vc};` : '');
      const lbl = labels[i] || '';
      return `<div class="port-cell-sm ${dev?'assigned':''}" style="${wide?'min-width:88px;':''}${borderStyle}" onclick="assignPort('${sw.id}',${i})">
        ${lbl ? `<div style="font-size:9px;font-family:var(--mono);color:var(--accent);font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:2px" title="${esc(lbl)}">${esc(lbl)}</div>` : ''}
        <div class="port-num">${wide?'PORT ':' P'}${i}${isPoe?'<span style="color:#ffcc00;font-size:8px;margin-left:2px" title="PoE">⚡</span>':''}</div>
        ${dev ? `<div class="port-device" style="color:${dc}">${esc(dev.name)}</div>` : `<div class="port-empty">—</div>`}
        ${peerPortLabel ? `<div class="port-conn-badge">${esc(peerPortLabel)}</div>` : ''}
        ${vlan ? `<div class="port-vlan-tag" style="background:${vc}22;color:${vc}">V${vlan}</div>` : ''}
        ${notes[i] ? `<div style="font-size:10px;color:var(--text3);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(notes[i])}">${esc(notes[i])}</div>` : ''}
      </div>`;
    }

    if (portCount <= 8) {
      html += `<div style="display:flex;gap:6px;flex-wrap:wrap;">`;
      for (let i = 1; i <= portCount; i++) html += portCell(i, false);
      html += `</div>`;
    } else {
      const topRow = [], botRow = [];
      for (let i = 1; i <= portCount; i++) (i%2===1 ? topRow : botRow).push(i);
      html += `<div style="background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:10px;overflow-x:auto">
        <div style="display:inline-flex;flex-direction:column;gap:4px;min-width:max-content">`;
      [topRow, botRow].forEach(row => {
        html += `<div style="display:flex;gap:4px;">`;
        row.forEach(i => { html += portCell(i, true); });
        html += `</div>`;
      });
      html += `</div></div>`;
    }

    const usedVlans = [...new Set(Object.values(vlans).filter(Boolean))].sort((a,b)=>+a-+b);
    if (usedVlans.length > 0) {
      html += `<div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:6px;align-items:center">
        <span style="font-size:11px;color:var(--text3);font-family:var(--mono)">VLAN legend:</span>`;
      usedVlans.forEach(v => {
        const vc = getVlanColor(v);
        html += `<span style="font-size:11px;font-family:var(--mono);padding:2px 8px;border-radius:3px;border:1.5px solid ${vc};color:${vc}">VLAN ${v}</span>`;
      });
      html += `</div>`;
    }

    // Show connections TO this device from other port devices
    const inbound = [];
    portDevs.forEach(other => {
      if (other.id === sw.id) return;
      Object.entries(other.portAssignments||{}).forEach(([portNum, devId]) => {
        if (devId === sw.id) {
          const pp = (other.portPeerPort||{})[portNum];
          inbound.push({ other, portNum, peerPort: pp });
        }
      });
    });
    if (inbound.length > 0) {
      html += `<div style="margin-top:16px;background:var(--card);border:1px solid var(--border);border-radius:8px;padding:12px">
        <div style="font-size:11px;color:var(--text2);font-family:var(--mono);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Inbound Connections to ${esc(sw.name)}</div>
        <table style="width:100%;font-size:12px;border-collapse:collapse">
          <thead><tr>
            <th style="text-align:left;padding:4px 8px;color:var(--text3);font-family:var(--mono);font-size:10px">FROM DEVICE</th>
            <th style="text-align:left;padding:4px 8px;color:var(--text3);font-family:var(--mono);font-size:10px">THEIR PORT</th>
            <th style="text-align:left;padding:4px 8px;color:var(--text3);font-family:var(--mono);font-size:10px">MY PORT</th>
            <th style="text-align:left;padding:4px 8px;color:var(--text3);font-family:var(--mono);font-size:10px">VLAN</th>
          </tr></thead><tbody>`;
      inbound.forEach(({other, portNum, peerPort}) => {
        const vc = getVlanColor((other.portVlans||{})[portNum]||'1');
        html += `<tr style="border-top:1px solid var(--border)">
          <td style="padding:5px 8px;font-weight:600;color:${dtColor(other.deviceType||'Misc.')}">${esc(other.name)}</td>
          <td style="padding:5px 8px;font-family:var(--mono);color:var(--accent)">Port ${portNum}</td>
          <td style="padding:5px 8px;font-family:var(--mono);color:var(--green)">${peerPort ? 'Port '+peerPort : '<span style="color:var(--text3)">—</span>'}</td>
          <td style="padding:5px 8px">${(other.portVlans||{})[portNum]?`<span style="font-family:var(--mono);padding:1px 6px;border-radius:3px;border:1px solid ${vc};color:${vc}">VLAN ${(other.portVlans||{})[portNum]}</span>`:'—'}</td>
        </tr>`;
      });
      html += `</tbody></table></div>`;
    }
  }
  html += `</div></div>`;
  document.getElementById('view-area').innerHTML = html;
}

function assignPort(switchId, portNum) {
  const p = getProject();
  const sw = p.devices.find(d => d.id === switchId);
  if (!sw) return;
  const curr = (sw.portAssignments||{})[portNum];
  const currVlan = (sw.portVlans||{})[portNum] || '';
  const currPeerPort = (sw.portPeerPort||{})[portNum] || '';
  const currLabel = (sw.portLabels||{})[portNum] || '';
  const currDev = curr ? p.devices.find(d => d.id === curr) : null;
  const others = p.devices.filter(d => d.id !== switchId);
  const peerPortOptions = currDev && (currDev.ports||0) > 0
    ? Array.from({length: currDev.ports}, (_,i) => `<option value="${i+1}" ${+currPeerPort===i+1?'selected':''}>${i+1}</option>`).join('')
    : '';
  const isPatchPanel = sw.deviceType === 'Patch Panel';

  openModal(`
    <h3>Port ${portNum} — ${esc(sw.name)}${isPatchPanel ? ' <span style="font-size:11px;color:var(--accent);font-family:var(--mono)">[Patch Panel]</span>' : ''}</h3>
    <div class="form-row-inline">
      <div class="form-row"><label>Port Label <span style="color:var(--text3);font-weight:400">(e.g. Rm 101, Server-A)</span></label>
        <input class="form-control" id="port-label" value="${esc(currLabel)}" placeholder="e.g. Rm 101"></div>
      <div class="form-row"><label>VLAN</label>
        <input class="form-control" id="port-vlan" value="${esc(currVlan)}" placeholder="e.g. 10" type="number" min="1" max="4094"></div>
    </div>
    <div class="form-row"><label>Connected Device</label>
      <select class="form-control" id="port-device" onchange="${isPatchPanel ? '' : `onPortDeviceChange(this,'${switchId}',${portNum})`}">
        <option value="">— Empty / Unassign —</option>
        ${(() => {
          const byType = {};
          others.forEach(d => { const t = d.deviceType || 'Misc.'; if (!byType[t]) byType[t] = []; byType[t].push(d); });
          const typeOrder = ['Switch','Router','Firewall','Modem','Server','NAS','AP','PC/Workstation','IP Phone','IP Camera','Access Control','APC/UPS','Patch Panel','Misc Rack-Mounted','IoT Device','Printer','Fax Machine','Smartphone/Tablet','Misc.'];
          const sorted = [...typeOrder.filter(t => byType[t]), ...Object.keys(byType).filter(t => !typeOrder.includes(t))];
          return sorted.map(type => {
            const devs = byType[type].sort((a,b) => (a.name||'').localeCompare(b.name||''));
            return `<optgroup label="${esc(type)}">` +
              devs.map(d => `<option value="${d.id}" ${d.id===curr?'selected':''}>${esc(d.name)}${d.ip?' · '+esc(d.ip):''}</option>`).join('') +
              `</optgroup>`;
          }).join('');
        })()}
      </select>
    </div>
    ${!isPatchPanel ? `
    <div id="peer-port-section" style="${currDev&&(currDev.ports||0)>0?'':'display:none'}">
      <div class="form-row"><label>Port on ${esc(currDev?.name||'connected device')} (peer port)</label>
        <select class="form-control" id="port-peer">
          <option value="">— Not specified —</option>
          ${peerPortOptions}
        </select>
      </div>
    </div>` : ''}
    <div class="form-row"><label>Note</label>
      <textarea class="form-control" id="port-note" rows="2" placeholder="e.g. Uplink to floor 2" style="resize:vertical;font-family:inherit">${esc((sw.portNotes||{})[portNum]||'')}</textarea></div>
    ${!isPatchPanel ? `<div style="display:flex;align-items:center;gap:12px;margin:6px 0 12px">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none">
        <span style="font-size:13px;font-weight:500;color:var(--text2)">PoE</span>
        <input type="checkbox" id="port-poe" ${(sw.portPoe||{})[portNum] ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer;accent-color:var(--accent)">
        <span style="font-size:11px;color:var(--text3)">Power over Ethernet</span>
      </label>
    </div>` : ''}
    <div class="modal-actions">
      ${currDev ? `<button class="btn btn-ghost btn-sm" onclick="closeModal();editDevice('${currDev.id}')" style="margin-right:auto" title="Open full device settings">⇢ ${esc(currDev.name)}</button>` : ''}
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="savePort('${switchId}',${portNum})">Save</button>
    </div>`);
}

function onPortDeviceChange(sel, switchId, portNum) {
  const p = getProject();
  const devId = sel.value;
  const dev = devId ? p.devices.find(d => d.id === devId) : null;
  const section = document.getElementById('peer-port-section');
  if (!section) return;
  if (dev && (dev.ports||0) > 0) {
    const opts = Array.from({length: dev.ports}, (_,i) => `<option value="${i+1}">${i+1}</option>`).join('');
    section.innerHTML = `<div class="form-row"><label>Port on ${esc(dev.name)} (peer port)</label>
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

  const prevDevId   = sw.portAssignments[portNum] || null;
  const devId       = document.getElementById('port-device')?.value || null;
  const note        = document.getElementById('port-note')?.value?.trim() || null;
  const label       = document.getElementById('port-label')?.value?.trim() || null;
  const vlan        = document.getElementById('port-vlan')?.value?.trim() || null;
  const peerPortRaw = document.getElementById('port-peer')?.value;
  const peerPort    = peerPortRaw ? parseInt(peerPortRaw) : null;
  const poe         = document.getElementById('port-poe')?.checked || false;

  // ── Remove old reverse link if device changed, peer port changed, or port cleared ──
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
        logChange(`Port auto-cleared (reverse): ${prevDev.name} Port ${prevPeerPort} (was linked to ${sw.name} Port ${portNum})`);
      }
    }
  }

  // ── Save this side ──
  if (devId) {
    sw.portAssignments[portNum] = devId;
    const dev = p.devices.find(d => d.id === devId);
    const vlanStr = vlan ? ` VLAN ${vlan}` : '';
    const peerStr = peerPort ? ` ↔ ${dev?dev.name:'?'} Port ${peerPort}` : '';
    logChange(`Port assigned: ${sw.name} Port ${portNum}${peerStr}${vlanStr} → ${dev?dev.name:'device'}`);

    // ── Create / update reverse link on the peer device ──
    if (peerPort && dev) {
      if (!dev.portAssignments) dev.portAssignments = {};
      if (!dev.portPeerPort) dev.portPeerPort = {};
      if (!dev.portVlans) dev.portVlans = {};
      // Only write reverse if that port is empty or already points here
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

  if (!sw.portLabels) sw.portLabels = {};
  if (note)  sw.portNotes[portNum] = note;         else delete sw.portNotes[portNum];
  if (label) sw.portLabels[portNum] = label;       else delete sw.portLabels[portNum];
  if (vlan)  sw.portVlans[portNum] = vlan;         else delete sw.portVlans[portNum];
  if (peerPort) sw.portPeerPort[portNum] = peerPort; else delete sw.portPeerPort[portNum];
  if (poe) { sw.portPoe[portNum] = true; logChange(`Port PoE enabled: ${sw.name} Port ${portNum}`); }
  else { const wasPoe = sw.portPoe[portNum]; delete sw.portPoe[portNum]; if (wasPoe) logChange(`Port PoE disabled: ${sw.name} Port ${portNum}`); }
  if (label) logChange(`Port label: ${sw.name} Port ${portNum} → "${label}"`);

  save(); closeModal();
  // If this is a patch panel port edited from the panel modal, re-open the panel modal
  if (sw.deviceType === 'Patch Panel' && state._ppModalOrigin) {
    openPatchPanelModal(switchId);
  } else if (state.currentView === 'racks') {
    renderRacks();
  } else {
    renderPorts();
  }
  toast('Port saved', 'success');
}

function clearAllPorts(switchId) {
  if (!confirm('Clear all port assignments for this switch?')) return;
  const p = getProject();
  const sw = p.devices.find(d => d.id === switchId);
  if (sw) {
    // Remove reverse links on any devices that were connected to this switch
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
    // Clear all port data on this device
    sw.portAssignments = {};
    sw.portNotes = {};
    sw.portVlans = {};
    sw.portPeerPort = {};
    sw.portLabels = {};
    sw.portPoe = {};
    logChange(`All ports cleared: ${sw.name}`);
  }
  save(); renderPorts(); toast('Ports cleared');
}
