// Make progressive in-page help clearly discoverable without changing its content.
(function () {
  function addStyles() {
    if (document.getElementById('helpVisibilityStyles')) return;
    const style = document.createElement('style');
    style.id = 'helpVisibilityStyles';
    style.textContent = `
      .context-help{padding:0!important;overflow:hidden!important;background:#fff!important;border:1px solid #bfdbfe!important;box-shadow:0 4px 14px rgba(37,99,235,.06)!important}
      .context-help>summary{padding:12px 13px!important;display:flex!important;align-items:center!important;gap:11px!important;color:#1f2937!important;list-style:none!important}
      .context-help>summary::after{display:none!important}
      .context-help>summary::-webkit-details-marker{display:none!important}
      .help-card-icon{flex:0 0 34px;width:34px;height:34px;border-radius:10px;background:#dbeafe;color:#1d4ed8;display:grid;place-items:center;font-size:18px;font-weight:900}
      .help-card-copy{min-width:0;flex:1}
      .help-card-title{font-size:14px;font-weight:900;color:#1e3a8a;line-height:1.35}
      .help-card-sub{font-size:12px;color:#64748b;font-weight:500;margin-top:2px;line-height:1.45}
      .help-card-action{flex:0 0 auto;color:#2563eb;font-size:12px;font-weight:900;white-space:nowrap;border:1px solid #bfdbfe;background:#eff6ff;border-radius:999px;padding:5px 9px}
      .context-help[open] .help-card-action{background:#2563eb;color:#fff;border-color:#2563eb}
      .context-help .help-detail{margin:0!important;padding:11px 13px 12px!important;border-top:1px solid #dbeafe!important;background:#f8fbff!important}
      @media(max-width:560px){.context-help>summary{align-items:flex-start!important}.help-card-action{margin-top:3px}.help-card-sub{max-width:220px}}
    `;
    document.head.appendChild(style);
  }

  function upgrade(details, type) {
    if (!details || details.dataset.helpVisibilityUpgraded === '1') return;
    const summary = details.querySelector(':scope > summary');
    if (!summary) return;
    details.dataset.helpVisibilityUpgraded = '1';
    const config = type === 'students'
      ? { title:'姓名可以直接點喔', sub:'預覽學生端，也可查看個人百分位趨勢' }
      : { title:'班級分析可以看什麼？', sub:'從全班原始成績進一步看相對位置與近期變化' };
    summary.innerHTML = `<span class="help-card-icon">ⓘ</span><span class="help-card-copy"><span class="help-card-title">${config.title}</span><span class="help-card-sub">${config.sub}</span></span><span class="help-card-action">查看說明 ▾</span>`;
    details.addEventListener('toggle', () => {
      const action = details.querySelector('.help-card-action');
      if (action) action.textContent = details.open ? '收合說明 ▴' : '查看說明 ▾';
    });
  }

  function install() {
    addStyles();
    upgrade(document.querySelector('[data-student-context-help]'), 'students');
    upgrade(document.querySelector('[data-overview-context-help]'), 'overview');
  }

  const observer = new MutationObserver(install);
  observer.observe(document.body, { childList:true, subtree:true });
  install();
})();
