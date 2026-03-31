function renderScan() {
  setTopbarActions(`<button class="btn btn-primary btn-sm" onclick="addDevice()">+ Add Device Manually</button>`);
  document.getElementById('view-area').innerHTML = `
    <div style="max-width:600px">
      <div style="background:var(--card);border:1px solid var(--border);border-radius:8px;padding:20px;margin-bottom:20px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
          <span style="font-size:24px">⊛</span>
          <div>
            <div style="font-size:15px;font-weight:600">Manual Device Entry</div>
            <div style="font-size:12px;color:var(--text2)">Browser-based scanning is not possible without server software. Add devices manually or import from a scan file.</div>
          </div>
        </div>
        <div class="form-row">
          <label>Subnet Range</label>
          <input class="form-control" id="scan-subnet" placeholder="192.168.1.0/24" value="192.168.1.0/24">
        </div>
        <div style="display:flex;gap:8px;margin-top:4px;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" onclick="importAngryIP()">⇩ Angry IP Scanner File</button>
          <button class="btn btn-ghost btn-sm" onclick="importArpTable()">⇩ ARP Table (arp -a)</button>
          <button class="btn btn-ghost btn-sm" onclick="importScanCSV()">⇩ Import from CSV</button>
        </div>
        <input type="file" id="angry-ip-input" accept=".txt,.csv" style="display:none" onchange="handleAngryIPImport(event)">
        <input type="file" id="csv-input" accept=".csv,.txt" style="display:none" onchange="handleCSVImport(event)">
      </div>
      <div style="background:var(--card);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:12px">
        <div style="font-size:12px;color:var(--text2);font-family:var(--mono);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">ARP Table Format <span style="color:var(--text3);font-weight:400">(paste output of <code style="color:var(--accent)">arp -a</code> from cmd/terminal)</span></div>
        <div style="font-size:11px;color:var(--text2);margin-bottom:6px">Supports both Windows and Linux/macOS formats. Devices with only an IP and no MAC are skipped.</div>
        <pre style="font-size:11px;color:var(--green);background:var(--panel);padding:10px;border-radius:5px;overflow-x:auto"># Windows (cmd: arp -a)
  192.168.1.1          aa-bb-cc-dd-ee-ff     dynamic
  192.168.1.10         aa-bb-cc-dd-ee-01     dynamic

# Linux / macOS (terminal: arp -a)
router.local (192.168.1.1) at aa:bb:cc:dd:ee:ff [ether] on eth0
server01 (192.168.1.10) at aa:bb:cc:dd:ee:01 [ether] on eth0</pre>
      </div>
      <div style="background:var(--card);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:12px">
        <div style="font-size:12px;color:var(--text2);font-family:var(--mono);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Angry IP Scanner Export Format</div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:6px">File → Save → TXT or CSV. Recommended columns: <span style="color:var(--accent)">IP Address, Hostname, Ping, MAC Address, Manufacturer, Open Ports</span></div>
        <pre style="font-size:11px;color:var(--green);background:var(--panel);padding:10px;border-radius:5px;overflow-x:auto">IP Address	Ping	Hostname	MAC Address	Manufacturer	Open Ports
192.168.1.1	1ms	router.local	AA:BB:CC:DD:EE:FF	Cisco Systems	80,443,22
192.168.1.10	2ms	server01	AA:BB:CC:DD:EE:01	Dell Inc.	22,80</pre>
      </div>
      <div style="background:var(--card);border:1px solid var(--border);border-radius:8px;padding:16px">
        <div style="font-size:12px;color:var(--text2);font-family:var(--mono);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Manual CSV Format <span style="color:var(--text3);font-weight:400">(rows with only an IP are skipped)</span></div>
        <pre style="font-size:12px;color:var(--green);background:var(--panel);padding:12px;border-radius:5px;overflow-x:auto">name,type,ip,mac,manufacturer,model,ports
Core-SW-01,switching,192.168.1.1,AA:BB:CC:DD:EE:01,Cisco,C9200-24T,24
AP-Office,non-switching,192.168.1.10,AA:BB:CC:DD:EE:02,Ubiquiti,AP-AC-Pro,0</pre>
      </div>
    </div>`;
}

function importScanCSV() { document.getElementById('csv-input')?.click(); }

function handleCSVImport(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const p = getProject();
    const lines = ev.target.result.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('name'));
    const candidates = []; let skipped = 0;
    lines.forEach(line => {
      const [name, type, ip, mac, manufacturer, model, ports] = line.split(',').map(s => s.trim());
      if (!name) return;
      const hasName = name && name !== ip;
      const hasMac  = mac && mac.length > 0;
      if (!hasName && !hasMac) { skipped++; return; }
      if (ip && p.devices.find(d => d.ip === ip)) { skipped++; return; }
      candidates.push({ id: genId(), name, deviceType: type||'Misc.', type: type||'non-switching', ip: ip||'', mac: mac||'', manufacturer: manufacturer||'', model: model||'', ports: parseInt(ports)||0, notes:'', rackId:null, rackU:null, portAssignments:{}, portNotes:{}, portVlans:{}, portPeerPort:{}, portPoe:{}, portLabels:{} });
    });
    e.target.value = '';
    if (candidates.length === 0) { toast(`No valid rows${skipped?' — '+skipped+' skipped':''}`, 'error'); return; }
    showImportReviewNamed(candidates, `CSV File${skipped?' ('+skipped+' rows pre-filtered)':''}`);
  };
  reader.readAsText(file);
}

// ─── ARP TABLE IMPORT ───
function importArpTable() {
  openModal(`
    <h3>Import from ARP Table</h3>
    <p style="color:var(--text2);font-size:12px;margin-bottom:14px">
      Run <code style="background:var(--panel);padding:2px 6px;border-radius:3px;color:var(--accent);font-family:var(--mono)">arp -a</code>
      in Command Prompt or terminal, then paste the output below.<br>
      <span style="color:var(--text3)">Entries with no MAC address (incomplete/static placeholders) are skipped.</span>
    </p>
    <div class="form-row">
      <label>Paste ARP output</label>
      <textarea class="form-control" id="arp-paste" rows="12"
        style="font-family:var(--mono);font-size:12px;resize:vertical;min-height:180px"
        placeholder="Interface: 192.168.1.100 --- 0x7\n  Internet Address      Physical Address      Type\n  192.168.1.1           aa-bb-cc-dd-ee-ff     dynamic\n\n# or Linux/macOS:\nrouter.local (192.168.1.1) at aa:bb:cc:dd:ee:ff [ether] on eth0"></textarea>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="processArpPaste()">Import Devices</button>
    </div>
  `);
  setTimeout(() => document.getElementById('arp-paste')?.focus(), 50);
}

function processArpPaste() {
  const text = document.getElementById('arp-paste')?.value || '';
  if (!text.trim()) return toast('Nothing pasted', 'error');
  const { candidates, skipped } = parseArpCandidates(text);
  closeModal();
  if (candidates.length === 0) {
    toast(`No valid entries found — ${skipped} entries had no MAC address or were duplicates`, 'error');
  } else {
    showImportReviewNamed(candidates, `ARP Table${skipped?' ('+skipped+' entries pre-filtered)':''}`);
  }
}

function parseArpCandidates(text) {
  const p = getProject();
  const MAC_RE   = /([0-9a-fA-F]{2}[:\-]){5}[0-9a-fA-F]{2}/;
  const IP_RE    = /\b(\d{1,3}(?:\.\d{1,3}){3})\b/;
  const BAD_MACS = new Set(['ff-ff-ff-ff-ff-ff','ff:ff:ff:ff:ff:ff','00-00-00-00-00-00','00:00:00:00:00:00']);
  const SWITCH_RE = /switch|catalyst|procurve|juniper|netgear gs|cisco sg|aruba|extreme|brocade|mellanox/i;
  const candidates = []; let skipped = 0;

  text.split('\n').forEach(rawLine => {
    const line = rawLine.trim();
    if (!line || /^interface|^#/i.test(line)) return;
    const macMatch = line.match(MAC_RE);
    const ipMatch  = line.match(IP_RE);
    if (!ipMatch) { skipped++; return; }
    if (!macMatch) { skipped++; return; }
    const ip  = ipMatch[1];
    const mac = macMatch[0].replace(/-/g, ':').toUpperCase();
    if (BAD_MACS.has(mac.toLowerCase())) { skipped++; return; }
    if (p.devices.find(d => d.ip === ip)) { skipped++; return; }
    let hostname = '';
    const linuxMatch = line.match(/^([^\s(]+)\s*\(\d/);
    if (linuxMatch && linuxMatch[1] !== '?') hostname = linuxMatch[1].trim();
    const name = hostname || ip;
    const isSw = SWITCH_RE.test(name);
    candidates.push({ id: genId(), name, ip, mac, manufacturer:'', model:'', deviceType: isSw?'Switch':'Misc.', type: isSw?'switching':'non-switching', ports: isSw?24:0, notes:'', rackId:null, rackU:null, portAssignments:{}, portNotes:{}, portVlans:{}, portPeerPort:{}, portPoe:{}, portLabels:{} });
  });
  return { candidates, skipped };
}

function importAngryIP() { document.getElementById('angry-ip-input')?.click(); }

function handleAngryIPImport(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const raw = ev.target.result;
    const firstLine = raw.split('\n')[0] || '';
    const delim = firstLine.includes('\t') ? '\t' : ',';
    const lines = raw.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length < 1) { toast('File appears empty', 'error'); e.target.value = ''; return; }

    // Parse header row to map column names → indices
    const headerLine = lines[0].split(delim).map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
    const col = {};
    headerLine.forEach((h, i) => {
      if (/ip.?addr|^ip$/.test(h))              col.ip = i;
      if (/host(name)?/.test(h))                col.hostname = i;
      if (/ping|latency|rtt/.test(h))           col.ping = i;
      if (/mac.?addr|^mac$/.test(h))            col.mac = i;
      if (/manufacturer|vendor|maker/.test(h))  col.mfr = i;
      if (/open.?port|ports/.test(h))           col.ports = i;
      if (/comment|note|desc/.test(h))          col.note = i;
    });

    // If no ip column found, try headerless mode (Angry IP default plain export)
    const hasHeader = col.ip !== undefined;
    if (!hasHeader) { col.ip = 0; col.ping = 1; col.hostname = 2; col.ports = 3; col.mac = 4; col.mfr = 5; }

    const SWITCH_RE = /switch|catalyst|procurve|juniper|netgear gs|cisco sg|aruba|extreme|brocade|mellanox|poe hub|sfp/i;
    const p = getProject();
    let skipped = 0;
    const candidates = [];
    const dataLines = hasHeader ? lines.slice(1) : lines;

    dataLines.forEach(line => {
      if (!line) return;
      const cols = delim === ','
        ? parseCSVLine(line)
        : line.split('\t').map(c => c.replace(/^["']|["']$/g, '').trim());

      const ip  = (cols[col.ip] || '').trim().replace(/^["']|["']$/g, '');
      if (!ip || !/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) { skipped++; return; }
      if (p.devices.find(d => d.ip === ip)) { skipped++; return; }

      const hostname = (cols[col.hostname] || '').replace(/^["']|["']$/g, '').trim();
      const mac      = (cols[col.mac]      || '').replace(/^["']|["']$/g, '').trim().toUpperCase();
      const mfr      = (cols[col.mfr]      || '').replace(/^["']|["']$/g, '').trim();
      const openPts  = (cols[col.ports]    || '').replace(/^["']|["']$/g, '').trim();
      const note     = (cols[col.note]     || '').replace(/^["']|["']$/g, '').trim();
      const name     = (hostname && hostname.toLowerCase() !== 'n/a') ? hostname : ip;

      const hasRealName = name && name !== ip;
      const hasMac      = mac && mac.length > 0;
      if (!hasRealName && !hasMac) { skipped++; return; }
      const isSw     = SWITCH_RE.test(mfr) || SWITCH_RE.test(name);
      const portCount = isSw ? (openPts.split(/[,;]/).length > 20 ? 48 : 24) : 0;

      candidates.push({
        id: genId(), name, ip, mac,
        manufacturer: mfr, model: '',
        deviceType: isSw ? 'Switch' : 'Misc.',
        type: isSw ? 'switching' : 'non-switching',
        ports: portCount,
        notes: [openPts ? 'Open: '+openPts : '', note].filter(Boolean).join(' | '),
        rackId: null, rackU: null,
        portAssignments: {}, portNotes: {}, portVlans: {}, portPeerPort: {}, portPoe:{}, portLabels:{}
      });
    });

    e.target.value = '';
    if (candidates.length === 0) {
      toast('No new devices found' + (skipped ? ` — ${skipped} already exist or invalid` : ''), 'error');
    } else {
      showImportReviewNamed(candidates, `Angry IP Scanner${skipped?' ('+skipped+' pre-filtered)':''}`);
    }
  };
  reader.readAsText(file);
}

function parseCSVLine(line) {
  const result = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
    else { cur += c; }
  }
  result.push(cur.trim());
  return result;
}

function generateSampleDevices() {
  const p = getProject();
  const subnet = (document.getElementById('scan-subnet')?.value||'192.168.1').replace(/\/\d+$/, '').split('.').slice(0,3).join('.');
  const samples = [
    { name:'Core-SW-01', deviceType:'Switch', ip:`${subnet}.1`, mac:'AA:BB:CC:DD:EE:01', manufacturer:'Cisco', model:'C9200-24T', ports:24 },
    { name:'Dist-SW-01', deviceType:'Switch', ip:`${subnet}.2`, mac:'AA:BB:CC:DD:EE:02', manufacturer:'Cisco', model:'C9200-48T', ports:48 },
    { name:'Server-Web', deviceType:'Server', ip:`${subnet}.10`, mac:'AA:BB:CC:DD:EE:10', manufacturer:'Dell', model:'R640', ports:0 },
    { name:'Server-DB', deviceType:'Server', ip:`${subnet}.11`, mac:'AA:BB:CC:DD:EE:11', manufacturer:'Dell', model:'R740', ports:0 },
    { name:'AP-Floor1', deviceType:'AP', ip:`${subnet}.20`, mac:'AA:BB:CC:DD:EE:20', manufacturer:'Ubiquiti', model:'AP-AC-Pro', ports:0 },
    { name:'Firewall-01', deviceType:'Firewall', ip:`${subnet}.254`, mac:'AA:BB:CC:DD:EE:FE', manufacturer:'Fortinet', model:'FG-100F', ports:16 },
  ];
  const candidates = samples
    .filter(s => !p.devices.find(d => d.ip === s.ip))
    .map(s => ({ id:genId(), ...s, type: PORT_CAPABLE.has(s.deviceType)?'switching':'non-switching', notes:'', rackId:null, rackU:null, portAssignments:{}, portNotes:{}, portVlans:{}, portPeerPort:{}, portPoe:{}, portLabels:{} }));
  if (candidates.length === 0) { toast('All sample IPs already exist in this project', 'error'); return; }
  showImportReviewNamed(candidates, 'Sample Devices');
}

// ─── QUICK DEVICE TEMPLATES ───
let _quickTpl = null;
let _tplPanelOpen = false;
let _tplOpenCat = null;

const DEVICE_TEMPLATES = [
  { category: 'Switch — Managed', icon: '⇄', items: [
    { label: '24-port', deviceType: 'Switch', ports: 24, deviceUHeight: 1, namePlaceholder: 'SW-01' },
    { label: '48-port', deviceType: 'Switch', ports: 48, deviceUHeight: 1, namePlaceholder: 'SW-01' },
    { label: '8-port SFP', deviceType: 'Switch', ports: 8, deviceUHeight: 1, namePlaceholder: 'SW-01' },
  ]},
  { category: 'Switch — Unmanaged', icon: '⇄', items: [
    { label: '4-port', deviceType: 'Switch', ports: 4, deviceUHeight: 1, namePlaceholder: 'USW-01' },
    { label: '8-port', deviceType: 'Switch', ports: 8, deviceUHeight: 1, namePlaceholder: 'USW-01' },
    { label: '16-port', deviceType: 'Switch', ports: 16, deviceUHeight: 1, namePlaceholder: 'USW-01' },
    { label: '24-port', deviceType: 'Switch', ports: 24, deviceUHeight: 1, namePlaceholder: 'USW-01' },
    { label: '48-port', deviceType: 'Switch', ports: 48, deviceUHeight: 1, namePlaceholder: 'USW-01' },
  ]},
  { category: 'Firewall', icon: '🛡', items: [
    { label: 'Small (4-port)', deviceType: 'Firewall', ports: 4, deviceUHeight: 1, namePlaceholder: 'FW-01' },
    { label: 'Mid (8-port)', deviceType: 'Firewall', ports: 8, deviceUHeight: 1, namePlaceholder: 'FW-01' },
    { label: 'Enterprise (16-port)', deviceType: 'Firewall', ports: 16, deviceUHeight: 1, namePlaceholder: 'FW-01' },
    { label: '2U Chassis', deviceType: 'Firewall', ports: 16, deviceUHeight: 2, namePlaceholder: 'FW-01' },
  ]},
  { category: 'Patch Panel', icon: '⊟', items: [
    { label: 'Punchdown 24-port', isPP: true, ports: 24, ppType: 'Punchdown', namePlaceholder: 'PP-01' },
    { label: 'Punchdown 48-port', isPP: true, ports: 48, ppType: 'Punchdown', namePlaceholder: 'PP-01' },
    { label: 'Keystone 12-port', isPP: true, ports: 12, ppType: 'Keystone', namePlaceholder: 'PP-01' },
    { label: 'Keystone 24-port', isPP: true, ports: 24, ppType: 'Keystone', namePlaceholder: 'PP-01' },
    { label: 'Keystone 48-port', isPP: true, ports: 48, ppType: 'Keystone', namePlaceholder: 'PP-01' },
  ]},
  { category: 'Fiber Enclosure', icon: '⬡', items: [
    { label: '6 pair 1U', isFE: true, fiberPairs: 6, deviceUHeight: 1, namePlaceholder: 'FE-01' },
    { label: '12 pair 1U', isFE: true, fiberPairs: 12, deviceUHeight: 1, namePlaceholder: 'FE-01' },
    { label: '18 pair 2U', isFE: true, fiberPairs: 18, deviceUHeight: 2, namePlaceholder: 'FE-01' },
    { label: '24 pair 4U', isFE: true, fiberPairs: 24, deviceUHeight: 4, namePlaceholder: 'FE-01' },
    { label: '48 pair 4U', isFE: true, fiberPairs: 48, deviceUHeight: 4, namePlaceholder: 'FE-01' },
    { label: '72 pair 4U', isFE: true, fiberPairs: 72, deviceUHeight: 4, namePlaceholder: 'FE-01' },
  ]},
  { category: 'Router', icon: '⇌', items: [
    { label: 'Router 1U', deviceType: 'Router', ports: 4, deviceUHeight: 1, namePlaceholder: 'RTR-01' },
    { label: 'Router 2U', deviceType: 'Router', ports: 8, deviceUHeight: 2, namePlaceholder: 'RTR-01' },
  ]},
  { category: 'UPS / Power', icon: '⚡', items: [
    { label: 'UPS 1U', deviceType: 'APC/UPS', ports: 0, deviceUHeight: 1, namePlaceholder: 'UPS-01' },
    { label: 'UPS 2U', deviceType: 'APC/UPS', ports: 0, deviceUHeight: 2, namePlaceholder: 'UPS-01' },
    { label: 'UPS 3U', deviceType: 'APC/UPS', ports: 0, deviceUHeight: 3, namePlaceholder: 'UPS-01' },
    { label: 'PDU 1U', deviceType: 'APC/UPS', ports: 0, deviceUHeight: 1, namePlaceholder: 'PDU-01', model: 'PDU' },
  ]},
  { category: 'Server', icon: '🖥', items: [
    { label: 'Server 1U', deviceType: 'Server', ports: 0, deviceUHeight: 1, namePlaceholder: 'SRV-01' },
    { label: 'Server 2U', deviceType: 'Server', ports: 0, deviceUHeight: 2, namePlaceholder: 'SRV-01' },
    { label: 'Server 4U', deviceType: 'Server', ports: 0, deviceUHeight: 4, namePlaceholder: 'SRV-01' },
    { label: 'Blade Chassis 7U', deviceType: 'Server', ports: 0, deviceUHeight: 7, namePlaceholder: 'BLADE-01' },
  ]},
  { category: 'NAS / Storage', icon: '💾', items: [
    { label: 'NAS 1U', deviceType: 'NAS', ports: 0, deviceUHeight: 1, namePlaceholder: 'NAS-01' },
    { label: 'NAS 2U', deviceType: 'NAS', ports: 0, deviceUHeight: 2, namePlaceholder: 'NAS-01' },
    { label: 'NAS 4U', deviceType: 'NAS', ports: 0, deviceUHeight: 4, namePlaceholder: 'NAS-01' },
    { label: 'SAN 2U', deviceType: 'NAS', ports: 0, deviceUHeight: 2, namePlaceholder: 'SAN-01', model: 'SAN' },
  ]},
  { category: 'Misc Rack-Mounted', icon: '⊙', items: [
    { label: 'KVM Switch 8-port', deviceType: 'Misc Rack-Mounted', ports: 8, deviceUHeight: 1, namePlaceholder: 'KVM-01' },
    { label: 'Cable Manager 1U', deviceType: 'Misc Rack-Mounted', ports: 0, deviceUHeight: 1, namePlaceholder: 'CM-01', model: 'Cable Manager' },
    { label: 'Modem 1U', deviceType: 'Modem', ports: 4, deviceUHeight: 1, namePlaceholder: 'MDM-01' },
    { label: 'Wireless Controller 1U', deviceType: 'Misc Rack-Mounted', ports: 0, deviceUHeight: 1, namePlaceholder: 'WLC-01' },
    { label: 'Console Server 1U', deviceType: 'Misc Rack-Mounted', ports: 8, deviceUHeight: 1, namePlaceholder: 'CONS-01', model: 'Console Server' },
  ]},
];

const DEVICE_TEMPLATES_FLAT = DEVICE_TEMPLATES.flatMap(cat => cat.items.map(item => ({ ...item, _cat: cat.category, _icon: cat.icon })));

function _getAllTemplates() {
  const p = getProject();
  const custom = (p && p.customTemplates) ? p.customTemplates : [];
  if (!custom.length) return DEVICE_TEMPLATES;
  return [{ category: 'Custom', icon: '★', items: custom }, ...DEVICE_TEMPLATES];
}

function _flatTemplates() {
  return _getAllTemplates().flatMap(cat => cat.items.map(item => ({ ...item, _cat: cat.category, _icon: cat.icon })));
}

function buildTemplatePanel() {
  const allTpls = _getAllTemplates();
  let fi = 0;
  const catBtns = allTpls.map((cat, ci) => {
    const isOpen = _tplOpenCat === ci;
    let itemsHtml = '';
    if (isOpen) {
      itemsHtml = `<div class="tpl-cat-items" style="margin-top:4px">` +
        cat.items.map(item => {
          const i = fi;
          fi++;
          return `<button class="template-btn" onclick="quickAddDevice(${i})">${cat.icon} ${esc(item.label)}</button>`;
        }).join('') + `</div>`;
    } else {
      fi += cat.items.length;
    }
    return `<div class="template-category">
      <div class="template-cat-toggle" onclick="toggleTplCat(${ci})" style="cursor:pointer;user-select:none;display:flex;align-items:center;justify-content:space-between;padding:5px 8px;background:var(--card);border:1px solid ${isOpen ? 'var(--accent)' : 'var(--border)'};border-radius:5px;margin-bottom:3px;transition:all .12s;color:${isOpen ? 'var(--accent)' : 'var(--text2)'};font-size:12px"
        onmouseover="this.style.borderColor='var(--accent)';this.style.color='var(--accent)'"
        onmouseout="this.style.borderColor='${isOpen ? 'var(--accent)' : 'var(--border)'}';this.style.color='${isOpen ? 'var(--accent)' : 'var(--text2)'}'"
      >${cat.icon} ${esc(cat.category)} <span style="font-size:10px;color:var(--text3)">${cat.items.length}</span> <span style="font-size:9px">${isOpen ? '▲' : '▼'}</span></div>
      ${itemsHtml}
    </div>`;
  }).join('');

  const inner = `${catBtns}
    <button class="template-btn" style="margin-top:8px;text-align:center;color:var(--accent);border-color:var(--accent);border-style:dashed" onclick="openBuildTemplate()">+ Build a Template</button>`;

  return `<div class="template-panel">
    <div class="template-panel-hdr" onclick="toggleTplPanel()" style="cursor:pointer;user-select:none">
      <span>⚡ Quick Templates</span>
      <span id="tpl-panel-arrow" style="font-size:9px">${_tplPanelOpen ? '▲' : '▼'}</span>
    </div>
    <div id="tpl-panel-body" style="display:${_tplPanelOpen ? 'block' : 'none'}">${inner}</div>
  </div>`;
}

function toggleTplPanel() {
  _tplPanelOpen = !_tplPanelOpen;
  const body = document.getElementById('tpl-panel-body');
  const arrow = document.getElementById('tpl-panel-arrow');
  if (body) body.style.display = _tplPanelOpen ? 'block' : 'none';
  if (arrow) arrow.textContent = _tplPanelOpen ? '▲' : '▼';
}

function toggleTplCat(catIndex) {
  _tplOpenCat = (_tplOpenCat === catIndex) ? null : catIndex;
  if (typeof renderRacks === 'function') renderRacks();
}

function openBuildTemplate() {
  const typeOpts = DEVICE_TYPES.map(t => `<option value="${t}">${t}</option>`).join('');
  openModal(`
    <h3>Build a Template</h3>
    <p style="font-size:11px;color:var(--text3);margin:-4px 0 14px;font-family:var(--mono)">Create a reusable device template for this project.</p>
    <div class="form-row-inline">
      <div class="form-row" style="flex:2"><label>Template Label *</label>
        <input class="form-control" id="bt-label" placeholder="e.g. Cisco 2960 24p" autofocus></div>
      <div class="form-row"><label>Device Type</label>
        <select class="form-control" id="bt-type">${typeOpts}</select></div>
    </div>
    <div class="form-row-inline">
      <div class="form-row"><label>Ports</label>
        <input class="form-control" id="bt-ports" type="number" value="0" min="0"></div>
      <div class="form-row"><label>U Height</label>
        <input class="form-control" id="bt-uheight" type="number" value="1" min="1" max="50"></div>
    </div>
    <div class="form-row-inline">
      <div class="form-row"><label>Manufacturer</label>
        <input class="form-control" id="bt-mfr" placeholder="Cisco, HP, etc."></div>
      <div class="form-row"><label>Model</label>
        <input class="form-control" id="bt-model" placeholder="Model name"></div>
    </div>
    <div class="form-row"><label>Name Placeholder</label>
      <input class="form-control" id="bt-namepl" placeholder="e.g. SW-01"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveBuildTemplate()">Save Template</button>
    </div>
  `);
  setTimeout(() => document.getElementById('bt-label')?.focus(), 50);
}

function saveBuildTemplate() {
  const label = document.getElementById('bt-label')?.value?.trim();
  if (!label) return toast('Enter a template label', 'error');
  const deviceType = document.getElementById('bt-type')?.value || 'Misc.';
  const ports = parseInt(document.getElementById('bt-ports')?.value) || 0;
  const deviceUHeight = parseInt(document.getElementById('bt-uheight')?.value) || 1;
  const manufacturer = document.getElementById('bt-mfr')?.value?.trim() || '';
  const model = document.getElementById('bt-model')?.value?.trim() || '';
  const namePlaceholder = document.getElementById('bt-namepl')?.value?.trim() || label;

  const tpl = { label, deviceType, ports, deviceUHeight, namePlaceholder, manufacturer, model };
  const p = getProject();
  if (!p.customTemplates) p.customTemplates = [];
  p.customTemplates.push(tpl);
  save();
  closeModal();
  if (typeof renderRacks === 'function') renderRacks();
  toast(`Template "${label}" created`, 'success');
}

function quickAddDevice(tplOrIdx) {
  const flat = _flatTemplates();
  const tpl = (typeof tplOrIdx === 'number') ? flat[tplOrIdx] : tplOrIdx;
  if (!tpl) return;
  _quickTpl = tpl;
  const portLine = tpl.isFE ? ` · ${tpl.fiberPairs} pair` : tpl.ports ? ` · ${tpl.ports} ports` : '';
  const uLine = tpl.deviceUHeight > 1 ? ` · ${tpl.deviceUHeight}U` : '';
  const typeLabel = tpl.isPP ? `Patch Panel (${tpl.ppType || ''})` : tpl.isFE ? 'Fiber Enclosure' : tpl.deviceType;
  openModal(`
    <h3>Quick Add: ${esc(tpl.label)}</h3>
    <p style="font-size:11px;color:var(--text3);margin:-4px 0 14px;font-family:var(--mono)">${esc(typeLabel)}${portLine}${uLine}</p>
    <div class="form-row">
      <label>Device Name *</label>
      <input class="form-control" id="qt-name" placeholder="${esc(tpl.namePlaceholder || 'Device name')}" autofocus>
    </div>
    ${(tpl.isPP || tpl.isFE) ? '' : `<div class="form-row-inline">
      <div class="form-row"><label>Manufacturer <span style="color:var(--text3);font-weight:400">(opt.)</span></label>
        <input class="form-control" id="qt-mfr" value="${esc(tpl.manufacturer||'')}" placeholder="Cisco, HP, etc."></div>
      <div class="form-row"><label>Model <span style="color:var(--text3);font-weight:400">(opt.)</span></label>
        <input class="form-control" id="qt-model" value="${esc(tpl.model||'')}"></div>
    </div>
    <div class="form-row"><label>MAC Address <span style="color:var(--text3);font-weight:400">(opt.)</span></label>
      <input class="form-control" id="qt-mac" placeholder="00:11:22:33:44:55"></div>`}
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveQuickDevice()">Add to Pool</button>
    </div>
  `);
  setTimeout(() => document.getElementById('qt-name')?.focus(), 50);
}

function saveQuickDevice() {
  const tpl = _quickTpl;
  if (!tpl) return;
  const name = document.getElementById('qt-name')?.value?.trim();
  if (!name) return toast('Enter a device name', 'error');
  const p = getProject();

  let dev;
  if (tpl.isPP) {
    dev = {
      id: genId(), name,
      deviceType: 'Patch Panel',
      type: 'non-switching',
      ip: '', mac: '', manufacturer: '', model: tpl.ppType ? `${tpl.ppType} ${tpl.ports}p` : '',
      notes: '', ports: tpl.ports || 24,
      deviceUHeight: 1, rackId: null, rackU: null,
      portAssignments: {}, portNotes: {}, portVlans: {}, portPeerPort: {}, portPoe: {}, portLabels: {}
    };
  } else if (tpl.isFE) {
    dev = {
      id: genId(), name,
      deviceType: 'Fiber Enclosure',
      type: 'non-switching',
      ip: '', mac: '', manufacturer: '', model: '',
      notes: '', ports: 0, fiberPairs: tpl.fiberPairs || 6,
      deviceUHeight: tpl.deviceUHeight || 1, rackId: null, rackU: null,
      portAssignments: {}, portNotes: {}, portVlans: {}, portPeerPort: {}, portPoe: {}, portLabels: {},
      addedDate: new Date().toISOString()
    };
  } else {
    const mfr = document.getElementById('qt-mfr')?.value?.trim() || '';
    const model = document.getElementById('qt-model')?.value?.trim() || tpl.model || '';
    const mac = document.getElementById('qt-mac')?.value?.trim() || '';
    dev = {
      id: genId(), name,
      deviceType: tpl.deviceType || 'Misc.',
      type: tpl.deviceType === 'Switch' ? 'switching' : 'non-switching',
      ip: '', mac, manufacturer: mfr, model, notes: '',
      ports: tpl.ports || 0,
      deviceUHeight: tpl.deviceUHeight || 1,
      rackId: null, rackU: null,
      portAssignments: {}, portNotes: {}, portVlans: {}, portPeerPort: {}, portPoe: {}, portLabels: {},
      webUser: '', webPassword: '', webProtocol: 'https', parentDeviceId: '',
      addedDate: new Date().toISOString()
    };
  }

  p.devices.push(dev);
  logChange(`Quick-added device: ${name} (${dev.deviceType}${tpl.ports ? ', ' + tpl.ports + 'p' : ''})`);
  save();
  closeModal();
  if (typeof renderRacks === 'function') renderRacks();
  toast(`"${name}" added to pool`, 'success');
}

