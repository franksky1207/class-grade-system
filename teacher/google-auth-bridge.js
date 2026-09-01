// Connect the frozen v17 teacher UI to Google OAuth and teacher-owned Google Drive data.
(function () {
  let driveStoreReadyPromise = null;
  let studentSyncReadyPromise = null;
  let examSyncReadyPromise = null;
  let classLifecycleReadyPromise = null;
  let studentSyncQueue = Promise.resolve();
  let examSyncRunning = false;
  let examSyncDirty = false;
  let latestExamSyncClass = null;
  let pendingPermanentDeleteClassId = null;

  function showLoginError(message) {
    const login = document.getElementById('login');
    if (!login) return;
    let box = document.getElementById('googleLoginError');
    if (!box) {
      box = document.createElement('div');
      box.id = 'googleLoginError';
      box.className = 'notice';
      box.style.marginTop = '12px';
      const card = login.querySelector('.card');
      card?.appendChild(box);
    }
    box.textContent = message;
  }

  function clearLoginError() {
    const box = document.getElementById('googleLoginError');
    if (box) box.remove();
  }

  function applyProductionLabels() {
    document.title = '班級成績管理系統';
    const headerMode = document.querySelector('header .brand + .small');
    if (headerMode) headerMode.textContent = '教師端';
  }

  function setSaveStatus(text) {
    const el = document.getElementById('saveStatus');
    if (el) el.textContent = text;
  }

  function loadDriveStoreScript() {
    if (window.GoogleDriveStore) return Promise.resolve();
    if (driveStoreReadyPromise) return driveStoreReadyPromise;
    driveStoreReadyPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-google-drive-store]');
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = 'teacher/google-drive-store.js';
      script.async = true;
      script.dataset.googleDriveStore = '1';
      script.onload = () => window.GoogleDriveStore ? resolve() : reject(new Error('Google Drive 資料模組載入失敗。'));
      script.onerror = () => reject(new Error('Google Drive 資料模組載入失敗。'));
      document.head.appendChild(script);
    });
    return driveStoreReadyPromise;
  }

  function loadStudentSyncScript() {
    if (window.GoogleStudentSync) return Promise.resolve();
    if (studentSyncReadyPromise) return studentSyncReadyPromise;
    studentSyncReadyPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'teacher/google-student-sync.js';
      script.async = true;
      script.onload = () => window.GoogleStudentSync ? resolve() : reject(new Error('學生資料同步模組載入失敗。'));
      script.onerror = () => reject(new Error('學生資料同步模組載入失敗。'));
      document.head.appendChild(script);
    });
    return studentSyncReadyPromise;
  }

  function loadExamSyncScript() {
    if (window.GoogleExamSync) return Promise.resolve();
    if (examSyncReadyPromise) return examSyncReadyPromise;
    examSyncReadyPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'teacher/google-exam-sync.js';
      script.async = true;
      script.onload = () => window.GoogleExamSync ? resolve() : reject(new Error('考試與成績同步模組載入失敗。'));
      script.onerror = () => reject(new Error('考試與成績同步模組載入失敗。'));
      document.head.appendChild(script);
    });
    return examSyncReadyPromise;
  }

  function loadClassLifecycleScript() {
    if (window.GoogleClassLifecycle) return Promise.resolve();
    if (classLifecycleReadyPromise) return classLifecycleReadyPromise;
    classLifecycleReadyPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'teacher/google-class-lifecycle.js';
      script.async = true;
      script.onload = () => window.GoogleClassLifecycle ? resolve() : reject(new Error('班級 Google 管理模組載入失敗。'));
      script.onerror = () => reject(new Error('班級 Google 管理模組載入失敗。'));
      document.head.appendChild(script);
    });
    return classLifecycleReadyPromise;
  }

  function studentFingerprint(c) {
    return JSON.stringify((c?.students || []).map(s => [s.seat, s.name, s.account, s.pass]));
  }

  function examFingerprint(c) {
    return JSON.stringify((c?.exams || []).map(e => [
      e.date,
      e.subject,
      e.name,
      (e.scores || []).map(s => [s.seat, s.name, s.value])
    ]));
  }

  function examKey(e) {
    return [String(e?.date || '').trim(), String(e?.subject || '').trim(), String(e?.name || '').trim()].join('\u0001');
  }

  function removeDuplicateExamsKeepLatest(c) {
    if (!c?.exams?.length) return 0;
    const seen = new Set();
    const keptReversed = [];
    let removed = 0;
    for (let i = c.exams.length - 1; i >= 0; i--) {
      const e = c.exams[i];
      const key = examKey(e);
      if (seen.has(key)) {
        removed++;
        continue;
      }
      seen.add(key);
      keptReversed.push(e);
    }
    if (removed) c.exams = keptReversed.reverse();
    return removed;
  }

  function queueStudentSync(c) {
    studentSyncQueue = studentSyncQueue.then(async () => {
      setSaveStatus('儲存中…');
      try {
        await loadDriveStoreScript();
        await loadStudentSyncScript();
        await window.GoogleStudentSync.syncStudents(c);
        setSaveStatus('✓ 已儲存');
      } catch (err) {
        console.error('學生資料寫入 Google Sheets 失敗：', err);
        setSaveStatus('⚠ 儲存失敗');
        if (typeof toast === 'function') toast('⚠ Google Sheets 儲存失敗');
      }
    });
    return studentSyncQueue;
  }

  async function drainExamSync() {
    if (examSyncRunning) return;
    examSyncRunning = true;
    try {
      await loadDriveStoreScript();
      await loadExamSyncScript();
      while (examSyncDirty) {
        examSyncDirty = false;
        const c = latestExamSyncClass;
        if (!c) break;
        setSaveStatus('儲存中…');
        await window.GoogleExamSync.syncExamsAndGrades(c);
      }
      setSaveStatus('✓ 已儲存');
    } catch (err) {
      console.error('考試／成績寫入 Google Sheets 失敗：', err);
      setSaveStatus('⚠ 儲存失敗');
      if (typeof toast === 'function') toast('⚠ Google Sheets 儲存失敗');
    } finally {
      examSyncRunning = false;
      if (examSyncDirty) drainExamSync();
    }
  }

  function queueExamSync(c) {
    latestExamSyncClass = c;
    examSyncDirty = true;
    setSaveStatus('儲存中…');
    drainExamSync();
  }

  async function repairLoadedExamData(classes) {
    const repairs = (classes || []).filter(c => c?._googleNeedsExamRepair);
    if (!repairs.length) return 0;
    await loadExamSyncScript();
    setSaveStatus('正在修復 Google 成績資料…');
    for (const c of repairs) {
      await window.GoogleExamSync.syncExamsAndGrades(c);
      delete c._googleNeedsExamRepair;
    }
    setSaveStatus('✓ 已儲存');
    return repairs.length;
  }

  function installStudentSaveBridge() {
    const studentActionIds = new Set([
      'saveFirstStudents','saveStudentPaste','addStudent','saveStuEdit','confirmDelStu','confirmStudentMerge'
    ]);
    document.addEventListener('click', (event) => {
      const target = event.target?.closest?.('button');
      if (!target || !studentActionIds.has(target.id)) return;
      const c = (typeof currentClass === 'function') ? currentClass() : null;
      if (!c) return;
      const before = studentFingerprint(c);
      const force = target.id === 'saveFirstStudents';
      setTimeout(() => {
        const after = studentFingerprint(c);
        if (force || before !== after) queueStudentSync(c);
      }, 0);
    }, true);
  }

  function installExcelExamDedupBridge() {
    document.addEventListener('click', (event) => {
      const target = event.target?.closest?.('button');
      if (!target || target.id !== 'saveExcelExams') return;
      const c = (typeof currentClass === 'function') ? currentClass() : null;
      if (!c) return;
      setTimeout(() => {
        const removed = removeDuplicateExamsKeepLatest(c);
        if (!removed) return;
        if (typeof save === 'function') save();
        if (typeof toast === 'function') toast(`✓ 已更新既有考試（避免 ${removed} 筆重複）`);
      }, 0);
    }, true);
  }

  function installExamSaveBridge() {
    const examActionIds = new Set([
      'saveManualExam','saveExcelExams','saveExamEdit','confirmDeleteExam'
    ]);
    document.addEventListener('click', (event) => {
      const target = event.target?.closest?.('button');
      if (!target || !examActionIds.has(target.id)) return;
      const c = (typeof currentClass === 'function') ? currentClass() : null;
      if (!c) return;
      const before = examFingerprint(c);
      setTimeout(() => {
        const after = examFingerprint(c);
        if (before !== after) queueExamSync(c);
      }, 0);
    }, true);
  }

  function installPermanentClassDeleteBridge() {
    document.addEventListener('click', (event) => {
      const target = event.target?.closest?.('button');
      if (!target) return;

      if (target.dataset?.deleteClass) {
        pendingPermanentDeleteClassId = target.dataset.deleteClass;
        return;
      }

      if (target.id !== 'confirmDeleteClass') return;
      const id = pendingPermanentDeleteClassId;
      const c = (typeof app !== 'undefined') ? app.classes?.find(x => x.id === id) : null;
      if (!c) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const oldText = target.textContent;
      target.disabled = true;
      target.textContent = '正在永久刪除…';
      setSaveStatus('儲存中…');

      (async () => {
        try {
          await loadDriveStoreScript();
          await loadClassLifecycleScript();
          await window.GoogleClassLifecycle.permanentDeleteClass(c);

          app.classes = app.classes.filter(x => x.id !== id);
          if (app.currentClassId === id) {
            const next = (typeof activeClasses === 'function' ? activeClasses()[0] : null) || app.classes[0];
            app.currentClassId = next ? next.id : null;
          }
          pendingPermanentDeleteClassId = null;
          if (typeof save === 'function') save();
          if (typeof closeModal === 'function') closeModal();
          setSaveStatus('✓ 已儲存');
          if (typeof toast === 'function') toast('班級已永久刪除');
          if (app.currentClassId) show('settings'); else show('firstSetup');
        } catch (err) {
          console.error('永久刪除班級失敗：', err);
          setSaveStatus('⚠ 儲存失敗');
          target.disabled = false;
          target.textContent = oldText || '確定永久刪除';
          if (typeof toast === 'function') toast(`⚠ 永久刪除失敗：${err?.message || '請稍後再試'}`);
        }
      })();
    }, true);
  }

  async function handleGoogleLogin() {
    const btn = document.getElementById('loginBtn');
    const oldText = btn?.textContent || '';
    if (btn) { btn.disabled = true; btn.textContent = '正在連線 Google…'; }
    clearLoginError();

    try {
      const result = await window.GoogleAuth.signIn();
      window.googleTeacherAccount = result.user;

      if (btn) btn.textContent = '正在準備 Google Drive…';
      await loadDriveStoreScript();
      const indexInfo = await window.GoogleDriveStore.ensureTeacherIndex();

      const indexRows = await window.GoogleDriveStore.readIndexRows(indexInfo.id);
      if (!indexRows.length && app.classes?.length) {
        if (btn) btn.textContent = '正在建立班級資料…';
        const migration = await window.GoogleDriveStore.ensureLocalClasses(app.classes);
        if (migration.changed) save();
      }

      if (btn) btn.textContent = '正在載入班級資料…';
      const loaded = await window.GoogleDriveStore.loadAllClassesFromGoogle(indexInfo.id);
      app.classes = loaded.classes;

      const repairCount = await repairLoadedExamData(app.classes);
      if (repairCount) console.info(`已自動修復 ${repairCount} 個班級的考試／成績殘留資料。`);

      const active = app.classes.filter(c => !c.archived);
      if (!app.classes.some(c => c.id === app.currentClassId)) {
        app.currentClassId = (active[0] || app.classes[0] || {}).id || null;
      }

      console.info('Google Drive / Sheets 初始化完成。', indexInfo);
      app.logged = true;
      save();
      if (!app.classes.length) show('firstSetup'); else show('dash');
    } catch (err) {
      console.error(err);
      showLoginError(`Google 資料初始化失敗：${err?.message || '請稍後再試。'}`);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = oldText || '使用 Google 帳號登入'; }
    }
  }

  function install() {
    applyProductionLabels();
    installStudentSaveBridge();
    installExcelExamDedupBridge();
    installExamSaveBridge();
    installPermanentClassDeleteBridge();
    const btn = document.getElementById('loginBtn');
    if (!btn || !window.GoogleAuth) return;

    if (typeof app !== 'undefined') {
      app.logged = false;
      save();
      show('login');
      updateHeader();
    }

    btn.textContent = '使用 Google 帳號登入';
    const subtitle = document.querySelector('#login .subtitle');
    if (subtitle) subtitle.textContent = '使用 Google 帳號登入，班級資料將連接至你的 Google Drive／Google Sheets。';
    btn.onclick = handleGoogleLogin;
    window.GoogleAuth.init().catch(err => {
      console.error(err);
      showLoginError('Google 登入服務載入失敗，請重新整理頁面後再試。');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true });
  else install();
})();
