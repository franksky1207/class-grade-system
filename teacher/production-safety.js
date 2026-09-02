// Production safety layer for the teacher site.
(function () {
  const PENDING_KEY = 'class-grade-system-pending-sync';
  const DRAFT_KEY = 'class-grade-system-entry-dirty';
  const REQUIRED_SHEETS = {
    '班級設定': ['欄位','內容'],
    '學生資料': ['座號','姓名','學號','身分證後4碼'],
    '考試資料': ['日期','科目','考試名稱'],
    '成績資料': ['日期','科目','考試名稱','座號','姓名','成績']
  };
  let draftDirty = false;
  let pendingSnapshot = null;
  let syncAttemptActive = false;

  function localYmd(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }

  function deepClone(v) { try { return JSON.parse(JSON.stringify(v)); } catch (_) { return null; } }
  function esc(v) { return String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

  function savePending(c) {
    if (!c) return;
    pendingSnapshot = { classId: c.id, classData: deepClone(c), savedAt: Date.now() };
    try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(pendingSnapshot)); } catch (_) {}
  }

  function loadPending() {
    if (pendingSnapshot) return pendingSnapshot;
    try { const raw = sessionStorage.getItem(PENDING_KEY); if (raw) pendingSnapshot = JSON.parse(raw); } catch (_) {}
    return pendingSnapshot;
  }

  function clearPending() {
    pendingSnapshot = null;
    try { sessionStorage.removeItem(PENDING_KEY); } catch (_) {}
    removeRetryPanel();
  }

  function markDraft(flag) {
    draftDirty = !!flag;
    try { sessionStorage.setItem(DRAFT_KEY, draftDirty ? '1' : '0'); } catch (_) {}
  }

  function hasUnsaved() {
    const status = document.getElementById('saveStatus')?.textContent || '';
    return draftDirty || !!loadPending() || status.includes('儲存中') || status.includes('儲存失敗');
  }

  function syncLoginHeader() {
    const loginActive = document.getElementById('login')?.classList.contains('active');
    const top = document.querySelector('header .top-actions');
    const cls = document.getElementById('headerClassText');
    if (top) top.style.display = loginActive ? 'none' : '';
    if (cls) cls.style.display = loginActive ? 'none' : '';
  }

  function installLoginHeaderGuard() {
    syncLoginHeader();
    const observer = new MutationObserver(syncLoginHeader);
    document.querySelectorAll('.page').forEach(p => observer.observe(p,{attributes:true,attributeFilter:['class']}));
  }

  function installDraftGuard() {
    try { draftDirty = sessionStorage.getItem(DRAFT_KEY) === '1'; } catch (_) {}

    document.addEventListener('input', (e) => {
      if (e.target?.closest?.('#entry')) markDraft(true);
    }, true);

    document.addEventListener('click', (e) => {
      const b = e.target?.closest?.('button');
      if (!b) return;

      if (b.id === 'saveManualExam' || b.id === 'saveExcelExams') {
        setTimeout(() => {
          const entryStillActive = document.getElementById('entry')?.classList.contains('active');
          if (!entryStillActive) markDraft(false);
        }, 50);
        return;
      }

      const navigating = !!b.dataset?.page || ['backFromEntry','backFromOverview','backFromRecords','backFromStudents','backFromSettings'].includes(b.id);
      if (!navigating || !draftDirty) return;

      const confirmed = confirm('目前有尚未儲存的成績輸入，確定要離開嗎？');
      if (!confirmed) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return;
      }

      markDraft(false);
      setTimeout(() => {
        const entryStillActive = document.getElementById('entry')?.classList.contains('active');
        if (!entryStillActive) markDraft(false);
      }, 0);
    }, true);

    const entry = document.getElementById('entry');
    if (entry) {
      new MutationObserver(() => {
        if (!entry.classList.contains('active') && draftDirty) markDraft(false);
      }).observe(entry, { attributes:true, attributeFilter:['class'] });
    }

    window.addEventListener('beforeunload', (e) => {
      if (!hasUnsaved()) return;
      e.preventDefault();
      e.returnValue = '';
    });
  }

  function installFilterDefaults() {
    function resetOverview() {
      try {
        if (typeof app !== 'undefined') {
          app.ovRange = 'n10';
          app.ovStudents = [];
          app.ovCount = 20;
          app.ovStart = '';
          app.ovEnd = '';
        }
        const subject = document.getElementById('overviewSubject');
        if (subject) subject.value = '';
      } catch (_) {}
    }

    function resetRecords() {
      const ids = ['recordStart','recordEnd','recordKey'];
      ids.forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
      const subject=document.getElementById('recordSubject'); if(subject) subject.value='';
      const sort=document.getElementById('recordSort'); if(sort) sort.value='desc';
    }

    document.addEventListener('click', e => {
      const b=e.target?.closest?.('button');
      if(!b) return;
      if(b.dataset?.page==='overview') resetOverview();
      if(b.dataset?.page==='records') resetRecords();
      if(b.id==='loginBtn') { resetOverview(); resetRecords(); }
    }, true);
  }

  function installDuplicateManualExamGuard() {
    document.addEventListener('click', (e) => {
      const b = e.target?.closest?.('button');
      if (b?.id !== 'saveManualExam') return;
      const c = typeof currentClass === 'function' ? currentClass() : null;
      if (!c) return;
      const date = document.getElementById('manualDate')?.value || '';
      const subject = document.getElementById('manualSubject')?.value?.trim() || '';
      const name = document.getElementById('manualName')?.value?.trim() || '';
      if (!date || !subject || !name) return;
      const exists = (c.exams || []).some(x => String(x.date||'')===date && String(x.subject||'').trim()===subject && String(x.name||'').trim()===name);
      if (!exists) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      alert('這次考試已經存在。請到「考試紀錄」編輯原本的考試。');
    }, true);
  }

  function installLocalDateRangeFix() {
    if (typeof window.getEligibleForStudent === 'function') {
      window.getEligibleForStudent = function(c, st) {
        const exams=[...(c?.exams||[])].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
        if(app.lowRange==='n10' || app.lowRange==='customN'){
          if(app.lowRange==='customN' && !app.lowCustomN) return [];
          const n=app.lowRange==='n10'?10:Number(app.lowCustomN);
          return exams.filter(e=>e.scores.some(s=>s.seat===st.seat && String(s.value).trim()!=='' && Number.isFinite(Number(s.value)))).slice(0,n);
        }
        if(app.lowRange==='all') return exams.filter(e=>e.scores.some(s=>s.seat===st.seat && String(s.value).trim()!=='' && Number.isFinite(Number(s.value))));
        let start='', end=localYmd();
        if(app.lowRange==='d14'){ const d=new Date(); d.setDate(d.getDate()-13); start=localYmd(d); }
        else { if(!app.lowStart || !app.lowEnd) return []; start=app.lowStart; end=app.lowEnd; }
        return exams.filter(e=>(!start||e.date>=start)&&(!end||e.date<=end));
      };
    }
    if (typeof window.renderOverview === 'function' && !window.renderOverview._localDateWrapped) {
      const original = window.renderOverview;
      const wrapped = function(...args) {
        const nativeIso = Date.prototype.toISOString;
        Date.prototype.toISOString = function() { return `${localYmd(this)}T00:00:00.000Z`; };
        try { return original.apply(this,args); }
        finally { Date.prototype.toISOString = nativeIso; }
      };
      wrapped._localDateWrapped = true;
      window.renderOverview = wrapped;
    }
  }

  function ensureRetryPanel() {
    if (document.getElementById('googleRetryPanel')) return;
    const status = document.getElementById('saveStatus');
    if (!status?.parentElement) return;
    const btn = document.createElement('button');
    btn.id = 'googleRetryPanel'; btn.className = 'btn danger'; btn.textContent = '重新儲存'; btn.style.padding = '6px 10px';
    btn.onclick = retryPendingSync;
    status.parentElement.insertBefore(btn, status.nextSibling);
  }

  function removeRetryPanel() { document.getElementById('googleRetryPanel')?.remove(); }

  async function loadScript(src, ready) {
    if (ready()) return;
    await new Promise((resolve,reject)=>{
      const s=document.createElement('script'); s.src=src; s.async=true;
      s.onload=()=>ready()?resolve():reject(new Error('同步模組載入失敗。'));
      s.onerror=()=>reject(new Error('同步模組載入失敗。'));
      document.head.appendChild(s);
    });
  }

  async function retryPendingSync() {
    const p = loadPending();
    if (!p?.classData) return;
    if (!window.GoogleAuth?.isSignedIn()) {
      alert('Google 登入已逾時，請重新登入後再按「重新儲存」。');
      if (typeof show === 'function') show('login');
      return;
    }
    syncAttemptActive = true;
    const btn=document.getElementById('googleRetryPanel');
    if(btn){btn.disabled=true;btn.textContent='重新儲存中…';}
    const status=document.getElementById('saveStatus'); if(status) status.textContent='儲存中…';
    try {
      const current = typeof app!=='undefined' ? app.classes?.find(x=>x.id===p.classId) : null;
      const c = current || p.classData;
      if (current) Object.assign(current, deepClone(p.classData));
      await loadScript('teacher/google-student-sync.js',()=>!!window.GoogleStudentSync);
      await loadScript('teacher/google-exam-sync.js',()=>!!window.GoogleExamSync);
      await window.GoogleStudentSync.syncStudents(c);
      await window.GoogleExamSync.syncExamsAndGrades(c);
      clearPending(); syncAttemptActive = false;
      if (typeof save==='function') save();
      if(status) status.textContent='✓ 已儲存';
      if(typeof toast==='function') toast('✓ 已重新同步到 Google');
    } catch (err) {
      syncAttemptActive = false;
      if(status) status.textContent='⚠ 儲存失敗';
      ensureRetryPanel();
      alert(err?.message || '重新儲存失敗，請稍後再試。');
    } finally {
      if(btn){btn.disabled=false;btn.textContent='重新儲存';}
    }
  }

  function installPendingSyncGuard() {
    const mutatingIds = new Set(['saveFirstStudents','saveStudentPaste','addStudent','saveStuEdit','confirmDelStu','confirmStudentMerge','saveManualExam','saveExcelExams','saveExamEdit','confirmDeleteExam']);
    document.addEventListener('click', e => {
      const b=e.target?.closest?.('button');
      if(!b || !mutatingIds.has(b.id)) return;
      syncAttemptActive = true;
      setTimeout(()=>{ const c=typeof currentClass==='function'?currentClass():null; if(c) savePending(c); },0);
    },true);

    const status=document.getElementById('saveStatus');
    if(status){
      new MutationObserver(()=>{
        const t=status.textContent||'';
        if(t.includes('儲存失敗')) { syncAttemptActive=false; ensureRetryPanel(); }
        else if(t.includes('✓ 已儲存') && syncAttemptActive) { syncAttemptActive=false; clearPending(); }
      }).observe(status,{childList:true,characterData:true,subtree:true});
    }
    if(loadPending()) ensureRetryPanel();
  }

  async function preflightClassSheets(store, indexId) {
    const token = await window.GoogleAuth.getAccessToken();
    const rows = await store.readIndexRows(indexId);
    for (const row of rows) {
      const spreadsheetId = String(row?.[3]||'').trim();
      if (!spreadsheetId) continue;
      const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties`, {headers:{Authorization:`Bearer ${token}`}});
      if (!metaRes.ok) continue;
      const meta = await metaRes.json();
      const props=(meta.sheets||[]).map(s=>s.properties).filter(Boolean);
      const names=new Set(props.map(p=>p.title));
      const missing=Object.keys(REQUIRED_SHEETS).filter(n=>!names.has(n));
      if(!missing.length) continue;
      const extras=props.filter(p=>!REQUIRED_SHEETS[p.title]);
      for(const required of missing){
        const expected=REQUIRED_SHEETS[required];
        const matches=[];
        for(const p of extras){
          const range=encodeURIComponent(`'${p.title.replace(/'/g,"''")}'!1:1`);
          const r=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}`,{headers:{Authorization:`Bearer ${token}`}});
          if(!r.ok) continue;
          const data=await r.json();
          const head=(data.values?.[0]||[]).slice(0,expected.length).map(x=>String(x).trim());
          if(expected.every((x,i)=>head[i]===x)) matches.push(p);
        }
        if(matches.length!==1) throw new Error(`班級資料需要修復：找不到「${required}」工作表。若曾重新命名，請改回原名稱後再登入。`);
        const candidate=matches[0];
        const rr=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,{
          method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
          body:JSON.stringify({requests:[{updateSheetProperties:{properties:{sheetId:candidate.sheetId,title:required},fields:'title'}}]})
        });
        if(!rr.ok) throw new Error(`班級資料需要修復：無法將工作表恢復為「${required}」。`);
        extras.splice(extras.indexOf(candidate),1);
      }
    }
  }

  function installDriveStorePreflight() {
    let existing = window.GoogleDriveStore;
    function wrap(store){
      if(!store || store.__productionSafetyWrapped) return store;
      const original=store.loadAllClassesFromGoogle;
      if(typeof original==='function') store.loadAllClassesFromGoogle=async function(indexId){ await preflightClassSheets(store,indexId); return original.call(store,indexId); };
      store.__productionSafetyWrapped=true;
      return store;
    }
    if(existing) { wrap(existing); return; }
    try { Object.defineProperty(window,'GoogleDriveStore',{ configurable:true, get(){return existing;}, set(v){existing=wrap(v);} }); } catch (_) {}
  }

  function findDuplicates(values) {
    const seen=new Set(), dup=new Set();
    values.filter(Boolean).forEach(v=>{ const k=String(v).trim(); if(!k) return; if(seen.has(k)) dup.add(k); else seen.add(k); });
    return [...dup];
  }

  function installDataHealthCheck() {
    const settings = document.getElementById('settings');
    const settingsCard = settings?.querySelector(':scope > .card.pad');
    if (!settingsCard || document.getElementById('dataHealthPanel')) return;

    const panel=document.createElement('div');
    panel.id='dataHealthPanel';
    panel.className='card pad';
    panel.style.marginTop='14px';
    panel.innerHTML=`<div class="head"><div><h3 style="margin:0">資料健檢</h3><div class="small" style="margin-top:4px">檢查目前班級、Google 索引、工作表結構與重複資料。</div></div><button class="btn" id="runDataHealthCheck">開始健檢</button></div><div id="dataHealthResult" class="notice" style="display:none"></div>`;
    const logout=document.getElementById('googleLogoutPanel');
    if(logout) settingsCard.insertBefore(panel,logout); else settingsCard.appendChild(panel);
    document.getElementById('runDataHealthCheck')?.addEventListener('click', runDataHealthCheck);
  }

  async function runDataHealthCheck() {
    const btn=document.getElementById('runDataHealthCheck');
    const out=document.getElementById('dataHealthResult');
    if(!btn||!out) return;
    btn.disabled=true; btn.textContent='檢查中…'; out.style.display='block'; out.innerHTML='正在檢查資料……';

    const results=[];
    const add=(ok,text)=>results.push({ok,text});
    try {
      if(!window.GoogleAuth?.isSignedIn()) throw new Error('Google 登入已逾時，請重新登入後再健檢。');
      const c=typeof currentClass==='function'?currentClass():null;
      if(!c) throw new Error('目前沒有可健檢的使用中班級。');

      add(true,`目前班級：${c.name}｜${c.year}學年度第${c.term}學期`);
      add(true,`學生 ${c.students?.length||0} 位｜考試 ${c.exams?.length||0} 場`);

      const dupSeats=findDuplicates((c.students||[]).map(s=>s.seat));
      add(!dupSeats.length, dupSeats.length?`重複座號：${dupSeats.join('、')}`:'無重複座號');
      const dupAccounts=findDuplicates((c.students||[]).map(s=>String(s.account||'').trim()).filter(Boolean));
      add(!dupAccounts.length, dupAccounts.length?`重複學號：${dupAccounts.join('、')}`:'無重複非空學號');
      const examKeys=(c.exams||[]).map(e=>`${String(e.date||'').trim()}\u0001${String(e.subject||'').trim()}\u0001${String(e.name||'').trim()}`);
      const dupExams=findDuplicates(examKeys);
      add(!dupExams.length, dupExams.length?`發現 ${dupExams.length} 組重複考試`:'無重複考試');

      const token=await window.GoogleAuth.getAccessToken();
      let store=window.GoogleDriveStore;
      if(!store) {
        await loadScript('teacher/google-drive-store.js',()=>!!window.GoogleDriveStore);
        store=window.GoogleDriveStore;
      }
      const index=window.classGradeSystemIndex || await store.ensureTeacherIndex();
      add(!!index?.id,'班級索引可正常存取');
      const rows=await store.readIndexRows(index.id);
      const identities=rows.map(r=>`${String(r?.[0]||'').trim()}\u0001${String(r?.[1]||'').trim()}\u0001${String(r?.[2]||'').trim()}`);
      const dupClassRows=findDuplicates(identities);
      add(!dupClassRows.length,dupClassRows.length?`班級索引有 ${dupClassRows.length} 組重複班級學期`:'班級索引無重複班級學期');

      const sid=String(c.spreadsheetId||'').trim();
      if(!sid) {
        add(false,'目前班級缺少 Spreadsheet ID');
      } else {
        const metaRes=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sid)}?fields=sheets.properties`,{headers:{Authorization:`Bearer ${token}`}});
        if(!metaRes.ok) throw new Error('目前班級的 Google 試算表無法讀取。');
        const meta=await metaRes.json();
        const names=new Set((meta.sheets||[]).map(s=>s.properties?.title).filter(Boolean));
        for(const [sheet,headers] of Object.entries(REQUIRED_SHEETS)) {
          if(!names.has(sheet)) { add(false,`缺少工作表「${sheet}」`); continue; }
          const range=encodeURIComponent(`'${sheet}'!1:1`);
          const r=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sid)}/values/${range}`,{headers:{Authorization:`Bearer ${token}`}});
          if(!r.ok) { add(false,`無法讀取「${sheet}」標題列`); continue; }
          const data=await r.json();
          const got=(data.values?.[0]||[]).slice(0,headers.length).map(x=>String(x).trim());
          const ok=headers.every((x,i)=>got[i]===x);
          add(ok,ok?`「${sheet}」結構正常`:`「${sheet}」標題列需要修復`);
        }
      }

      const bad=results.filter(x=>!x.ok).length;
      out.innerHTML=`<b>${bad?'健檢完成：發現需要注意的項目':'✓ 健檢完成：目前資料正常'}</b><div style="margin-top:8px;line-height:1.8">${results.map(r=>`<div>${r.ok?'✓':'⚠'} ${esc(r.text)}</div>`).join('')}</div>`;
    } catch(err) {
      out.innerHTML=`<b>⚠ 健檢未完成</b><div style="margin-top:6px">${esc(err?.message||'檢查時發生錯誤')}</div>`;
    } finally {
      btn.disabled=false; btn.textContent='重新健檢';
    }
  }

  installLoginHeaderGuard();
  installDraftGuard();
  installFilterDefaults();
  installDuplicateManualExamGuard();
  installPendingSyncGuard();
  installDriveStorePreflight();
  installDataHealthCheck();
  setTimeout(installLocalDateRangeFix,0);
})();