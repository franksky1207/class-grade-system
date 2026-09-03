// Parent/student subject percentile insights. Read-only; never writes grade data.
(function () {
  const SESSION_KEY = 'class-grade-system-parent-session';
  let rangeMode = '5';
  let customN = 8;
  let observer = null;
  let resizeTimer = 0;

  const text = v => String(v ?? '').trim();
  const number = v => Number.isFinite(Number(v)) ? Number(v) : null;
  const esc = v => text(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = (v, d = 1) => Number.isFinite(Number(v)) ? Number(v).toFixed(d) : '—';

  function readData() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw)?.data || null : null;
    } catch (_) { return null; }
  }

  function addStyles() {
    if (document.getElementById('subjectInsightStyles')) return;
    const style = document.createElement('style');
    style.id = 'subjectInsightStyles';
    style.textContent = `
      .insights-wrap{margin-top:22px}.insight-heading{display:flex;align-items:center;gap:8px;font-size:17px;font-weight:900;margin:0 0 10px}.insight-info-dot{width:19px;height:19px;border-radius:50%;display:inline-grid;place-items:center;border:1px solid #bfdbfe;background:#eff6ff;color:#2563eb;font-size:12px;font-weight:900}
      .insight-summary{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px}.insight-card{border:1px solid var(--line);border-radius:18px;padding:15px;background:#fff;box-shadow:0 6px 20px rgba(15,23,42,.045);text-align:center}.insight-card.position{background:linear-gradient(180deg,#eff6ff,#fff);border-color:#bfdbfe}.insight-card.change{background:linear-gradient(180deg,#ecfdf5,#fff);border-color:#bbf7d0}.insight-card-label{font-size:12px;font-weight:850;color:#64748b}.insight-card-value{font-size:25px;font-weight:950;margin-top:6px}.insight-card.position .insight-card-value{color:#1d4ed8}.insight-card.change .insight-card-value{color:#047857}.insight-card-note{font-size:12px;color:#64748b;margin-top:5px;line-height:1.45}
      .trend-card{background:#fff;border:1px solid var(--line);border-radius:20px;padding:15px;box-shadow:0 7px 22px rgba(15,23,42,.05)}.trend-range{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:10px}.trend-range button{border:1px solid #d8dee8;background:#fff;color:#475569;border-radius:10px;padding:8px 10px;font-size:13px;font-weight:850}.trend-range button.active{background:var(--primary);color:#fff;border-color:var(--primary)}.trend-custom{display:none;align-items:center;gap:7px;margin:0 0 10px;font-size:13px;color:#475569}.trend-custom.show{display:flex}.trend-custom input{width:76px;margin:0;padding:8px 9px;font-size:14px;border-radius:9px}.trend-custom button{border:1px solid #93c5fd;background:#eff6ff;color:#1d4ed8;border-radius:9px;padding:8px 10px;font-weight:850}.trend-chart{height:300px;position:relative;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;scrollbar-width:thin}.trend-chart svg{height:100%;display:block;touch-action:pan-x pan-y}.trend-axis{font-size:10px;fill:#64748b}.trend-grid{stroke:#e5e7eb;stroke-width:1}.trend-line{fill:none;stroke:#2563eb;stroke-width:2.7;stroke-linecap:round;stroke-linejoin:round}.trend-dot{fill:#fff;stroke:#2563eb;stroke-width:2.5}.trend-hit{fill:transparent;cursor:pointer}.trend-empty{height:100%;display:grid;place-items:center;color:#64748b;font-size:13px;font-weight:800;text-align:center;padding:18px}
      .insight-tip{position:fixed;z-index:1000;display:none;max-width:min(330px,calc(100vw - 24px));background:#111827;color:#fff;border-radius:12px;padding:11px 12px;font-size:13px;line-height:1.55;box-shadow:0 14px 36px rgba(15,23,42,.28);pointer-events:none}.insight-tip.show{display:block}.insight-tip b{font-size:14px}
      .percentile-help{margin-top:12px;border:1px solid #bfdbfe;background:#eff6ff;border-radius:15px;overflow:hidden}.percentile-help summary{cursor:pointer;list-style:none;padding:12px 13px;color:#1d4ed8}.percentile-help summary::-webkit-details-marker{display:none}.percentile-help-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.percentile-help-title{font-weight:900}.percentile-help-sub{font-size:12px;color:#475569;margin-top:3px}.percentile-help-action{font-size:12px;font-weight:900;white-space:nowrap}.percentile-help-body{border-top:1px solid #bfdbfe;background:#f8fbff;padding:12px 13px;font-size:13px;color:#475569;line-height:1.75}.percentile-help-body p{margin:5px 0}.insight-disclaimer{margin-top:10px;background:#fffaf0;border:1px solid #fde68a;border-radius:13px;padding:10px 12px;font-size:12px;color:#6b5b24;line-height:1.6}
      @media(min-width:768px){.insights-wrap{margin-top:26px}.insight-heading{font-size:19px}.insight-summary{grid-template-columns:repeat(2,minmax(0,300px));gap:14px}.insight-card{padding:18px}.insight-card-value{font-size:29px}.trend-card{padding:18px}.trend-chart{height:380px}.trend-range button{font-size:14px;padding:9px 12px}}
    `;
    document.head.appendChild(style);
    if (!document.getElementById('subjectInsightTip')) {
      const tip = document.createElement('div');
      tip.id = 'subjectInsightTip';
      tip.className = 'insight-tip';
      document.body.appendChild(tip);
    }
  }

  function dateMs(v) {
    const m = text(v).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    return m ? new Date(+m[1], +m[2]-1, +m[3], 12).getTime() : NaN;
  }
  function shortDate(v) {
    const m = text(v).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    return m ? `${+m[2]}/${+m[3]}` : text(v);
  }
  function fullDate(v) {
    const m = text(v).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    return m ? `${m[1]}/${String(m[2]).padStart(2,'0')}/${String(m[3]).padStart(2,'0')}` : text(v);
  }

  function rangeRecords(all) {
    if (rangeMode === 'all') return all.slice();
    const n = rangeMode === 'custom' ? Math.max(1, customN) : Number(rangeMode || 5);
    return all.slice(0, n);
  }

  function regressionTotal(points) {
    const n = points.length;
    if (n < 2) return 0;
    const xm = (n - 1) / 2;
    const ym = points.reduce((s,p) => s + p.percentile, 0) / n;
    let num = 0, den = 0;
    points.forEach((p,i) => { num += (i-xm) * (p.percentile-ym); den += (i-xm) * (i-xm); });
    return den ? (num / den) * (n - 1) : 0;
  }
  function meanAbsStep(points) {
    if (points.length < 2) return 0;
    let sum = 0;
    for (let i=1;i<points.length;i++) sum += Math.abs(points[i].percentile - points[i-1].percentile);
    return sum / (points.length - 1);
  }
  function classify(points) {
    if (!points.length) return { position:'—', change:'—', avg:null };
    const avg = points.reduce((s,p) => s + p.percentile, 0) / points.length;
    const position = avg >= 70 ? '高位' : avg < 30 ? '低位' : '中位';
    const trend = regressionTotal(points), swing = meanAbsStep(points);
    let change = '穩定';
    if (trend >= 12) change = '上升';
    else if (trend <= -12) change = '下降';
    else if (swing >= 15) change = '波動較大';
    return { position, change, avg };
  }

  function svgEl(tag, attrs={}) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k, v));
    return el;
  }
  function showTip(p, e) {
    const tip = document.getElementById('subjectInsightTip');
    if (!tip) return;
    tip.innerHTML = `<b>${esc(fullDate(p.date))}｜${esc(p.subject)}</b><br>${esc(p.examName || '—')}<br>原始分數：${esc(p.score)}<br>班平均：${fmt(p.classAverage,2)}<br>班級百分位：${fmt(p.percentile,1)}<br>名次：${p.rank ?? '—'} / ${p.participantCount ?? 0}`;
    tip.classList.add('show');
    const pad=10,w=tip.offsetWidth,h=tip.offsetHeight;
    let x=(e?.clientX??innerWidth/2)+12,y=(e?.clientY??80)+12;
    if(x+w>innerWidth-pad)x=innerWidth-w-pad;
    if(y+h>innerHeight-pad)y=(e?.clientY??80)-h-12;
    if(y<pad)y=pad;
    tip.style.left=`${x}px`;tip.style.top=`${y}px`;
  }
  function hideTip(){ document.getElementById('subjectInsightTip')?.classList.remove('show'); }

  function drawChart(host, records) {
    host.innerHTML = '';
    const points = records.map((r,i) => ({...r, percentile:number(r.percentile), _i:i})).filter(p => p.percentile !== null).reverse();
    if (!points.length) {
      host.innerHTML = '<div class="trend-empty">這批資料尚未包含百分位。<br>家長請重新登入；教師預覽請重新開啟。</div>';
      return;
    }
    const viewportW=Math.max(320,host.clientWidth||320),H=Math.max(280,host.clientHeight||300),m={l:42,r:14,t:14,b:42};
    const minStep=innerWidth<768?34:40;
    const W=Math.max(viewportW,m.l+m.r+Math.max(1,points.length-1)*minStep);
    const iw=W-m.l-m.r,ih=H-m.t-m.b;
    points.forEach((p,i)=>{p.xIndex=i;});
    const svg=svgEl('svg',{viewBox:`0 0 ${W} ${H}`,width:W,height:H,role:'img','aria-label':'班級百分位趨勢'}); host.appendChild(svg);
    const sx=i=>points.length===1?m.l+iw/2:m.l+i/(points.length-1)*iw, sy=y=>m.t+(100-y)/100*ih;
    [0,25,50,75,100].forEach(v=>{const y=sy(v);svg.appendChild(svgEl('line',{x1:m.l,x2:W-m.r,y1:y,y2:y,class:'trend-grid'}));const t=svgEl('text',{x:m.l-6,y:y+4,'text-anchor':'end',class:'trend-axis'});t.textContent=`${v}%`;svg.appendChild(t);});
    const labelGap=innerWidth<768?68:76,maxLabels=Math.max(2,Math.floor(iw/labelGap)+1),step=Math.max(1,Math.ceil(points.length/maxLabels));let tickIndexes=points.map((_,i)=>i).filter(i=>i%step===0);if(tickIndexes[tickIndexes.length-1]!==points.length-1)tickIndexes.push(points.length-1);
    tickIndexes.forEach(i=>{const p=points[i],t=svgEl('text',{x:sx(i),y:H-14,'text-anchor':'middle',class:'trend-axis'});t.textContent=shortDate(p.date);svg.appendChild(t);});
    svg.appendChild(svgEl('polyline',{points:points.map((p,i)=>`${sx(i)},${sy(p.percentile)}`).join(' '),class:'trend-line'}));
    points.forEach((p,i)=>{const x=sx(i),y=sy(p.percentile);const d=svgEl('circle',{cx:x,cy:y,r:4.7,class:'trend-dot'}),hit=svgEl('circle',{cx:x,cy:y,r:15,class:'trend-hit'});const handler=e=>showTip(p,e);hit.addEventListener('mouseenter',handler);hit.addEventListener('mousemove',handler);hit.addEventListener('mouseleave',()=>{if(!matchMedia('(pointer:coarse)').matches)hideTip();});hit.addEventListener('click',e=>{e.preventDefault();handler(e);});svg.appendChild(d);svg.appendChild(hit);});
  }

  function renderInsightBody(root, selectedSubject, records) {
    const chosen = rangeRecords(records);
    const chronological = chosen.map(r=>({...r,percentile:number(r.percentile)})).filter(r=>r.percentile!==null).reverse();
    const cls = classify(chronological);
    const rangeLabel = rangeMode==='all' ? '全部有效成績' : rangeMode==='custom' ? `最近 ${chosen.length} 次` : `最近 ${chosen.length} 次`;
    root.innerHTML = `
      <div class="insight-heading">近期相對位置與變化 <span class="insight-info-dot">i</span></div>
      <div class="insight-summary">
        <div class="insight-card position"><div class="insight-card-label">近期相對位置</div><div class="insight-card-value">${esc(cls.position)}</div><div class="insight-card-note">平均百分位 ${cls.avg===null?'—':fmt(cls.avg,1)}%</div></div>
        <div class="insight-card change"><div class="insight-card-label">近期變化</div><div class="insight-card-value">${esc(cls.change)}</div><div class="insight-card-note">${esc(rangeLabel)}</div></div>
      </div>
      <div class="insight-heading">班級百分位趨勢 <span class="insight-info-dot">i</span></div>
      <div class="trend-card">
        <div class="trend-range">
          ${['5','10','15'].map(n=>`<button type="button" data-insight-range="${n}" class="${rangeMode===n?'active':''}">近${n}次</button>`).join('')}
          <button type="button" data-insight-range="custom" class="${rangeMode==='custom'?'active':''}">自訂</button>
          <button type="button" data-insight-range="all" class="${rangeMode==='all'?'active':''}">全部</button>
        </div>
        <div class="trend-custom ${rangeMode==='custom'?'show':''}"><span>最近</span><input id="insightCustomN" type="number" min="1" step="1" inputmode="numeric" value="${customN}"><span>次</span><button id="insightCustomApply" type="button">套用</button></div>
        <div id="subjectPercentileChart" class="trend-chart"></div>
      </div>
      <details class="percentile-help">
        <summary><div class="percentile-help-head"><div><div class="percentile-help-title">ⓘ 班級百分位怎麼看？</div><div class="percentile-help-sub">百分位越高，代表這次考試在班級中的相對位置越前。</div></div><div class="percentile-help-action">查看詳細說明 ▾</div></div></summary>
        <div class="percentile-help-body">
          <p><b>班級百分位：</b>每次考試依當次實際有成績的學生計算；空白不計，0 分有效。</p>
          <p>計算採 midrank：〔低於該生成績的人數＋0.5×同分人數〕÷實際應試人數×100，因此最高分也不一定剛好是 100。</p>
          <p><b>近期相對位置：</b>依目前趨勢範圍內的平均百分位判定，高位 ≥70、中位 30～未滿70、低位 &lt;30。</p>
          <p><b>近期變化：</b>依所選範圍內百分位的整體趨勢與相鄰考試起伏判定為上升、下降、波動較大或穩定。</p>
          <p>桌機可滑過、手機可點擊圖上節點，查看該次考試的分數、班平均、百分位、名次與應試人數。</p>
        </div>
      </details>
      <div class="insight-disclaimer">此分類依近期班級百分位計算，只代表目前的班級相對位置與變化，不代表學生的長期能力或固定程度。</div>`;

    root.querySelectorAll('[data-insight-range]').forEach(btn=>btn.addEventListener('click',()=>{rangeMode=btn.dataset.insightRange||'5';renderInsightBody(root,selectedSubject,records);}));
    root.querySelector('#insightCustomApply')?.addEventListener('click',()=>{const n=Math.max(1,Math.floor(Number(root.querySelector('#insightCustomN')?.value)||1));customN=n;renderInsightBody(root,selectedSubject,records);});
    drawChart(root.querySelector('#subjectPercentileChart'), chosen);
  }

  function decorate() {
    addStyles();
    const content = document.getElementById('subjectContent');
    const select = document.getElementById('subjectSelect');
    if (!content || !select || content.querySelector('[data-subject-insights]')) return;
    const data = readData();
    const records = Array.isArray(data?.records) ? data.records.filter(r=>text(r.subject)===text(select.value)) : [];
    if (!records.length) return;
    const root = document.createElement('section');
    root.className = 'insights-wrap';
    root.dataset.subjectInsights = '1';
    content.appendChild(root);
    renderInsightBody(root, text(select.value), records);
  }

  function scheduleDecorate(){ setTimeout(decorate,0); }
  document.addEventListener('click', e=>{ if(e.target?.closest?.('[data-page="subjects"]') || e.target?.closest?.('[data-subject-limit]')) scheduleDecorate(); }, true);
  document.addEventListener('change', e=>{ if(e.target?.id==='subjectSelect') scheduleDecorate(); }, true);
  document.addEventListener('click', e=>{ if(!e.target.closest?.('.trend-hit')&&!e.target.closest?.('.insight-tip')) hideTip(); });
  observer = new MutationObserver(()=>scheduleDecorate());
  observer.observe(document.body,{childList:true,subtree:true});
  addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{const root=document.querySelector('[data-subject-insights]');const select=document.getElementById('subjectSelect');const data=readData();if(root&&select&&data){const records=(data.records||[]).filter(r=>text(r.subject)===text(select.value));renderInsightBody(root,text(select.value),records);}},140);});
  addStyles();
  scheduleDecorate();
})();

(function loadParentUsageGuide(){
  if (document.querySelector('script[data-parent-usage-guide]')) return;
  const script = document.createElement('script');
  script.src = '/parent/usage-guide.js?v=1';
  script.async = false;
  script.dataset.parentUsageGuide = '1';
  document.head.appendChild(script);
})();
