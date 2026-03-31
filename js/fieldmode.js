function renderFieldMode() {
  const p = getProject();
  setTopbarActions('');
  const today = new Date().toISOString().slice(0,10);
  const todayDevs = p.devices.filter(d => d.addedDate && d.addedDate.startsWith(today));
  const todayPhotos = (p.photos||[]).filter(ph => {
    if (ph.ts && ph.ts.startsWith(today)) return true;
    if (ph.date && new Date(ph.date).toISOString().startsWith(today)) return true;
    return false;
  });

  document.getElementById('view-area').innerHTML = `
    <div style="max-width:640px;margin:0 auto">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px">
        <div class="field-btn" onclick="fieldQuickPhoto()">
          <div class="fbi">📷</div>
          <div class="fbl">Quick Photo</div>
          <div style="font-size:11px;color:var(--text2)">Capture & label</div>
        </div>
        <div class="field-btn" onclick="fieldQuickDevice()">
          <div class="fbi">⊕</div>
          <div class="fbl">Quick Device</div>
          <div style="font-size:11px;color:var(--text2)">Fast add device</div>
        </div>
        <div class="field-btn" onclick="fieldQuickNote()">
          <div class="fbi">📝</div>
          <div class="fbl">Quick Note</div>
          <div style="font-size:11px;color:var(--text2)">Site note</div>
        </div>
        <div class="field-btn" style="opacity:.5;cursor:default">
          <div class="fbi">🔍</div>
          <div class="fbl">Scan Subnet</div>
          <div style="font-size:11px;color:var(--text2)">Coming soon</div>
        </div>
      </div>

      <div style="margin-bottom:16px">
        <div style="font-size:12px;color:var(--text2);font-family:var(--mono);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Today's Captures</div>
        ${todayDevs.length===0&&todayPhotos.length===0 ? `<div style="color:var(--text3);font-size:13px;padding:16px;background:var(--card);border:1px solid var(--border);border-radius:7px">Nothing captured today yet.</div>` : ''}
        ${todayDevs.map(d=>`
          <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--card);border:1px solid var(--border);border-radius:7px;margin-bottom:6px;cursor:pointer" onclick="editDevice('${d.id}')">
            <span style="font-size:18px">${d.deviceType==='AP'?'📶':d.deviceType==='Switch'?'⊡':d.deviceType==='Server'?'⬜':'◈'}</span>
            <div style="flex:1;min-width:0">
              <div style="font-weight:600">${esc(d.name)}</div>
              <div style="font-size:11px;color:var(--text2);font-family:var(--mono)">${esc(d.deviceType||'')} ${d.ip?'· '+d.ip:''}</div>
            </div>
            ${statusBadge(d.status)}
          </div>`).join('')}
        ${todayPhotos.map(ph=>`
          <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--card);border:1px solid var(--border);border-radius:7px;margin-bottom:6px">
            <span style="font-size:18px">📷</span>
            <div style="flex:1;min-width:0"><div style="font-weight:600">${esc(ph.caption||'(No caption)')}</div>
            <div style="font-size:11px;color:var(--text2);font-family:var(--mono)">${fmtTs(ph.ts || (ph.date ? new Date(ph.date).toISOString() : ''))}</div></div>
          </div>`).join('')}
      </div>
    </div>`;
}

function fieldQuickPhoto() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.setAttribute('capture','environment');
  input.style.display='none';
  document.body.appendChild(input);
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const caption = prompt('Caption for this photo:','');
    if (caption === null) return;
    const p = getProject();
    if (!p.photos) p.photos=[];
    if (!p.photoFolders) p.photoFolders=[];
    const reader = new FileReader();
    reader.onload = ev => {
      const photo = { id:genId(), name:file.name, caption:caption||file.name, data:ev.target.result, ts:new Date().toISOString(), date:Date.now(), size:file.size, folderId:'', assignments:[] };
      p.photos.push(photo);
      logChange(`Photo added (field): "${photo.caption}"`);
      save();
      renderFieldMode();
      toast('Photo added','success');
    };
    reader.readAsDataURL(file);
    input.remove();
  };
  input.click();
}

function fieldQuickDevice() {
  const DTYPE_OPTS = DEVICE_TYPES.map(t=>`<option value="${t}">${t}</option>`).join('');
  openModal(`
    <h3>⊕ Quick Add Device</h3>
    <div class="form-row"><label>Device Name *</label>
      <input class="form-control" id="fqd-name" placeholder="e.g. AP-Floor2-East" style="font-size:16px;padding:12px"></div>
    <div class="form-row"><label>Type</label>
      <select class="form-control" id="fqd-type">${DTYPE_OPTS}</select></div>
    <div class="form-row-inline">
      <div class="form-row"><label>IP Address</label>
        <input class="form-control" id="fqd-ip" placeholder="192.168.1.x" type="text" inputmode="decimal"></div>
      <div class="form-row"><label>MAC Address</label>
        <input class="form-control" id="fqd-mac" placeholder="00:11:22:33:44:55"></div>
    </div>
    <div class="form-row"><label>Status</label>
      <select class="form-control" id="fqd-status">
        <option value="">— No Status —</option>
        <option value="verified">✓ Verified</option>
        <option value="needs-label">⚠ Needs Label</option>
        <option value="needs-attention">⚠ Needs Attention</option>
        <option value="unknown">? Unknown</option>
      </select></div>
    <div class="form-row"><label>Location / Notes</label>
      <textarea class="form-control" id="fqd-notes" rows="2" placeholder="Location, notes..."></textarea></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveFieldDevice()" style="font-size:15px;padding:10px 24px">Add Device</button>
    </div>`,'480px');
  setTimeout(()=>document.getElementById('fqd-name')?.focus(),50);
}

function saveFieldDevice() {
  const name = document.getElementById('fqd-name')?.value?.trim();
  if (!name) return toast('Device name is required','error');
  const p = getProject();
  const deviceType = document.getElementById('fqd-type')?.value||'Misc.';
  const newDev = {
    id:genId(), name, deviceType,
    type: deviceType==='Switch'?'switching':'non-switching',
    ip: document.getElementById('fqd-ip')?.value?.trim()||'',
    mac: document.getElementById('fqd-mac')?.value?.trim()||'',
    manufacturer:'', model:'', ports:0,
    notes: document.getElementById('fqd-notes')?.value?.trim()||'',
    parentDeviceId:null, webUser:'', webPassword:'', webProtocol:'https',
    deviceUHeight:1, status: document.getElementById('fqd-status')?.value||'',
    serial:'', warrantyExpiry:'', eolDate:'',
    addedDate: new Date().toISOString(),
    rackId:null, rackU:null,
    portAssignments:{}, portNotes:{}, portVlans:{}, portPeerPort:{}, portPoe:{}, portLabels:{}
  };
  p.devices.push(newDev);
  logChange(`Device added (field mode): ${name} (${deviceType})`);
  save(); closeModal(); renderFieldMode(); toast('Device added','success');
}

function fieldQuickNote() {
  openModal(`
    <h3>📝 Quick Note</h3>
    <div class="form-row">
      <textarea class="form-control" id="fqn-text" rows="4" placeholder="Type your site note..." style="font-size:16px;padding:12px"></textarea>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveFieldNote()" style="font-size:15px;padding:10px 24px">Add Note</button>
    </div>`,'440px');
  setTimeout(()=>document.getElementById('fqn-text')?.focus(),50);
}

function saveFieldNote() {
  const text = document.getElementById('fqn-text')?.value?.trim();
  if (!text) return toast('Note is required','error');
  const p = getProject();
  if (!p.siteNotes) p.siteNotes=[];
  p.siteNotes.unshift({id:genId(),ts:new Date().toISOString(),text});
  logChange(`Site note added (field): "${text.slice(0,60)}"`);
  save(); closeModal(); renderFieldMode(); toast('Note added','success');
}
