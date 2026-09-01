// Connect the frozen v17 teacher UI to Google OAuth and teacher-owned Google Drive data.
(function () {
  let driveStoreReadyPromise = null;

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
      script.onload = () => {
        if (window.GoogleDriveStore) resolve();
        else reject(new Error('Google Drive 資料模組載入失敗。'));
      };
      script.onerror = () => reject(new Error('Google Drive 資料模組載入失敗。'));
      document.head.appendChild(script);
    });

    return driveStoreReadyPromise;
  }

  async function handleGoogleLogin() {
    const btn = document.getElementById('loginBtn');
    const oldText = btn?.textContent || '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = '正在連線 Google…';
    }
    clearLoginError();

    try {
      const result = await window.GoogleAuth.signIn();
      window.googleTeacherAccount = result.user;

      if (btn) btn.textContent = '正在準備 Google Drive…';
      await loadDriveStoreScript();
      const indexInfo = await window.GoogleDriveStore.ensureTeacherIndex();
      console.info(
        indexInfo.createdNow
          ? '已建立老師專屬班級索引試算表。'
          : '已找到老師專屬班級索引試算表。',
        indexInfo
      );

      // Keep v17's existing class/grade flow intact for now.
      // Only the login identity + Drive index bootstrap are formalized in this stage.
      app.logged = true;
      save();
      if (!app.classes.length) show('firstSetup');
      else show('dash');
    } catch (err) {
      console.error(err);
      showLoginError(`Google 資料初始化失敗：${err?.message || '請稍後再試。'}`);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = oldText || '使用 Google 帳號登入';
      }
    }
  }

  function install() {
    const btn = document.getElementById('loginBtn');
    if (!btn || !window.GoogleAuth) return;

    // v17 used a localStorage flag as a simulated login. Do not trust that flag anymore.
    // OAuth access tokens are intentionally kept only in memory at this stage, so every
    // fresh page load must pass through Google sign-in before Drive/Sheets can be used.
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
