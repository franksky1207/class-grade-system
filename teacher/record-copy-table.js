// Open selected exam scores from 考試紀錄 in a clean browser tab for manual copy/paste into Excel.
(function () {
  const selected = new Set();
  let observer = null;

  function text(v) { return String(v ?? '').trim(); }
  function esc(v) {
    return String(v ?? '').replace(/[&<>'"]/g, ch => ({
      '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
    }[ch]));
  }

  function current() {
    try { return typeof currentClass === 'function' ? currentClass() : null; }
    catch (_) { return null; }
  }

  function splitExamName(name) {
    const raw = text(name);
    if (!raw) return ['', ''];
    const match = raw.match(/^(.*?)\s*[｜|]\s*(.*)$/);
    if (!match) return [raw, ''];
    return [text(match[1]), text(match[2])];
  }

  function ensureTools() {
    const records = document.getElementById('records');
    const list = document.getElementById('recordList');
    if (!records || !list) return;

    let tools = document.getElementById('recordCopyTools');
    if (!tools) {
      tools = document.createElement('div');
      tools.id = 'recordCopyTools';
      tools.className = 'actions';
      tools.style.marginTop = '12px';
      tools.innerHTML = '<button class="btn primary" id="openRecordCopyTable" type="button" disabled>開啟成績複製表</button><span class="small" id="recordCopyCount">尚未選擇考試</span>';
      list.parentElement?.insertBefore(tools, list);
      document.getElementById('openRecordCopyTable')?.addEventListener('click', openCopyTable);
    }
    updateTools();
  }

  function updateTools() {
    const c = current();
    if (c) {
      for (const i of Array.from(selected)) {
        if (!Number.isInteger(i) || !c.exams?.[i]) selected.delete(i);
      }
    }
    const btn = document.getElementById('openRecordCopyTable');
    const count = document.getElementById('recordCopyCount');
    if (btn) btn.disabled = selected.size === 0;
    if (count) count.textContent = selected.size ? `已選擇 ${selected.size} 場考試` : '尚未選擇考試';
  }

  function decorateRows() {
    ensureTools();
    const list = document.getElementById('recordList');
    if (!list) return;
    list.querySelectorAll('.manage-row').forEach(row => {
      if (row.querySelector('.record-copy-check')) return;
      const view = row.querySelector('[data-view]');
      if (!view) return;
      const index = Number(view.dataset.view);
      if (!Number.isInteger(index)) return;

      const holder = document.createElement('label');
      holder.className = 'record-copy-check';
      holder.style.display = 'inline-flex';
      holder.style.alignItems = 'center';
      holder.style.gap = '6px';
      holder.style.marginRight = '8px';
      holder.style.fontWeight = '700';
      holder.style.whiteSpace = 'nowrap';
      holder.innerHTML = `<input type="checkbox" data-copy-exam="${index}" ${selected.has(index) ? 'checked' : ''}> 選取`;

      const actions = row.querySelector('.actions');
      if (actions) actions.insertBefore(holder, actions.firstChild);
      else row.appendChild(holder);

      holder.querySelector('input')?.addEventListener('change', e => {
        if (e.target.checked) selected.add(index);
        else selected.delete(index);
        updateTools();
      });
    });
  }

  function openCopyTable() {
    const c = current();
    if (!c || !selected.size) return;

    const exams = Array.from(selected)
      .sort((a, b) => a - b)
      .map(i => c.exams?.[i])
      .filter(Boolean);
    if (!exams.length) return;

    // Open synchronously from the click event so browsers do not treat it as a popup.
    const win = window.open('', '_blank');
    if (!win) {
      if (typeof toast === 'function') toast('瀏覽器阻擋了新分頁，請允許此網站開啟彈出式視窗。');
      return;
    }

    const students = Array.isArray(c.students) ? c.students : [];
    const row1 = `<tr><th>座號</th><th>姓名</th>${exams.map(e => `<th>${esc(e.subject)}</th>`).join('')}</tr>`;
    const names = exams.map(e => splitExamName(e.name));
    const row2 = `<tr><td></td><td></td>${names.map(parts => `<td>${esc(parts[0])}</td>`).join('')}</tr>`;
    const row3 = `<tr><td></td><td></td>${names.map(parts => `<td>${esc(parts[1])}</td>`).join('')}</tr>`;
    const body = students.map(st => {
      const cells = exams.map(e => {
        const score = (e.scores || []).find(s => String(s.seat) === String(st.seat));
        const value = score && String(score.value ?? '').trim() !== '' ? String(score.value) : '';
        return `<td>${esc(value)}</td>`;
      }).join('');
      return `<tr><td>${esc(st.seat)}</td><td>${esc(st.name)}</td>${cells}</tr>`;
    }).join('');

    const classLabel = [text(c.name), text(c.year) ? `${text(c.year)}學年度` : '', text(c.term) ? `第${text(c.term)}學期` : ''].filter(Boolean).join('｜');
    win.document.open();
    win.document.write(`<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>成績複製表</title><style>
      *{box-sizing:border-box}body{margin:0;padding:24px;background:#f5f7fb;color:#111827;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang TC","Noto Sans TC",sans-serif}.wrap{max-width:max-content;margin:auto}.head{margin-bottom:14px}.title{font-size:22px;font-weight:900}.sub{font-size:13px;color:#6b7280;margin-top:4px}.note{font-size:13px;color:#475569;margin:0 0 12px}.tablewrap{overflow:auto;background:#fff;border:1px solid #d1d5db;border-radius:10px;box-shadow:0 6px 20px rgba(15,23,42,.06)}table{border-collapse:collapse;background:#fff}th,td{border:1px solid #9ca3af;padding:7px 10px;min-width:88px;text-align:center;white-space:nowrap}th:nth-child(1),td:nth-child(1){min-width:62px}th:nth-child(2),td:nth-child(2){min-width:100px}th{background:#f3f4f6;font-weight:800}tr:nth-child(2) td,tr:nth-child(3) td{font-weight:700;background:#fafafa}@media(max-width:700px){body{padding:12px}th,td{padding:6px 8px}}
    </style></head><body><div class="wrap"><div class="head"><div class="title">成績複製表</div><div class="sub">${esc(classLabel)}</div></div><div class="note">可直接用滑鼠選取需要的成績區塊，再複製貼到 Excel。</div><div class="tablewrap"><table><tbody>${row1}${row2}${row3}${body}</tbody></table></div></div></body></html>`);
    win.document.close();
  }

  function install() {
    const list = document.getElementById('recordList');
    if (!list) return false;
    ensureTools();
    decorateRows();
    if (!observer) {
      observer = new MutationObserver(() => decorateRows());
      observer.observe(list, { childList: true, subtree: true });
    }
    return true;
  }

  document.addEventListener('click', event => {
    if (event.target?.closest?.('button[data-page="records"]')) setTimeout(install, 0);
  }, true);

  const started = Date.now();
  const wait = () => {
    if (install()) return;
    if (Date.now() - started < 30000) setTimeout(wait, 200);
  };
  wait();

  window.RecordCopyTable = { open: openCopyTable };
})();
