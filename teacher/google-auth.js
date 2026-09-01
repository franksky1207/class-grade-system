// Google OAuth helper for teacher site
// Public OAuth Client ID only. Never place a client secret in frontend code.
(function () {
  const CLIENT_ID = 'it78nmndnfqg9opfbik0vv37i1iepe4d.apps.googleusercontent.com';
  const SCOPES = [
    'openid',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/spreadsheets'
  ].join(' ');

  let tokenClient = null;
  let accessToken = null;
  let expiresAt = 0;
  let currentUser = null;
  let gisReadyPromise = null;

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
          options.onSuccess?.({ user: currentUser, accessToken });
          resolve({ user: currentUser, accessToken });
        } catch (err) {
          options.onError?.(err);
          reject(err);
        }
      };

      tokenClient.requestAccessToken({
        prompt: options.prompt || (accessToken ? '' : 'consent')
      });
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
    if (accessToken && window.google?.accounts?.oauth2) {
      google.accounts.oauth2.revoke(accessToken, () => {});
    }
    accessToken = null;
    expiresAt = 0;
    currentUser = null;
  }

  window.GoogleAuth = {
    init,
    signIn,
    signOut,
    getAccessToken,
    getUser,
    isSignedIn,
    clientId: CLIENT_ID,
    scopes: SCOPES
  };
})();
