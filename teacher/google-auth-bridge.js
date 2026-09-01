// Connect the frozen v17 teacher UI to the Google OAuth helper.
(function () {
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

  async function handleGoogleLogin() {
    const btn = document.getElementById('loginBtn');
    const oldText = btn?.textContent || '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = '正在連線 Google…';
    }

    try {
      const result = await window.GoogleAuth.signIn();
      window.googleTeacherAccount = result.user;

      // Keep v17's existing app flow intact for now.
      app.logged = true;
      save();
      if (!app.classes.length) show('firstSetup');
      else show('dash');
    } catch (err) {
      console.error(err);
      showLoginError(`Google 登入失敗：${err?.message || '請稍後再試。'}`);
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
    btn.textContent = '使用 Google 帳號登入';
    const subtitle = document.querySelector('#login .subtitle');
    if (subtitle) subtitle.textContent = '使用 Google 帳號登入，後續班級資料將連接至你的 Google Drive／Google Sheets。';
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
