// ═══════════════════════════════════════════
//  NETWORK TOPOLOGY
// ═══════════════════════════════════════════

// Transient drag state
let _fcDragId = null, _fcDragOffX = 0, _fcDragOffY = 0, _fcDragFromPool = false;

function renderFlowchart() {
  const p = getProject();
  if (!p.fcNodePositions) p.fcNodePositions = {};

  setTopbarActions(`
    <button class="btn btn-ghost btn-sm" onclick="fcResetLayout()">↺ Reset Layout</button>
    <button class="btn btn-ghost btn-sm" onclick="renderFlowchart()">↺ Refresh</button>`);

  if (p.devices.length === 0) {
    document.getElementById('view-area').innerHTML = `<div class="empty-state"><div class="empty-icon">⬡</div><h3>No devices to display</h3><p>Add devices to see your network topology.</p></div>`;
    return;
  }

  const TIER_ORDER = ['Modem','Router','Firewall','Switch','AP','Server','NAS','Access Control','APC/UPS','Misc Rack-Mounted','IP Phone','IP Camera','Printer','Fax Machine','PC/Workstation','Smartphone/Tablet','IoT Device','Misc.'];
  function getTier(dev) { const i = TIER_ORDER.indexOf(dev.deviceType||'Misc.'); return i < 0 ? TIER_ORDER.length : i; }

  // ── Build edges ──
  const edgeSeen = new Set(), connectedPairs = [];
  p.devices.forEach(d => {
    Object.values(d.portAssignments||{}).forEach(tid => {
      const key = [d.id,tid].sort().join('|');
      if (!edgeSeen.has(key)) { edgeSeen.add(key); connectedPairs.push({a:d.id,b:tid,type:'port'}); }
    });
    if (d.parentDeviceId) {
      const key = [d.id,d.parentDeviceId].sort().join('|');
      if (!edgeSeen.has(key)) { edgeSeen.add(key); connectedPairs.push({a:d.parentDeviceId,b:d.id,type:'parent'}); }
    }
  });

  const adj = new Map(); p.devices.forEach(d => adj.set(d.id, new Set()));
  connectedPairs.forEach(({a,b}) => { adj.get(a)?.add(b); adj.get(b)?.add(a); });

  // Devices that participate in at least one edge
  const hasEdge = new Set();
  connectedPairs.forEach(({a,b}) => { hasEdge.add(a); hasEdge.add(b); });

  // "On-canvas" = connected OR has a manually saved position
  const onCanvas = d => hasEdge.has(d.id) || !!p.fcNodePositions[d.id];
  const canvasDevs   = p.devices.filter(onCanvas);
  const unassignedDevs = p.devices.filter(d => !onCanvas(d));

  // Tree structure for layout
  const treeParent = new Map(), treeChildren = new Map();
  p.devices.forEach(d => { treeParent.set(d.id,null); treeChildren.set(d.id,[]); });
  p.devices.forEach(d => {
    const mt=getTier(d); let bestId=null, bestTier=Infinity;
    (adj.get(d.id)||new Set()).forEach(nid => {
      const nd=p.devices.find(x=>x.id===nid); if (!nd) return;
      const nt=getTier(nd);
      if (nt<mt && nt<bestTier) { bestTier=nt; bestId=nid; }
    });
    if (bestId) { treeParent.set(d.id,bestId); treeChildren.get(bestId).push(d.id); }
  });

  const usedTiers = [...new Set(canvasDevs.map(d=>getTier(d)))].sort((a,b)=>a-b);
  const tierToRow = new Map(usedTiers.map((t,i)=>[t,i]));
  const NODE_W=162, NODE_H=42, H_GAP=32, V_GAP=88, STAGGER_Y=28, svgPad=52;

  function isLeaf(id) { return (treeChildren.get(id)||[]).length===0; }
  function subtreeW(id) {
    const ch=treeChildren.get(id)||[];
    if (!ch.length) return NODE_W;
    if (ch.every(c=>isLeaf(c))) { const cols=Math.ceil(ch.length/2); return Math.max(NODE_W,cols*(NODE_W+H_GAP)-H_GAP); }
    return Math.max(NODE_W, ch.reduce((s,c,i)=>s+subtreeW(c)+(i>0?H_GAP:0),0));
  }

  const autoPos = {};
  function layoutNode(id, cx) {
    const d=p.devices.find(x=>x.id===id); if (!d) return;
    const row=tierToRow.get(getTier(d))??0;
    autoPos[id]={x:Math.round(cx-NODE_W/2), y:svgPad+row*(NODE_H+V_GAP)};
    const ch=treeChildren.get(id)||[];
    if (!ch.length) return;
    if (ch.every(c=>isLeaf(c))) {
      const cols=Math.ceil(ch.length/2),totalW=cols*(NODE_W+H_GAP)-H_GAP,startCX=cx-totalW/2+NODE_W/2;
      ch.forEach((cid,i) => {
        const cd=p.devices.find(x=>x.id===cid); if (!cd) return;
        const crow=tierToRow.get(getTier(cd))??0,col=Math.floor(i/2),sub=i%2;
        autoPos[cid]={x:Math.round(startCX+col*(NODE_W+H_GAP)-NODE_W/2),y:svgPad+crow*(NODE_H+V_GAP)+sub*STAGGER_Y};
      });
    } else {
      const totalW=ch.reduce((s,c,i)=>s+subtreeW(c)+(i>0?H_GAP:0),0); let curX=cx-totalW/2;
      ch.forEach(cid => { const sw=subtreeW(cid); layoutNode(cid,curX+sw/2); curX+=sw+H_GAP; });
    }
  }

  const connRoots = canvasDevs.filter(d=>!treeParent.get(d.id) && hasEdge.has(d.id));
  connRoots.sort((a,b)=>{const dt=getTier(a)-getTier(b);return dt||a.name.localeCompare(b.name);});
  const totalRootsW=connRoots.reduce((s,d,i)=>s+subtreeW(d.id)+(i>0?H_GAP*2:0),0);
  const baseW=Math.max(900, totalRootsW+svgPad*2);
  let rx=(baseW-totalRootsW)/2;
  connRoots.forEach(rd=>{const sw=subtreeW(rd.id);layoutNode(rd.id,rx+sw/2);rx+=sw+H_GAP*2;});

  // Crossing minimization (4 passes)
  for (let pass=0;pass<4;pass++) {
    treeChildren.forEach((ch,parentId)=>{
      if (ch.length<2) return;
      const pp=autoPos[parentId]; if (!pp) return;
      ch.sort((a,b)=>{const pa=autoPos[a],pb=autoPos[b];if(!pa||!pb)return 0;return(pa.x+NODE_W/2)-(pb.x+NODE_W/2);});
      const pcx=pp.x+NODE_W/2;
      if (ch.every(c=>isLeaf(c))) {
        const cols=Math.ceil(ch.length/2),tw=cols*(NODE_W+H_GAP)-H_GAP,scx=pcx-tw/2+NODE_W/2;
        ch.forEach((cid,i)=>{const cd=p.devices.find(x=>x.id===cid);if(!cd)return;const crow=tierToRow.get(getTier(cd))??0,col=Math.floor(i/2),sub=i%2;autoPos[cid]={x:Math.round(scx+col*(NODE_W+H_GAP)-NODE_W/2),y:svgPad+crow*(NODE_H+V_GAP)+sub*STAGGER_Y};});
      } else {
        const widths=ch.map(c=>subtreeW(c)),tw=widths.reduce((s,w,i)=>s+w+(i>0?H_GAP:0),0);let cx2=pcx-tw/2;
        ch.forEach((cid,i)=>{const sw=widths[i];if(autoPos[cid])autoPos[cid].x=Math.round(cx2+sw/2-NODE_W/2);cx2+=sw+H_GAP;});
      }
    });
  }

  // ── 2D Overlap resolution — multiple passes, push any overlapping pair apart ──
  const MARGIN = 12; // extra padding beyond node dimensions
  function resolveOverlaps(posMap) {
    const ids = Object.keys(posMap);
    for (let pass = 0; pass < 8; pass++) {
      let moved = false;
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = posMap[ids[i]], b = posMap[ids[j]];
          if (!a || !b) continue;
          const overlapX = (a.x + NODE_W + MARGIN) - b.x;
          const overlapY = (a.y + NODE_H + MARGIN) - b.y;
          if (overlapX <= 0 || overlapY <= 0) continue; // no overlap
          // Push apart along the smaller overlap axis
          if (overlapX < overlapY) {
            const half = Math.ceil(overlapX / 2);
            a.x -= half; b.x += half;
          } else {
            const half = Math.ceil(overlapY / 2);
            a.y -= half; b.y += half;
          }
          // Clamp to canvas
          a.x = Math.max(svgPad, a.x); a.y = Math.max(svgPad, a.y);
          b.x = Math.max(svgPad, b.x); b.y = Math.max(svgPad, b.y);
          moved = true;
        }
      }
      if (!moved) break;
    }
  }
  resolveOverlaps(autoPos);

  // Final positions: custom overrides auto; manually-placed disconnected devices use saved pos
  const positions = {};
  canvasDevs.forEach(d => {
    positions[d.id] = p.fcNodePositions[d.id] ? {...p.fcNodePositions[d.id]} : (autoPos[d.id] ? {...autoPos[d.id]} : null);
  });
  // Manually-placed devices not in canvasDevs (dropped from pool but still disconnected)
  p.devices.filter(d=>p.fcNodePositions[d.id]&&!hasEdge.has(d.id)).forEach(d=>{
    if (!positions[d.id]) positions[d.id]={...p.fcNodePositions[d.id]};
  });

  // Canvas dimensions
  const allPosArr=Object.values(positions).filter(Boolean);
  const CVS_W=Math.max(baseW, allPosArr.reduce((m,pos)=>Math.max(m,pos.x+NODE_W),baseW)+svgPad);
  const CVS_H=Math.max(360, allPosArr.reduce((m,pos)=>Math.max(m,pos.y+NODE_H),0)+svgPad);

  // ── SVG edges ──
  let edgeSvg=`<defs>
    <marker id="arr"  markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill="#2a5878"/></marker>
    <marker id="arrp" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill="#3366cc"/></marker>
  </defs>`;
  connectedPairs.forEach(({a,b,type})=>{
    const pa=positions[a],pb=positions[b]; if(!pa||!pb) return;
    const [top,bot]=pa.y<=pb.y?[pa,pb]:[pb,pa];
    const x1=top.x+NODE_W/2,y1=top.y+NODE_H,x2=bot.x+NODE_W/2,y2=bot.y;
    const dy=y2-y1,cp1y=y1+dy*0.45,cp2y=y2-dy*0.45,isP=type==='parent';
    edgeSvg+=`<path d="M${x1},${y1} C${x1},${cp1y} ${x2},${cp2y} ${x2},${y2}" stroke="${isP?'#3366cc':'#2a6080'}" stroke-width="1.5" stroke-dasharray="${isP?'7,3':'none'}" fill="none" marker-end="url(#${isP?'arrp':'arr'})" opacity="0.7"/>`;
  });

  // Tier labels
  const tlY=new Map();
  canvasDevs.forEach(d=>{const t=getTier(d);const pos=positions[d.id];if(!pos)return;if(!tlY.has(t)||pos.y<tlY.get(t))tlY.set(t,pos.y);});
  tlY.forEach((ly,tier)=>{const label=TIER_ORDER[tier]||'Device';edgeSvg+=`<text x="5" y="${ly+NODE_H/2+5}" font-family="Consolas,monospace" font-size="9" fill="#1d3548" letter-spacing="1">${label.toUpperCase()}</text>`;});

  // ── HTML node divs ──
  const selId=state.fcSelectedNode;
  const nodeDivs=Object.entries(positions).map(([id,pos])=>{
    if (!pos) return '';
    const d=p.devices.find(x=>x.id===id); if (!d) return '';
    const c=dtColor(d.deviceType||'Misc.');
    const isSel=selId===id;
    const isUnconn=!hasEdge.has(id);
    const border=isSel?'2px solid #fff':`1.5px solid ${c}`;
    const bg=isSel?`${c}33`:`${c}1a`;
    const glow=isSel?`box-shadow:0 0 12px ${c}88,0 0 0 2px #fff3;`:'';
    const nameShort=d.name.length>15?d.name.slice(0,14)+'…':d.name;
    const childCount=(treeChildren.get(id)||[]).length;
    const subtag=d.ip||(childCount>0?`${childCount} connected`:d.deviceType||'');
    const unlinkBadge=isUnconn?`<span style="position:absolute;top:-8px;right:2px;background:#ff6633;color:#fff;font-size:8px;border-radius:6px;padding:1px 5px;font-family:Consolas,monospace;pointer-events:none">UNLINKED</span>`:'';
    return `<div id="fcn-${id}" data-fcid="${id}" draggable="true"
      ondragstart="fcNodeDragStart(event,'${id}')"
      ontouchstart="startFcNodeDrag(event,'${id}',false)"
      onclick="event.stopPropagation();fcSelectDevice('${id}')"
      style="position:absolute;left:${pos.x}px;top:${pos.y}px;width:${NODE_W}px;height:${NODE_H}px;
        border-radius:5px;border:${border};background:${bg};${glow}
        cursor:grab;user-select:none;display:flex;align-items:center;overflow:visible;
        transition:box-shadow .15s;z-index:${isSel?10:1}">
      ${unlinkBadge}
      <span style="width:8px;height:8px;border-radius:50%;background:${c};flex-shrink:0;margin:0 8px"></span>
      <div style="flex:1;min-width:0;overflow:hidden">
        <div style="font-size:11px;font-weight:600;color:#cce4f8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(nameShort)}</div>
        <div style="font-size:9px;color:${c};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:Consolas,monospace">${esc(subtag)}</div>
      </div>
    </div>`;
  }).join('');

  // ── Unassigned side panel ──
  const unassignedHtml = unassignedDevs.length===0
    ? `<div style="font-size:11px;color:var(--text3);padding:10px 4px;text-align:center">All devices on chart</div>`
    : unassignedDevs.map(d=>{
        const c=dtColor(d.deviceType||'Misc.');
        const mac4=(d.mac||'').replace(/[^a-fA-F0-9]/g,'').slice(-4).toUpperCase();
        const subtitle=[d.deviceType||'Misc.',d.ip,mac4||''].filter(Boolean).join(' · ');
        return `<div draggable="true"
          ondragstart="fcPoolDragStart(event,'${d.id}')"
          ontouchstart="startFcNodeDrag(event,'${d.id}',true)"
          onclick="fcQuickAssign('${d.id}')"
          title="Drag onto chart to place · Click to assign to a Switch/AP"
          style="display:flex;align-items:center;gap:8px;padding:7px 9px;margin-bottom:5px;
            border-radius:5px;border:1px solid ${c}55;background:${c}0d;cursor:grab;user-select:none">
          <span style="width:7px;height:7px;border-radius:50%;background:${c};flex-shrink:0"></span>
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;font-weight:600;color:#cce4f8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(d.name)}</div>
            <div style="font-size:10px;color:${c};font-family:Consolas,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(subtitle)}</div>
          </div>
          <span style="font-size:16px;color:var(--text3)" title="Click to connect">⊕</span>
        </div>`;
      }).join('');

  // Selected device bar
  const selDev=selId?p.devices.find(d=>d.id===selId):null;
  const selBar=selDev?`
    <div style="margin-top:10px;background:var(--card2);border:1px solid var(--border2);border-radius:8px;padding:12px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <span style="width:10px;height:10px;border-radius:50%;background:${dtColor(selDev.deviceType||'Misc.')};flex-shrink:0;display:inline-block"></span>
      <div>
        <div style="font-size:14px;font-weight:600">${esc(selDev.name)}</div>
        <div style="font-size:11px;color:var(--text2);font-family:var(--mono)">${dtBadge(selDev.deviceType||'Misc.')} &nbsp;${esc(selDev.ip||'No IP')}</div>
      </div>
      <div style="margin-left:auto;display:flex;gap:7px;flex-wrap:wrap">
        ${!hasEdge.has(selId)?`<button class="btn btn-primary btn-sm" onclick="fcQuickAssign('${selId}')">⊕ Assign to Device</button>`:''}
        <button class="btn btn-ghost btn-sm" onclick="editDevice('${selId}');state.fcSelectedNode=null;">✎ Edit</button>
        ${p.fcNodePositions[selId]?`<button class="btn btn-ghost btn-sm" onclick="fcClearPos('${selId}')">↺ Auto-place</button>`:''}
        <button class="btn btn-ghost btn-sm" onclick="state.fcSelectedNode=null;renderFlowchart()">✕</button>
      </div>
    </div>`:'';

  document.getElementById('view-area').innerHTML = `
    <div style="margin-bottom:8px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <span style="font-size:12px;color:var(--text2)">Drag nodes to reposition. Drag from panel to place on chart. Click a node to inspect.</span>
      <span style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text2)"><svg width="24" height="10"><line x1="0" y1="5" x2="24" y2="5" stroke="#2a6080" stroke-width="1.5"/></svg> Port wired</span>
      <span style="display:flex;align-items:center;gap:5px;font-size:11px;color:#3366cc"><svg width="24" height="10"><line x1="0" y1="5" x2="24" y2="5" stroke="#3366cc" stroke-width="1.5" stroke-dasharray="7,3"/></svg> Assigned to Switch/AP</span>
    </div>
    <div class="fc-main-layout">
      <div style="flex:1;min-width:0">
        <div id="fc-canvas-wrap" style="position:relative;overflow:auto;border:1px solid var(--border);border-radius:8px;background:var(--card);min-height:300px"
          ondragover="event.preventDefault()" ondrop="fcDropOnCanvas(event)">
          <svg id="fc-edge-svg" width="${CVS_W}" height="${CVS_H}" style="position:absolute;top:0;left:0;pointer-events:none;display:block">${edgeSvg}</svg>
          <div style="width:${CVS_W}px;height:${CVS_H}px;position:relative">${nodeDivs}</div>
        </div>
        ${selBar}
      </div>
      <div class="fc-pool-panel">
        <div style="font-size:10px;color:var(--text3);font-family:var(--mono);letter-spacing:1px;text-transform:uppercase;margin-bottom:6px;border-bottom:1px solid var(--border);padding-bottom:6px">
          Unassigned (${unassignedDevs.length})
        </div>
        <div style="font-size:10px;color:var(--text3);margin-bottom:8px">Drag onto chart · tap ⊕ to connect</div>
        <div id="fc-pool" ondragover="event.preventDefault()" ondrop="fcDropToPool(event)">
          ${unassignedHtml}
        </div>
      </div>
    </div>`;
}

function fcNodeDragStart(e, id) {
  _fcDragId=id; _fcDragFromPool=false;
  const el=document.getElementById('fcn-'+id);
  if (el) { const r=el.getBoundingClientRect(); _fcDragOffX=e.clientX-r.left; _fcDragOffY=e.clientY-r.top; }
  else { _fcDragOffX=20; _fcDragOffY=20; }
  e.dataTransfer.setData('text/plain','fc-node:'+id);
  e.dataTransfer.effectAllowed='move';
}

function fcPoolDragStart(e, id) {
  _fcDragId=id; _fcDragFromPool=true; _fcDragOffX=20; _fcDragOffY=20;
  e.dataTransfer.setData('text/plain','fc-pool:'+id);
  e.dataTransfer.effectAllowed='copy';
}

function fcDropOnCanvas(e) {
  e.preventDefault();
  const raw=e.dataTransfer.getData('text/plain'); if (!raw) return;
  const id=raw.replace(/^fc-(node|pool):/,'');
  const p=getProject(); if (!p.fcNodePositions) p.fcNodePositions={};
  const wrap=document.getElementById('fc-canvas-wrap'); if (!wrap) return;
  const rect=wrap.getBoundingClientRect();
  const x=Math.max(4,Math.round(e.clientX-rect.left+wrap.scrollLeft-_fcDragOffX));
  const y=Math.max(4,Math.round(e.clientY-rect.top+wrap.scrollTop-_fcDragOffY));
  p.fcNodePositions[id]={x,y};
  save(); renderFlowchart();
}

function fcDropToPool(e) {
  e.preventDefault();
  const raw=e.dataTransfer.getData('text/plain'); if (!raw||!raw.startsWith('fc-node:')) return;
  const id=raw.replace('fc-node:','');
  const p=getProject();
  const dev=p.devices.find(d=>d.id===id); if (!dev) return;
  const hasConn=Object.keys(dev.portAssignments||{}).length>0||!!dev.parentDeviceId||
    p.devices.some(x=>x.id!==id&&Object.values(x.portAssignments||{}).includes(id));
  if (hasConn) { toast('Disconnect device from others first','error'); return; }
  if (p.fcNodePositions) delete p.fcNodePositions[id];
  save(); renderFlowchart();
}

function fcClearPos(id) {
  const p=getProject(); if (p.fcNodePositions) delete p.fcNodePositions[id];
  save(); renderFlowchart();
}

function fcResetLayout() {
  if (!confirm('Reset all custom node positions? Layout will be recalculated.')) return;
  const p=getProject(); p.fcNodePositions={};
  save(); renderFlowchart(); toast('Layout reset','success');
}

function fcSelectDevice(id) {
  state.fcSelectedNode = state.fcSelectedNode===id ? null : id;
  renderFlowchart();
}

function fcQuickAssign(deviceId) {
  const p=getProject();
  const dev=p.devices.find(d=>d.id===deviceId); if (!dev) return;
  const candidates=p.devices.filter(d=>d.id!==deviceId&&(PORT_CAPABLE.has(d.deviceType||'')||d.deviceType==='AP'||d.deviceType==='Router'||d.deviceType==='Firewall'||d.deviceType==='Modem'));
  if (!candidates.length) { toast('No connectable devices found','error'); return; }
  const opts=`<option value="">— None (remove connection) —</option>`+
    candidates.map(c=>{
      const mac4=(c.mac||'').replace(/[^a-fA-F0-9]/g,'').slice(-4).toUpperCase();
      const suffix=[c.ip,mac4||''].filter(Boolean).join(' - ');
      return `<option value="${c.id}"${dev.parentDeviceId===c.id?' selected':''}>${esc(c.name)}${suffix?' — '+esc(suffix):''}</option>`;
    }).join('');
  openModal(`<h3>Assign "${esc(dev.name)}" to a Device</h3>
    <p style="color:var(--text2);font-size:12px;margin-bottom:14px">Select a Switch, AP, or router to link this device into the topology as a dashed line.</p>
    <div class="form-row"><label>Connect to</label>
      <select class="form-control" id="fq-parent">${opts}</select></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="fcSaveQuickAssign('${deviceId}')">Save</button>
    </div>`);
}

function fcSaveQuickAssign(deviceId) {
  const p=getProject();
  const dev=p.devices.find(d=>d.id===deviceId); if (!dev) return;
  const newPid=document.getElementById('fq-parent')?.value||null;
  const oldParent=dev.parentDeviceId?p.devices.find(d=>d.id===dev.parentDeviceId):null;
  const newParent=newPid?p.devices.find(d=>d.id===newPid):null;
  dev.parentDeviceId=newPid||null;
  if (newPid) logChange(`Topology linked: ${dev.name} → ${newParent?newParent.name:newPid}`);
  else if (oldParent) logChange(`Topology unlinked: ${dev.name} from ${oldParent.name}`);
  save(); closeModal(); renderFlowchart();
  toast(newPid?`Connected to ${newParent?.name||'device'}`:'Connection removed','success');
}

// Touch + mouse drag for flowchart nodes and pool items
function startFcNodeDrag(e, id, fromPool) {
  const isTouch = e.type.startsWith('touch');
  e.preventDefault();
  e.stopPropagation();
  _fcDragId = id; _fcDragFromPool = fromPool;

  const getXY = ev => isTouch
    ? { x:(ev.touches[0]||ev.changedTouches[0]).clientX, y:(ev.touches[0]||ev.changedTouches[0]).clientY }
    : { x:ev.clientX, y:ev.clientY };

  const startXY = getXY(e);
  let moved = false;

  let ghost = null;
  if (!fromPool) {
    const el = document.getElementById('fcn-'+id);
    if (el) {
      const r = el.getBoundingClientRect();
      _fcDragOffX = startXY.x - r.left; _fcDragOffY = startXY.y - r.top;
    } else { _fcDragOffX = 20; _fcDragOffY = 20; }
  }

  const onMove = ev => {
    const {x,y} = getXY(ev);
    if (!moved) {
      if (Math.abs(x-startXY.x) < 8 && Math.abs(y-startXY.y) < 8) return;
      moved = true;
      if (fromPool) {
        ghost = document.createElement('div');
        ghost.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;background:rgba(0,200,255,0.15);border:1.5px solid var(--accent);border-radius:5px;padding:5px 10px;font-size:11px;color:#cce4f8;font-weight:600;white-space:nowrap;transform:translate(-50%,-50%)';
        const p2 = getProject(); const dev2 = p2.devices.find(d=>d.id===id);
        ghost.textContent = dev2 ? dev2.name.slice(0,16) : '...';
        ghost.style.left = x+'px'; ghost.style.top = y+'px';
        document.body.appendChild(ghost);
      }
    }
    if (isTouch) ev.preventDefault();
    if (ghost) {
      ghost.style.left = x+'px'; ghost.style.top = y+'px';
      const wrap = document.getElementById('fc-canvas-wrap');
      if (wrap) { const r=wrap.getBoundingClientRect(); wrap.style.outline=(x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom)?'2px solid var(--accent)':''; }
    } else if (moved) {
      const el = document.getElementById('fcn-'+id);
      const wrap = document.getElementById('fc-canvas-wrap');
      if (el && wrap) {
        const r = wrap.getBoundingClientRect();
        el.style.left = Math.max(4,Math.round(x-r.left+wrap.scrollLeft-_fcDragOffX))+'px';
        el.style.top  = Math.max(4,Math.round(y-r.top +wrap.scrollTop -_fcDragOffY))+'px';
      }
    }
  };

  const onUp = ev => {
    if (isTouch) ev.preventDefault();
    document.removeEventListener(isTouch?'touchmove':'mousemove', onMove);
    document.removeEventListener(isTouch?'touchend':'mouseup',   onUp);
    const wrap = document.getElementById('fc-canvas-wrap');
    if (wrap) wrap.style.outline = '';
    if (ghost) { ghost.remove(); ghost = null; }

    if (!moved && !fromPool) {
      _fcDragId = null;
      fcSelectDevice(id);
      return;
    }

    const {x,y} = getXY(ev);
    const p2 = getProject(); if (!p2.fcNodePositions) p2.fcNodePositions = {};
    if (fromPool) {
      if (moved && wrap) {
        const r = wrap.getBoundingClientRect();
        if (x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom) {
          p2.fcNodePositions[id] = { x:Math.max(4,Math.round(x-r.left+wrap.scrollLeft-60)), y:Math.max(4,Math.round(y-r.top+wrap.scrollTop-18)) };
          save(); renderFlowchart();
        }
      }
    } else {
      const el = document.getElementById('fcn-'+id);
      if (el) { p2.fcNodePositions[id] = { x:parseInt(el.style.left)||0, y:parseInt(el.style.top)||0 }; save(); renderFlowchart(); }
    }
    _fcDragId = null;
  };

  document.addEventListener(isTouch?'touchmove':'mousemove', onMove, {passive:false});
  document.addEventListener(isTouch?'touchend':'mouseup',   onUp,   {passive:false});
}
