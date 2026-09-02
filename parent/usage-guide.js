// Parent/student usage guide and latest-grade indicator.
(function () {
  const SESSION_KEY = 'class-grade-system-parent-session';

  function text(v) { return String(v ?? '').trim(); }
  function readData() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const saved = JSON.parse(raw);
      return saved?.data?.ok ? saved.data : null;
    } catch (_) { return null; }
  }
  function shortDate(v) {
    const m = text(v).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    return m ? `${Number(m[2])}/${Number(m[3])}` : text(v);
  }

  function addStyles() {
    if (document.getElementById('parentUsageGuideStyles')) return;
    const style = document.createElement('style');
    style.id = 'parentUsageGuideStyles';
    style.textContent = `
      .parent-help-btn{border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;border-radius:10px;padding:8px 10px;font-size:13px;font-weight:850;white-space:nowrap}
      .parent-latest-score{margin-top:9px;display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:5px 9px;background:#f8fafc;border:1px solid #e2e8f0;color:#475569;font-size:12px;font-weight:800}
      .parent-help-overlay{position:fixed;inset:0;z-index:80;background:rgba(15,23,42,.28);display:none}.parent-help-overlay.open{display:block}
      .parent-help-drawer{position:fixed;top:0;right:-460px;z-index:90;width:min(430px,94vw);height:100vh;background:#fff;border-left:1px solid #e5e7eb;box-shadow:-12px 0 36px rgba(15,23,42,.16);transition:.22s;padding:18px;overflow:auto}.parent-help-drawer.open{right:0}
      .parent-help-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}.parent-help-head h2{font-size:21px;margin:0}.parent-help-close{border:1px solid #e5e7eb;background:#fff;border-radius:10px;padding:7px 10px;font-weight:900;color:#475569}
      .parent-help-quick{border:1px solid #bfdbfe;background:#eff6ff;border-radius:14px;padding:12px 13px;color:#374151;font-size:13px;line-height:1.75;margin-bottom:10px}
      .parent-help-section{border:1px solid #e5e7eb;border-radius:12px;background:#fafafa;padding:10px 12px;margin-top:8px}.parent-help-section summary{cursor:pointer;font-weight:850;color:#1f2937}.parent-help-body{border-top:1px solid #e5e7eb;margin-top:9px;padding-top:9px;color:#4b5563;font-size:13px;line-height:1.75}.parent-help-body p{margin:6px 0}.parent-help-body ul{margin:6px 0 6px 18px;padding:0}.parent-help-body li{margin:4px 0}
      @media(max-width:767px){.app-header-inner{gap:8px}.parent-help-btn{padding:8px 9px}.parent-help-drawer{padding:16px}.parent-latest-score{font-size:11px}}
    `;
    document.head.appendChild(style);
  }

  function ensureGuide() {
    if (document.getElementById('parentHelpDrawer')) return;
    const overlay = document.createElement('div');
    overlay.id = 'parentHelpOverlay';
    overlay.className = 'parent-help-overlay';
    const drawer = document.createElement('aside');
    drawer.id = 'parentHelpDrawer';
    drawer.className = 'parent-help-drawer';
    drawer.innerHTML = `
      <div class="parent-help-head"><h2>使用說明</h2><button type="button" class="parent-help-close" data-parent-help-close>×</button></div>
      <div class="parent-help-quick"><b>快速使用</b><br>首頁：查看最近公布的成績<br>成績紀錄：查看目前公開學期的歷史成績<br>分科表現：查看各科平均、近期相對位置、變化與百分位趨勢</div>
      <details class="parent-help-section"><summary>1. 首頁｜最近公布的成績</summary><div class="parent-help-body"><p>首頁顯示最近 7 個日曆日內有登記的成績，可切換日期；同一天若有多筆成績，手機可左右滑動查看，桌機會直接排列顯示。</p><p>每筆會顯示原始分數、班平均、名次與實際應試人數，並標示高於、低於或等於班平均。</p></div></details>
      <details class="parent-help-section"><summary>2. 成績紀錄｜本學期歷史成績</summary><div class="parent-help-body"><p>依日期由新到舊顯示目前公開學期的成績。可逐步載入更早資料，直到顯示本學期全部成績。</p></div></details>
      <details class="parent-help-section"><summary>3. 分科表現｜平均與近期成績</summary><div class="parent-help-body"><p>選擇科目後，可查看近期平均、本學期平均與各次成績。近期範圍可切換近 5、10、15 次；百分位趨勢另支援自訂次數與全部。</p><p>空白成績不列入計算，0 分是有效成績。</p></div></details>
      <details class="parent-help-section"><summary>4. 百分位、位置與變化怎麼看？</summary><div class="parent-help-body"><p><b>班級百分位</b>越高，表示該次考試在班級中的相對位置越前。百分位採 midrank：〔低於該生成績的人數＋0.5×同分人數〕÷實際應試人數×100。</p><p><b>近期相對位置</b>依所選範圍內平均百分位判定：高位 ≥ 70；中位 ≥ 30 且未滿 70；低位 &lt; 30。</p><p><b>近期變化</b>依百分位的整體趨勢與相鄰考試起伏判定：整體上升幅度 ≥ 12 個百分位點為「上升」，≤ -12 為「下降」；未達上述門檻但相鄰考試平均絕對變動 ≥ 15 為「波動較大」，其餘為「穩定」。</p><p>這些分類只描述近期班級相對位置與變化，不代表學生長期能力或固定程度。</p></div></details>
      <details class="parent-help-section"><summary>5. 平均與名次計算</summary><div class="parent-help-body"><p>班平均＝有效數字成績總和 ÷ 實際有成績人數；空白不計，0 分計入。</p><p>名次採競賽排名，例如 100、95、95、90 的名次為 1、2、2、4。名次與百分位都只使用該次實際有有效成績的學生計算。</p></div></details>
      <details class="parent-help-section"><summary>6. 資料範圍與隱私</summary><div class="parent-help-body"><p>家長／學生只能查看自己的資料，無法查看其他學生的個別成績。班平均、名次與百分位只以統計結果呈現。</p><p>網站顯示的是老師目前公開的班級與學期。教師端切換工作班級，不會自動改變家長目前公開的班級。</p></div></details>`;
    document.body.appendChild(overlay);
    document.body.appendChild(drawer);

    const close = () => { overlay.classList.remove('open'); drawer.classList.remove('open'); };
    overlay.addEventListener('click', close);
    drawer.querySelector('[data-parent-help-close]')?.addEventListener('click', close);
  }

  function openGuide() {
    ensureGuide();
    document.getElementById('parentHelpOverlay')?.classList.add('open');
    document.getElementById('parentHelpDrawer')?.classList.add('open');
  }

  function ensureHelpButton() {
    const header = document.querySelector('.app-header-inner');
    const logout = document.getElementById('logoutBtn');
    if (!header || !logout || document.getElementById('parentHelpBtn')) return;
    const button = document.createElement('button');
    button.id = 'parentHelpBtn';
    button.type = 'button';
    button.className = 'parent-help-btn';
    button.textContent = '？ 說明';
    button.title = '開啟使用說明';
    button.addEventListener('click', openGuide);
    header.insertBefore(button, logout);
  }

  function ensureLatestScore() {
    const card = document.getElementById('studentCard');
    if (!card || card.querySelector('[data-parent-latest-score]')) return;
    const data = readData();
    if (!data) return;
    const records = Array.isArray(data.records) ? data.records : [];
    const dates = records.map(r => text(r?.date)).filter(Boolean).sort((a, b) => b.localeCompare(a));
    const badge = document.createElement('div');
    badge.dataset.parentLatestScore = '1';
    badge.className = 'parent-latest-score';
    badge.textContent = dates.length ? `目前最新成績：${shortDate(dates[0])}` : '目前尚無成績資料';
    const copy = card.children?.[1] || card;
    copy.appendChild(badge);
  }

  function install() {
    addStyles();
    ensureGuide();
    const app = document.getElementById('appView');
    if (!app || app.classList.contains('hidden')) return;
    ensureHelpButton();
    ensureLatestScore();
  }

  const observer = new MutationObserver(install);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  document.addEventListener('click', () => setTimeout(install, 0), true);
  install();
})();
