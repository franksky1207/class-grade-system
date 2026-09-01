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
  const REMEMBER_LOGIN_KEY = 'class-grade-system-google-login-known';

  let tokenClient = null;
  let accessToken = null;
  let expiresAt = 0;
  let currentUser = null;
  let gisReadyPromise = null;
  let autoRestoreRunning = false;

  function localToday() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function applyProductionUiCleanup() {
    // 正式版不再顯示早期 UI 測試工具。
    const demoBtn = document.getElementById('demoBtn');
    if (demoBtn) demoBtn.remove();

    document.title = '班級成績管理系統';

    const headerMode = document.querySelector('header .brand + .small');
    if (headerMode) headerMode.textContent = '教師端';

    const login = document.getElementById('login');
    if (login) {
      const subtitle = login.querySelector('.subtitle');
      if (subtitle) {
        subtitle.textContent = '使用 Google 帳號登入，班級資料將連接至你的 Google Drive / Google Sheets。';
      }
      const loginBtn = document.getElementById('loginBtn');
      if (loginBtn) loginBtn.textContent = '使用 Google 帳號登入';
    }

    // 清除畫面中仍殘留的「測試版」字樣，但不碰使用者資料內容。
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      if (!node.parentElement) return;
      if (['SCRIPT', 'STYLE'].includes(node.parentElement.tagName)) return;
      if (node.nodeValue?.includes('測試版')) {
        node.nodeValue = node.nodeValue
          .replace(/教師端測試版/g, '教師端')
          .replace(/測試版/g, '');
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

  function installLoginViewDefaults() {
    document.addEventListener('click', (event) => {
      const target = event.target?.closest?.('button');
      if (target?.id === 'loginBtn') resetLowAverageDefaults();
    }, true);
  }

  function syncGradeEntryDefaultDate() {
    const currentDay = localToday();
    const sessionKey = 'class-grade-system-entry-day';
    const sessionDay = sessionStorage.getItem(sessionKey);

    // 新的一個本地日曆日（或新的瀏覽器工作階段）時，預設回到今天。
    // 同一天內若老師手動改日期，app.examDate 會照原本設計持續沿用。
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
      if (target.dataset?.page === 'entry' || target.dataset?.entryMode) {
        setTimeout(syncGradeEntryDefaultDate, 0);
      }
    });

    // 如果網站跨過午夜仍保持開啟，回到分頁時也重新確認日期。
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

    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: () => {}
    });
  }

  async function fetchUserInfo(token) {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('無法取得 Google 帳號資料。');
    return res.json();
  }

  async function signIn(options = {}) {
    if (accessToken && Date.now() < expiresAt && currentUser) {
      return { user: currentUser, accessToken };
    }

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
          localStorage.setItem(REMEMBER_LOGIN_KEY, '1');
          options.onSuccess?.({ user: currentUser, accessToken });
          resolve({ user: currentUser, accessToken });
        } catch (err) {
          options.onError?.(err);
          reject(err);
        }
      };

      // 不再每次新開網站都強制 prompt=consent。
      // 第一次需要權限時 Google 仍會正常詢問；已授權帳號之後不會被強迫重複同意。
      const requestOptions = {};
      if (Object.prototype.hasOwnProperty.call(options, 'prompt')) {
        requestOptions.prompt = options.prompt;
      }
      tokenClient.requestAccessToken(requestOptions);
    });
  }

  async function getAccessToken() {
    if (accessToken && Date.now() < expiresAt) return accessToken;
    const result = await signIn({ prompt: '' });
    return result.accessToken;
  }

  function getUser() {
    return currentUser;
  }

  function isSignedIn() {
    return !!accessToken && Date.now() < expiresAt;
  }

  function signOut() {
    const tokenToRevoke = accessToken;
    accessToken = null;
    expiresAt = 0;
    currentUser = null;
    localStorage.removeItem(REMEMBER_LOGIN_KEY);

    if (tokenToRevoke && window.google?.accounts?.oauth2) {
      google.accounts.oauth2.revoke(tokenToRevoke, () => {});
    }
  }

  function installLogoutControl() {
    const settings = document.getElementById('settings');
    const settingsCard = settings?.querySelector(':scope > .card.pad');
    if (!settingsCard || document.getElementById('googleLogoutPanel')) return;

    const panel = document.createElement('div');
    panel.id = 'googleLogoutPanel';
    panel.className = 'card pad';
    panel.style.marginTop = '14px';
    panel.innerHTML = `
      <div class="head" style="margin-bottom:0">
        <div>
          <h3 style="margin:0">Google 帳號</h3>
          <div class="small" style="margin-top:4px">需要切換老師帳號或使用共用裝置時，可在這裡登出。</div>
        </div>
        <button class="btn" id="googleLogoutBtn">登出／切換 Google 帳號</button>
      </div>`;
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
      } catch (_) {
        location.reload();
      }
    });
  }

  async function tryAutoRestore() {
    if (autoRestoreRunning) return;
    if (localStorage.getItem(REMEMBER_LOGIN_KEY) !== '1') return;

    const loginBtn = document.getElementById('loginBtn');
    if (!loginBtn) return;

    autoRestoreRunning = true;
    const oldText = loginBtn.textContent;
    loginBtn.disabled = true;
    loginBtn.textContent = '正在恢復 Google 登入…';

    try {
      await signIn({ prompt: '' });
      // 原本的 bridge 仍負責正式讀取 Drive / Sheets；因 token 已存在，這次不會再要求授權。
      loginBtn.disabled = false;
      loginBtn.click();
    } catch (_) {
      // 瀏覽器或 Google 若不允許無互動取得 token，就安靜回到正常登入按鈕。
      loginBtn.disabled = false;
      loginBtn.textContent = oldText || '使用 Google 帳號登入';
    } finally {
      autoRestoreRunning = false;
    }
  }

  window.GoogleAuth = {
    init,
    signIn,
    signOut,
    getAccessToken,
    getUser,
    isSignedIn,
    clientId: CLIENT_ID,
    scopes: SCOPES,
    localToday,
    tryAutoRestore
  };

  applyProductionUiCleanup();
  installLoginViewDefaults();
  installLocalDateFix();
  installLogoutControl();

  // bridge 會在下一個 script 載入；延後一個 event loop，讓正式登入處理器先完成安裝。
  setTimeout(tryAutoRestore, 0);
})();
