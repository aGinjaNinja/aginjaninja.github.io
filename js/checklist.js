function renderChecklist() {
  const p = getProject();
  if (!p.checklist) p.checklist = getDefaultChecklist();
  const cl = p.checklist;
  const done = cl.filter(i=>i.done).length;
  const total = cl.length;
  const pct = total>0 ? Math.round(done/total*100) : 0;
  updateChecklistNavBadge();

  setTopbarActions(`
    <button class="btn btn-ghost btn-sm" onclick="resetChecklist()">↺ Reset All</button>
    <button class="btn btn-primary btn-sm" onclick="addChecklistItem()">+ Add Item</button>`);

  const cats = [...new Set(cl.map(i=>i.category||'Other'))];
  document.getElementById('view-area').innerHTML = `
    <div style="max-width:800px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div style="font-size:14px;color:var(--text2)">${done} of ${total} complete</div>
        <div style="font-size:14px;font-weight:600;color:${pct===100?'var(--green)':'var(--amber)'}">${pct}%</div>
      </div>
      <div class="progress-bar-wrap">
        <div class="progress-bar-fill" style="width:${pct}%"></div>
      </div>
      ${cats.map(cat=>{
        const items = cl.filter(i=>(i.category||'Other')===cat);
        const catDone = items.filter(i=>i.done).length;
        return `<div class="checklist-group">
          <div class="checklist-group-hdr">
            <span>${esc(cat)}</span>
            <span style="color:var(--text3)">${catDone}/${items.length}</span>
          </div>
          ${items.map(item=>`
            <div class="checklist-item ${item.done?'done':''}">
              <input type="checkbox" ${item.done?'checked':''} onchange="toggleChecklistItem('${item.id}',this.checked)">
              <label onclick="toggleChecklistItem('${item.id}',${!item.done})">${esc(item.text)}</label>
              <button class="btn btn-danger btn-sm btn-icon" onclick="deleteChecklistItem('${item.id}')" title="Delete">✕</button>
            </div>`).join('')}
        </div>`;
      }).join('')}
    </div>`;
}

function toggleChecklistItem(id, checked) {
  const p = getProject();
  const item = (p.checklist||[]).find(i=>i.id===id);
  if (item) { item.done = checked; save(); renderChecklist(); }
}

function deleteChecklistItem(id) {
  if (!confirm('Delete this checklist item?')) return;
  const p = getProject();
  p.checklist = (p.checklist||[]).filter(i=>i.id!==id);
  logChange('Checklist item deleted');
  save(); renderChecklist();
}

function resetChecklist() {
  if (!confirm('Uncheck all checklist items?')) return;
  const p = getProject();
  (p.checklist||[]).forEach(i=>i.done=false);
  logChange('Checklist reset');
  save(); renderChecklist(); toast('Checklist reset');
}

function addChecklistItem() {
  openModal(`
    <h3>Add Checklist Item</h3>
    <div class="form-row"><label>Item Text *</label>
      <input class="form-control" id="ci-text" placeholder="e.g. Document UPS capacity"></div>
    <div class="form-row"><label>Category</label>
      <input class="form-control" id="ci-cat" placeholder="e.g. Discovery, Cabling..." value="Discovery"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveChecklistItem()">Add</button>
    </div>`);
  setTimeout(()=>document.getElementById('ci-text')?.focus(),50);
}

function saveChecklistItem() {
  const text = document.getElementById('ci-text')?.value?.trim();
  if (!text) return toast('Item text is required','error');
  const cat = document.getElementById('ci-cat')?.value?.trim()||'Other';
  const p = getProject();
  if (!p.checklist) p.checklist=[];
  p.checklist.push({id:genId(),text,done:false,category:cat});
  logChange(`Checklist item added: "${text}"`);
  save(); closeModal(); renderChecklist(); toast('Item added','success');
}
