let _timerInterval = null;

function startTimer() {
  const p = getProject();
  if (!p) return;
  const now = new Date();
  const pad = n => String(n).padStart(2,'0');
  state.activeTimer = {
    id: genId(),
    date: now.toISOString().slice(0,10),
    startTime: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    tech: '',
    startTs: Date.now()
  };
  logChange('Time log: timer started');
  save();
  renderDashboard();
}

function stopTimer() {
  const p = getProject();
  if (!p || !state.activeTimer) return;
  const now = new Date();
  const pad = n => String(n).padStart(2,'0');
  openModal(`
    <h3>Stop Timer</h3>
    <p style="color:var(--text2);font-size:13px;margin-bottom:14px">Started: ${state.activeTimer.startTime} on ${state.activeTimer.date}</p>
    <div class="form-row"><label>Technician</label>
      <input class="form-control" id="te-tech" value="${esc(state.activeTimer.tech||'')}" placeholder="Your name"></div>
    <div class="form-row"><label>Notes</label>
      <textarea class="form-control" id="te-notes" rows="2" placeholder="What was done..."></textarea></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Keep Running</button>
      <button class="btn btn-primary" onclick="confirmStopTimer()">Stop &amp; Save</button>
    </div>`);
}

function confirmStopTimer() {
  const p = getProject();
  if (!p || !state.activeTimer) return;
  const now = new Date();
  const pad = n => String(n).padStart(2,'0');
  const entry = {
    id: state.activeTimer.id,
    date: state.activeTimer.date,
    startTime: state.activeTimer.startTime,
    endTime: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    tech: document.getElementById('te-tech')?.value?.trim()||'',
    notes: document.getElementById('te-notes')?.value?.trim()||'',
  };
  if (!p.timeLog) p.timeLog=[];
  p.timeLog.push(entry);
  logChange(`Time log: entry added ${entry.date} ${entry.startTime}–${entry.endTime}${entry.tech?' by '+entry.tech:''}`);
  state.activeTimer = null;
  if (_timerInterval) { clearInterval(_timerInterval); _timerInterval=null; }
  save(); closeModal(); renderDashboard(); toast('Time entry saved','success');
}

function updateTimerDisplay() {
  if (!state.activeTimer) return;
  const el = document.getElementById('timer-elapsed');
  if (!el) return;
  const elapsed = Date.now() - state.activeTimer.startTs;
  const h = Math.floor(elapsed/3600000);
  const m = Math.floor((elapsed%3600000)/60000);
  const s = Math.floor((elapsed%60000)/1000);
  el.textContent = `${h>0?h+'h ':''} ${m}m ${s}s`;
  if (_timerInterval) { clearInterval(_timerInterval); _timerInterval = null; }
  _timerInterval = setInterval(()=>{ const e2=document.getElementById('timer-elapsed'); if(!e2){clearInterval(_timerInterval);_timerInterval=null;return;} if(!state.activeTimer){clearInterval(_timerInterval);_timerInterval=null;return;} const el2=Date.now()-state.activeTimer.startTs; const hh=Math.floor(el2/3600000),mm=Math.floor((el2%3600000)/60000),ss=Math.floor((el2%60000)/1000); e2.textContent=`${hh>0?hh+'h ':''} ${mm}m ${ss}s`; }, 1000);
}

function addTimeEntry() { openTimeEntryModal(null); }
function editTimeEntry(id) { openTimeEntryModal(id); }

function openTimeEntryModal(id) {
  const p = getProject();
  const e = id ? (p.timeLog||[]).find(x=>x.id===id) : null;
  const today = new Date().toISOString().slice(0,10);
  openModal(`
    <h3>${id?'Edit':'Add'} Time Entry</h3>
    <div class="form-row"><label>Date</label>
      <input class="form-control" type="date" id="te-date" value="${esc(e?.date||today)}"></div>
    <div class="form-row-inline">
      <div class="form-row"><label>Start Time</label>
        <input class="form-control" type="time" id="te-start" value="${esc(e?.startTime||'08:00')}"></div>
      <div class="form-row"><label>End Time</label>
        <input class="form-control" type="time" id="te-end" value="${esc(e?.endTime||'09:00')}"></div>
    </div>
    <div class="form-row"><label>Technician</label>
      <input class="form-control" id="te-tech2" value="${esc(e?.tech||'')}" placeholder="Name"></div>
    <div class="form-row"><label>Notes</label>
      <textarea class="form-control" id="te-notes2" rows="2" placeholder="Work done...">${esc(e?.notes||'')}</textarea></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveTimeEntry('${id||''}')">Save</button>
    </div>`);
}

function saveTimeEntry(id) {
  const p = getProject();
  const data = {
    date: document.getElementById('te-date')?.value||'',
    startTime: document.getElementById('te-start')?.value||'',
    endTime: document.getElementById('te-end')?.value||'',
    tech: document.getElementById('te-tech2')?.value?.trim()||'',
    notes: document.getElementById('te-notes2')?.value?.trim()||'',
  };
  if (!p.timeLog) p.timeLog=[];
  if (id) {
    const idx=p.timeLog.findIndex(e=>e.id===id);
    if(idx>=0){Object.assign(p.timeLog[idx],data);logChange(`Time entry updated: ${data.date}`);}
  } else {
    p.timeLog.push({id:genId(),...data});
    logChange(`Time entry added: ${data.date} ${data.startTime}–${data.endTime}`);
  }
  save(); closeModal(); renderDashboard(); toast(id?'Entry updated':'Entry added','success');
}

function deleteTimeEntry(id) {
  const p=getProject();
  p.timeLog=(p.timeLog||[]).filter(e=>e.id!==id);
  logChange('Time entry deleted');
  save(); renderDashboard(); toast('Entry deleted');
}
