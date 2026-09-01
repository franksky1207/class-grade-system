// Connect the frozen v17 teacher UI to Google OAuth and teacher-owned Google Drive data.
(function () {
  let driveStoreReadyPromise = null;
  let studentSyncReadyPromise = null;
  let examSyncReadyPromise = null;
  let studentSyncQueue = Promise.resolve();
  let examSyncQueue = Promise.resolve();

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

  function queueExamSync(c) {
    examSyncQueue = examSyncQueue.then(async () => {
      setSaveStatus('儲存中…');
      try {
        await loadDriveStoreScript();
        await loadExamSyncScript();
        await window.GoogleExamSync.syncExamsAndGrades(c);
        setSaveStatus('✓ 已儲存');
      } catch (err) {
        console.error('考試／成績寫入 Google Sheets 失敗：', err);
        setSaveStatus('⚠ 儲存失敗');
        if (typeof toast === 'function') toast('⚠ Google Sheets 儲存失敗');
      }
    });
    return examSyncQueue;
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

  function rememberCurrentClass() {
    const c = (typeof currentClass === 'function') ? currentClass() : null;
    return c ? {
      spreadsheetId:c.spreadsheetId || '',
      name:c.name || '',
      year:String(c.year || ''),
      term:String(c.term || '')
    } : null;
  }

  function chooseCurrentClass(classes, previous) {
    if (!classes.length) return null;
    let hit = null;
    if (previous?.spreadsheetId) hit = classes.find(c => c.spreadsheetId === previous.spreadsheetId) || null;
    if (!hit && previous) {
      hit = classes.find(c => c.name === previous.name && String(c.year) === previous.year && String(c.term) === previous.term) || null;
    }
    if (!hit) hit = classes.find(c => !c.archived) || classes[0];
    return hit;
  }

  async function handleGoogleLogin() {
    const btn = document.getElementById('loginBtn');
    const oldText = btn?.textContent || '';
    if (btn) { btn.disabled = true; btn.textContent = '正在連線 Google…'; }
    clearLoginError();

    try {
      const result = await window.GoogleAuth.signIn();
      window.googleTeacherAccount = result.user;
      const previousClass = rememberCurrentClass();
      const localClassesBeforeGoogle = Array.isArray(app.classes) ? app.classes : [];

      if (btn) btn.textContent = '正在準備 Google Drive…';
      await loadDriveStoreScript();
      const indexInfo = await window.GoogleDriveStore.ensureTeacherIndex();

      // One-time migration safeguard: only when Google index has no classes yet.
      let indexRows = await window.GoogleDriveStore.readIndexRows(indexInfo.id);
      const hasGoogleClasses = indexRows.some(r => String(r?.[3] || '').trim());
      if (!hasGoogleClasses && localClassesBeforeGoogle.length) {
        if (btn) btn.textContent = '正在搬移舊班級資料…';
        const migration = await window.GoogleDriveStore.ensureLocalClasses(localClassesBeforeGoogle);
        if (migration.changed) save();
      }

      if (btn) btn.textContent = '正在載入班級資料…';
      const loaded = await window.GoogleDriveStore.loadAllClassesFromGoogle();

      // From this point on, Google Sheets is the source of truth for class data.
      app.classes = loaded.classes;
      const selected = chooseCurrentClass(app.classes, previousClass);
      app.currentClassId = selected?.id || null;
      app.ovStudents = [];
      app.logged = true;
      save();

      console.info(`已從 Google 載入 ${app.classes.length} 個班級。`, indexInfo);
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
    installExamSaveBridge();
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
