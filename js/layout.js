// ═══════════════════════════════════════════
//  LAYOUT - Sidebar, topbar, navigation
// ═══════════════════════════════════════════

const VIEW_TITLES = {
  dashboard: 'Dashboard', devices: 'Device List', scan: 'Network Scan',
  racks: 'Rack View', ports: 'Port Assignment', flowchart: 'Network Topology',
  photos: 'Site Photos', settings: 'Settings', log: 'Change Log',
  checklist: 'Site Survey Checklist', cableruns: 'Cable Runs',
  fieldmode: 'Field Mode', sitemap: 'Site Map'
};

const VIEW_PAGES = {
  dashboard: 'dashboard.html', devices: 'devices.html', scan: 'scan.html',
  racks: 'racks.html', ports: 'ports.html', flowchart: 'flowchart.html',
  photos: 'photos.html', settings: 'settings.html', log: 'log.html',
  checklist: 'checklist.html', cableruns: 'cableruns.html',
  fieldmode: 'fieldmode.html', sitemap: 'sitemap.html'
};

// SPA detection — true when running from app.html
const _isSPA = /app\.html/i.test(window.location.pathname) || window.location.pathname.endsWith('/app');

// SPA navigation — instant view switching without page reloads
function setView(v) {
  if (!VIEW_TITLES[v]) return;
  if (_isSPA) {
    _spaRenderView(v);
  } else {
    if (VIEW_PAGES[v]) window.location.href = VIEW_PAGES[v];
  }
}

function _spaRenderView(v) {
  // Close any open modals/overlays
  closeModal();
  if (typeof closePhotoViewer === 'function') closePhotoViewer();
  closeSidebarDropdowns();

  state.currentView = v;
  // Update hash (replace for sidebar clicks, push for first nav)
  const currentHash = window.location.hash.replace('#', '');
  if (currentHash !== v) {
    history.pushState({ view: v }, '', '#' + v);
  }

  // Update topbar title
  const title = document.getElementById('view-title');
  if (title) title.textContent = VIEW_TITLES[v] || v;

  // Update sidebar active state (fast — no full rebuild)
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === v);
  });

  // Reset view zoom
  _viewZoom = 1;
  const va = document.getElementById('view-area');
  if (va) {
    va.style.zoom = 1;
    // Fade transition
    va.classList.remove('view-enter');
    void va.offsetWidth; // force reflow
    va.classList.add('view-enter');
  }

  // Update checklist badge
  updateChecklistNavBadge();

  // Render the view
  const renderers = {
    dashboard: () => renderDashboard(),
    devices: () => { renderDevices(); _checkEditDevice(); },
    scan: () => renderScan(),
    racks: () => { renderRacks(); if (typeof checkFocusRack === 'function') checkFocusRack(); },
    ports: () => renderPorts(),
    flowchart: () => renderFlowchart(),
    photos: () => renderPhotos(),
    settings: () => renderSettings(),
    log: () => renderLog(),
    checklist: () => renderChecklist(),
    cableruns: () => renderCableRuns(),
    fieldmode: () => renderFieldMode(),
    sitemap: () => renderSiteMap()
  };

  if (renderers[v]) renderers[v]();
}

// Handle "edit device on load" from sessionStorage (used by dashboard → device clicks)
function _checkEditDevice() {
  const editId = sessionStorage.getItem('netrack_edit_device');
  if (editId) {
    sessionStorage.removeItem('netrack_edit_device');
    setTimeout(() => { if (typeof editDevice === 'function') editDevice(editId); }, 100);
  }
}

function backToProjects() {
  state.currentProjectId = null;
  sessionStorage.removeItem('netrack_current_project');
  localStorage.removeItem('netrack_current_project');
  window.location.href = 'index.html';
}

// ── Collapsible sidebar sections ──
const _defaultCollapsed = {};
function _getCollapsedSections() {
  try { return JSON.parse(sessionStorage.getItem('netrack_nav_collapsed') || '{}'); } catch(e) { return {}; }
}
function _saveCollapsedSections(map) {
  sessionStorage.setItem('netrack_nav_collapsed', JSON.stringify(map));
}
function toggleNavSection(sectionKey) {
  const map = _getCollapsedSections();
  map[sectionKey] = !map[sectionKey];
  _saveCollapsedSections(map);
  const items = document.querySelector(`.nav-section-items[data-section="${sectionKey}"]`);
  const arrow = document.querySelector(`.nav-section-hdr[data-section="${sectionKey}"] .nav-section-arrow`);
  if (items) items.classList.toggle('collapsed', !!map[sectionKey]);
  if (arrow) arrow.textContent = map[sectionKey] ? '▸' : '▾';
}

function buildSidebar(activeView) {
  const p = getProject();
  const projName = p ? p.name : '';
  const col = _getCollapsedSections();

  function section(key, label, items) {
    const isCollapsed = !!col[key];
    return `
      <div class="nav-section nav-section-hdr" data-section="${key}" onclick="toggleNavSection('${key}')">
        <span class="nav-section-arrow">${isCollapsed ? '▸' : '▾'}</span>${label}
      </div>
      <div class="nav-section-items${isCollapsed ? ' collapsed' : ''}" data-section="${key}">
        ${items}
      </div>`;
  }

  function navItem(view, icon, label, extra) {
    return `<div class="nav-item ${activeView===view?'active':''}" onclick="setView('${view}')" data-view="${view}">
      <span class="nav-icon">${icon}</span> ${extra ? `<span id="${extra.id}">${extra.html || label}</span>` : label}
    </div>`;
  }

  return `
    <div class="sidebar-top">
      <div class="sidebar-logo" style="display:flex;align-items:center;gap:8px;padding:4px 0">
        <img src="" id="sidebar-logo-img" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0" alt="VNG">
        <span style="line-height:1.2;flex:1">Van Nice Guys<span style="display:block;font-size:9px;color:var(--accent);letter-spacing:1px;text-transform:uppercase">LLC</span></span>
        <div style="position:relative;flex-shrink:0">
          <button id="global-save-btn" onclick="toggleSidebarDropdown('save-dropdown')" title="Save project" style="background:rgba(0,200,100,.15);border:1px solid rgba(0,200,100,.3);border-radius:5px;color:#00e87a;cursor:pointer;font-size:10px;font-family:var(--mono);padding:3px 7px;transition:all .15s;white-space:nowrap" onmouseover="this.style.background='rgba(0,200,100,.28)'" onmouseout="this.style.background='rgba(0,200,100,.15)'">Save ▾</button>
          <div id="save-dropdown" style="display:none;position:absolute;top:calc(100% + 4px);right:0;z-index:300;background:var(--panel);border:1px solid var(--border);border-radius:7px;padding:4px;min-width:140px;box-shadow:0 4px 16px rgba(0,0,0,0.4)">
            <div onclick="globalSave();closeSidebarDropdowns()" style="padding:7px 10px;border-radius:4px;cursor:pointer;font-size:12px;color:var(--text1)" onmouseover="this.style.background='var(--card2)'" onmouseout="this.style.background=''">Local</div>
            <div onclick="gdriveSave();closeSidebarDropdowns()" style="padding:7px 10px;border-radius:4px;cursor:pointer;font-size:12px;color:#4285f4" onmouseover="this.style.background='var(--card2)'" onmouseout="this.style.background=''">Google Drive</div>
          </div>
        </div>
      </div>
      <div class="sidebar-project" id="sb-proj-name">${esc(projName)}</div>
    </div>
    <nav class="sidebar-nav">
      ${section('overview', 'Overview',
        navItem('dashboard', '⊞', 'Dashboard')
      )}
      ${section('devices', 'Devices',
        navItem('devices', '◈', 'Device List') +
        navItem('scan', '⊛', 'Network Scan')
      )}
      ${section('infra', 'Infrastructure',
        navItem('racks', '▤', 'Rack View') +
        navItem('ports', '⊡', 'Port Assignment')
      )}
      ${section('workspace', 'Workspace',
        navItem('flowchart', '⬡', 'Flowchart') +
        navItem('photos', '📷', 'Photos')
      )}
      ${section('field', 'Field',
        navItem('checklist', '✓', 'Checklist', { id: 'nav-checklist-label', html: 'Checklist' }) +
        navItem('cableruns', '⇄', 'Cable Runs') +
        navItem('fieldmode', '📱', 'Field Mode') +
        navItem('sitemap', '🗺', 'Site Map')
      )}
      ${section('system', 'System',
        navItem('settings', '⚙', 'Settings') +
        navItem('log', '📋', 'Change Log')
      )}
    </nav>
    <div class="sidebar-bottom">
      <div style="position:relative">
        <button class="btn btn-ghost btn-sm" onclick="toggleSidebarDropdown('load-dropdown')" style="width:100%">Load ▾</button>
        <div id="load-dropdown" style="display:none;position:absolute;bottom:calc(100% + 4px);left:0;z-index:300;background:var(--panel);border:1px solid var(--border);border-radius:7px;padding:4px;min-width:140px;box-shadow:0 4px 16px rgba(0,0,0,0.4)">
          <div onclick="importData();closeSidebarDropdowns()" style="padding:7px 10px;border-radius:4px;cursor:pointer;font-size:12px;color:var(--text1)" onmouseover="this.style.background='var(--card2)'" onmouseout="this.style.background=''">Local</div>
          <div onclick="gdriveLoad();closeSidebarDropdowns()" style="padding:7px 10px;border-radius:4px;cursor:pointer;font-size:12px;color:#4285f4" onmouseover="this.style.background='var(--card2)'" onmouseout="this.style.background=''">Google Drive</div>
        </div>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="backToProjects()">← Projects</button>
    </div>`;
}

// ── Pinch-to-zoom for content views ──
let _viewZoom = 1;
let _viewPinch = null;
let _viewLastTap = 0;
const ZOOMABLE_VIEWS = new Set(['racks','devices','ports','flowchart']);

function _onViewTouchStart(e) {
  if (!ZOOMABLE_VIEWS.has(state.currentView)) return;
  if (e.touches.length === 1 && _viewZoom !== 1) {
    const now = Date.now();
    if (now - _viewLastTap < 300) {
      _viewZoom = 1;
      const va = document.getElementById('view-area');
      if (va) va.style.zoom = 1;
      _viewLastTap = 0; return;
    }
    _viewLastTap = now;
  }
  if (e.touches.length === 2) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    _viewPinch = { startDist: Math.hypot(dx, dy), startZoom: _viewZoom };
  }
}
function _onViewTouchMove(e) {
  if (!_viewPinch || e.touches.length !== 2) return;
  e.preventDefault();
  const dx = e.touches[0].clientX - e.touches[1].clientX;
  const dy = e.touches[0].clientY - e.touches[1].clientY;
  _viewZoom = Math.max(0.4, Math.min(3, _viewPinch.startZoom * Math.hypot(dx, dy) / _viewPinch.startDist));
  const va = document.getElementById('view-area');
  if (va) va.style.zoom = _viewZoom;
}
function _onViewTouchEnd(e) {
  if (e.touches.length < 2) _viewPinch = null;
}

function updateChecklistNavBadge() {
  const p = getProject();
  if (!p) return;
  const cl = p.checklist || [];
  const done = cl.filter(i => i.done).length;
  const total = cl.length;
  const pct = total > 0 ? Math.round(done / total * 100) : 0;
  const el = document.getElementById('nav-checklist-label');
  if (el) el.innerHTML = `Checklist <span style="font-size:10px;color:${pct===100?'var(--green)':'var(--amber)'};background:${pct===100?'rgba(0,232,122,.12)':'rgba(255,170,0,.12)'};border:1px solid ${pct===100?'rgba(0,232,122,.3)':'rgba(255,170,0,.3)'};border-radius:8px;padding:0 5px;font-family:var(--mono)">${pct}%</span>`;
}

// Register service worker for offline / PWA support
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// Initialize an app page (called once in SPA, or once per page in multi-page mode)
async function initPage(viewName) {
  await load();
  // Restore current project
  const ssProject = sessionStorage.getItem('netrack_current_project');
  const lsProject = localStorage.getItem('netrack_current_project');
  const savedProject = ssProject || lsProject;
  if (savedProject && !state.currentProjectId) {
    state.currentProjectId = savedProject;
  }
  if (!getProject()) {
    window.location.href = 'index.html';
    return;
  }
  state.currentView = viewName;

  // Build sidebar
  const sidebar = document.getElementById('sidebar-container');
  if (sidebar) sidebar.innerHTML = buildSidebar(viewName);

  // Set topbar title
  const title = document.getElementById('view-title');
  if (title) title.textContent = VIEW_TITLES[viewName] || viewName;

  // Set logo
  const logoImg = document.getElementById('sidebar-logo-img');
  if (logoImg && typeof LOGO_URI !== 'undefined') logoImg.src = LOGO_URI;

  // Pinch-to-zoom
  const va = document.getElementById('view-area');
  if (va) {
    va.addEventListener('touchstart', _onViewTouchStart, { passive: true });
    va.addEventListener('touchmove', _onViewTouchMove, { passive: false });
    va.addEventListener('touchend', _onViewTouchEnd, { passive: true });
  }

  // Checklist badge
  updateChecklistNavBadge();

  // Rack port tooltip — event delegation
  document.addEventListener('mouseover', function(e) {
    const portEl = e.target.closest('.rack-port-sq, .pp-port');
    if (!portEl) return;
    if (typeof rackPortHover === 'function') rackPortHover(portEl, e);
  });
  document.addEventListener('mouseout', function(e) {
    const portEl = e.target.closest('.rack-port-sq, .pp-port');
    if (!portEl) return;
    const rel = e.relatedTarget;
    if (rel && portEl.contains(rel)) return;
    if (typeof rackPortLeave === 'function') rackPortLeave(portEl);
  });
  document.addEventListener('mousemove', function(e) {
    const tip = document.getElementById('rack-port-tooltip');
    if (tip && tip.style.display === 'block' && typeof positionRackTooltip === 'function') positionRackTooltip(e);
  });
}

// Re-render the current view
function refreshView() {
  if (_isSPA) {
    _spaRenderView(state.currentView);
  } else {
    const renderers = {
      dashboard: 'renderDashboard', devices: 'renderDevices', scan: 'renderScan',
      racks: 'renderRacks', ports: 'renderPorts', flowchart: 'renderFlowchart',
      photos: 'renderPhotos', settings: 'renderSettings', log: 'renderLog',
      checklist: 'renderChecklist', cableruns: 'renderCableRuns',
      fieldmode: 'renderFieldMode', sitemap: 'renderSiteMap'
    };
    const fn = renderers[state.currentView];
    if (fn && typeof window[fn] === 'function') window[fn]();
  }
}

// ── Topbar overflow menu helper ──
function openTopbarMore(menuHtml) {
  let menu = document.getElementById('topbar-more-menu');
  if (menu) { menu.remove(); return; }
  menu = document.createElement('div');
  menu.id = 'topbar-more-menu';
  menu.className = 'topbar-overflow-menu';
  menu.innerHTML = menuHtml;
  document.getElementById('topbar-actions').appendChild(menu);
  setTimeout(() => {
    const close = (e) => {
      if (!menu.contains(e.target) && !e.target.closest('[onclick*="openTopbarMore"]')) {
        menu.remove();
      }
      document.removeEventListener('click', close);
    };
    document.addEventListener('click', close);
  }, 10);
}
