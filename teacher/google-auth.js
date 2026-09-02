// Google OAuth helper for teacher site
// Public OAuth Client ID only. Never place a client secret in frontend code.
(function () {
  const CLIENT_ID = '869980313279-it78nmndnfqg9opfbik0vv37i1iepe4d.apps.googleusercontent.com';
  const SCOPES = [
    'openid',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/spreadsheets'
  ].join(' ');
  const SESSION_KEY = 'class-grade-system-google-session';

  let tokenClient = null;
  let accessToken = null;
  let expiresAt = 0;
  let currentUser = null;
  let gisReadyPromise = null;

  function localToday() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function applyProductionUiCleanup() {
    const demoBtn = document.getElementById('demoBtn');
    if (demoBtn) demoBtn.remove();

    document.title = '班級成績管理系統';

    const headerMode = document.querySelector('header .brand + .small');
    if (headerMode) headerMode.textContent = '教師端';

    const login = document.getElementById('login');
    if (login) {
      const subtitle = login.querySelector('.subtitle');
      if (subtitle) subtitle.textContent = '使用 Google 帳號登入，班級資料將連接至你的 Google Drive / Google Sheets。';
      const loginBtn = document.getElementById('loginBtn');
      if (loginBtn) loginBtn.textContent = '使用 Google 帳號登入';
    }

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      if (!node.parentElement) return;
      if (['SCRIPT', 'STYLE'].includes(node.parentElement.tagName)) return;
      if (node.nodeValue?.includes('測試版')) {
        node.nodeValue = node.nodeValue.replace(/教師端測試版/g, '教師端').replace(/測試版/g, '');
      }
    });
  }

  function resetLowAverageDefaults() {
    try {
      if (typeof app === 'undefined') return;
      app.lowRange = 'n10';
      app.lowSort = 'seat';
      app.lowExpanded = false;
      app.lowCustomN = 10;
      app.lowStart = '';
      app.lowEnd = '';
      if (typeof save === 'function') save();
    } catch (_) {}
  }

  function resetOverviewStudentDefaults() {
    try {
      if (typeof app === 'undefined') return;
      app.ovStudents = [];
      app.ovRange = 'n10';
      app.ovCount = 20;
      app.ovStart = '';
      app.ovEnd = '';
      const subject = document.getElementById('overviewSubject');
      if (subject) subject.value = '';
      if (typeof save === 'function') save();
    } catch (_) {}
  }

  function installLoginViewDefaults() {
    document.addEventListener('click', (event) => {
      const target = event.target?.closest?.('button');
      if (!target) return;
      if (target.id === 'loginBtn') {
        resetLowAverageDefaults();
        resetOverviewStudentDefaults();
        return;
      }
      if (target.dataset?.page === 'overview') resetOverviewStudentDefaults();
    }, true);
  }

  function syncGradeEntryDefaultDate() {
    const currentDay = localToday();
    const sessionKey = 'class-grade-system-entry-day';
    const sessionDay = sessionStorage.getItem(sessionKey);

    if (sessionDay !== currentDay) {
      sessionStorage.setItem(sessionKey, currentDay);
      try {
        if (typeof app !== 'undefined') {
          app.examDate = currentDay;
          if (typeof save === 'function') save();
        }
      } catch (_) {}
    }

    try {
      if (typeof app !== 'undefined') {
        const value = app.examDate || currentDay;
        const manualDate = document.getElementById('manualDate');
        const excelDate = document.getElementById('excelDate');
        if (manualDate) manualDate.value = value;
        if (excelDate) excelDate.value = value;
      }
    } catch (_) {}
  }

  function installLocalDateFix() {
    syncGradeEntryDefaultDate();
    document.addEventListener('click', (event) => {
      const target = event.target?.closest?.('button');
      if (!target) return;
      if (target.dataset?.page === 'entry' || target.dataset?.entryMode) setTimeout(syncGradeEntryDefaultDate, 0);
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) syncGradeEntryDefaultDate();
    });
  }

  function loadGisScript() {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    if (gisReadyPromise) return gisReadyPromise;

    gisReadyPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-google-gis]');
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.dataset.googleGis = '1';
      script.onload = resolve;
      script.onerror = () => reject(new Error('無法載入 Google 登入服務。'));
      document.head.appendChild(script);
    });
    return gisReadyPromise;
  }

  async function init() {
    await loadGisScript();
    if (tokenClient) return;
    tokenClient = google.accounts.oauth2.initTokenClient({ client_id: CLIENT_ID, scope: SCOPES, callback: () => {} });
  }

  async function fetchUserInfo(token) {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error('無法取得 Google 帳號資料。');
    return res.json();
  }

  function clearStoredSession() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (_) {}
  }

  function saveStoredSession() {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ accessToken, expiresAt, currentUser })); } catch (_) {}
  }

  function restoreStoredSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return false;
      const saved = JSON.parse(raw);
      if (!saved?.accessToken || !saved?.currentUser || !Number(saved?.expiresAt) || Date.now() >= Number(saved.expiresAt)) {
        clearStoredSession();
        return false;
      }
      accessToken = saved.accessToken;
      expiresAt = Number(saved.expiresAt);
      currentUser = saved.currentUser;
      return true;
    } catch (_) {
      clearStoredSession();
      return false;
    }
  }

  async function signIn(options = {}) {
    if (accessToken && Date.now() < expiresAt && currentUser) return { user: currentUser, accessToken };
    await init();

    return new Promise((resolve, reject) => {
      tokenClient.callback = async (response) => {
        if (response.error) {
          reject(new Error(response.error_description || response.error));
          return;
        }
        try {
          accessToken = response.access_token;
          const expiresIn = Number(response.expires_in || 3600);
          expiresAt = Date.now() + Math.max(0, expiresIn - 60) * 1000;
          currentUser = await fetchUserInfo(accessToken);
          saveStoredSession();
          options.onSuccess?.({ user: currentUser, accessToken });
          resolve({ user: currentUser, accessToken });
        } catch (err) {
          clearStoredSession();
          options.onError?.(err);
          reject(err);
        }
      };

      const requestOptions = {};
      if (Object.prototype.hasOwnProperty.call(options, 'prompt')) requestOptions.prompt = options.prompt;
      tokenClient.requestAccessToken(requestOptions);
    });
  }

  async function getAccessToken() {
    if (accessToken && Date.now() < expiresAt) return accessToken;
    accessToken = null;
    expiresAt = 0;
    currentUser = null;
    clearStoredSession();
    const err = new Error('Google 登入已逾時，請重新登入後再繼續。');
    err.code = 'GOOGLE_REAUTH_REQUIRED';
    throw err;
  }

  function getUser() { return currentUser; }
  function isSignedIn() { return !!accessToken && Date.now() < expiresAt; }

  function signOut() {
    const tokenToRevoke = accessToken;
    accessToken = null;
    expiresAt = 0;
    currentUser = null;
    clearStoredSession();
    if (tokenToRevoke && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(tokenToRevoke, () => {});
  }

  function installLogoutControl() {
    const settings = document.getElementById('settings');
    const settingsCard = settings?.querySelector(':scope > .card.pad');
    if (!settingsCard || document.getElementById('googleLogoutPanel')) return;

    const panel = document.createElement('div');
    panel.id = 'googleLogoutPanel';
    panel.className = 'card pad';
    panel.style.marginTop = '14px';
    panel.innerHTML = `<div class="head" style="margin-bottom:0"><div><h3 style="margin:0">Google 帳號</h3><div class="small" style="margin-top:4px">需要切換老師帳號或使用共用裝置時，可在這裡登出。</div></div><button class="btn" id="googleLogoutBtn">登出／切換 Google 帳號</button></div>`;
    settingsCard.appendChild(panel);

    document.getElementById('googleLogoutBtn')?.addEventListener('click', () => {
      signOut();
      try {
        if (typeof app !== 'undefined') {
          app.logged = false;
          app.currentClassId = null;
          app.classes = [];
          app.page = 'login';
          if (typeof save === 'function') save();
        }
        if (typeof show === 'function') show('login');
        if (typeof updateHeader === 'function') updateHeader();
      } catch (_) { location.reload(); }
    });
  }

  function tryAutoRestore() {
    if (!restoreStoredSession()) return;
    const startedAt = Date.now();
    const tryRun = () => {
      const loginBtn = document.getElementById('loginBtn');
      if (loginBtn && typeof loginBtn.onclick === 'function' && !loginBtn.disabled) {
        loginBtn.click();
        return;
      }
      if (Date.now() - startedAt < 3000) setTimeout(tryRun, 50);
    };
    tryRun();
  }

  function loadProductionSafety() {
    if (document.querySelector('script[data-production-safety]')) return;
    const script = document.createElement('script');
    script.src = 'teacher/production-safety.js';
    script.async = false;
    script.dataset.productionSafety = '1';
    document.head.appendChild(script);
  }

  function loadUiPolish() {
    if (document.querySelector('script[data-ui-polish]')) return;
    const script = document.createElement('script');
    script.src = 'teacher/ui-polish.js';
    script.async = false;
    script.dataset.uiPolish = '1';
    document.head.appendChild(script);
  }

  function loadParentQuerySettings() {
    if (document.querySelector('script[data-parent-query-settings]')) return;
    const script = document.createElement('script');
    script.src = 'teacher/parent-query-settings.js';
    script.async = false;
    script.dataset.parentQuerySettings = '1';
    document.head.appendChild(script);
  }

  window.GoogleAuth = {
    init, signIn, signOut, getAccessToken, getUser, isSignedIn,
    clientId: CLIENT_ID, scopes: SCOPES, localToday, tryAutoRestore
  };

  applyProductionUiCleanup();
  installLoginViewDefaults();
  installLocalDateFix();
  installLogoutControl();
  loadProductionSafety();
  loadUiPolish();
  loadParentQuerySettings();
  setTimeout(tryAutoRestore, 0);
})();
