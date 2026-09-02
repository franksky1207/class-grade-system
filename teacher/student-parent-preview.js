// Open the real parent/student UI in a new tab with teacher-generated preview data.
(function () {
  const PREVIEW_QUERY_CODE = 'preview';
  const PARENT_SESSION_KEY = 'class-grade-system-parent-session';
  const SUBJECT_ORDER_KEY = '家長端科目顯示順序';
  const DEFAULT_SUBJECT_ORDER = ['國文','英文','數學','地理','歷史','公民','物理','化學','地科','生物'];
  let observer = null;

  function text(v) { return String(v ?? '').trim(); }
  function current() {
    try { return typeof currentClass === 'function' ? currentClass() : null; }
    catch (_) { return null; }
  }

  function validScoreValue(v) {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function scoreForSeat(exam, seat) {
    const hit = (exam?.scores || []).find(s => String(s?.seat) === String(seat));
    return hit ? validScoreValue(hit.value) : null;
  }

  function buildRecords(c, student) {
    const rows = [];
    (c?.exams || []).forEach((exam, sourceIndex) => {
      const own = scoreForSeat(exam, student.seat);
      if (own === null) return;

      const classScores = (exam.scores || [])
        .map(s => validScoreValue(s?.value))
        .filter(v => v !== null);
      const participantCount = classScores.length;
      const classAverage = participantCount
        ? classScores.reduce((sum, v) => sum + v, 0) / participantCount
        : null;
      const rank = participantCount ? 1 + classScores.filter(v => v > own).length : null;
      const lower = participantCount ? classScores.filter(v => v < own).length : 0;
      const equal = participantCount ? classScores.filter(v => v === own).length : 0;
      const percentile = participantCount ? (lower + 0.5 * equal) / participantCount * 100 : null;
      const comparison = classAverage === null ? 'equal' : own > classAverage ? 'above' : own < classAverage ? 'below' : 'equal';

      rows.push({
        date: text(exam.date),
        subject: text(exam.subject),
        examName: text(exam.name),
        score: own,
        classAverage,
        rank,
        participantCount,
        percentile,
        comparison,
        _sourceIndex: sourceIndex
      });
    });

    rows.sort((a, b) => {
      const byDate = text(b.date).localeCompare(text(a.date));
      return byDate || a._sourceIndex - b._sourceIndex;
    });
    return rows.map(({ _sourceIndex, ...r }) => r);
  }

  async function readSubjectOrder(c) {
    const spreadsheetId = text(c?.spreadsheetId);
    if (!spreadsheetId || !window.GoogleAuth?.getAccessToken) return DEFAULT_SUBJECT_ORDER.slice();
    try {
      const token = await window.GoogleAuth.getAccessToken();
      const range = encodeURIComponent("'班級設定'!A:B");
      const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) return DEFAULT_SUBJECT_ORDER.slice();
      const data = await response.json();
      const rows = Array.isArray(data?.values) ? data.values : [];
      const hit = rows.find(r => text(r?.[0]) === SUBJECT_ORDER_KEY);
      if (!hit || !text(hit?.[1])) return DEFAULT_SUBJECT_ORDER.slice();
      const parsed = JSON.parse(text(hit[1]));
      return Array.isArray(parsed) && parsed.length ? parsed.map(text).filter(Boolean) : DEFAULT_SUBJECT_ORDER.slice();
    } catch (_) {
      return DEFAULT_SUBJECT_ORDER.slice();
    }
  }

  async function buildPreviewData(c, student) {
    return {
      ok: true,
      class: {
        name: text(c?.name),
        schoolYear: text(c?.year),
        term: text(c?.term)
      },
      student: {
        seat: text(student?.seat),
        name: text(student?.name),
        account: text(student?.account)
      },
      records: buildRecords(c, student),
      subjectOrder: await readSubjectOrder(c),
      teacherPreview: true
    };
  }

  function writeLoading(win, name) {
    try {
      win.document.open();
      win.document.write(`<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>教師預覽模式</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f7fb;color:#475569;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang TC","Noto Sans TC",sans-serif}.box{text-align:center}.title{font-size:22px;font-weight:900;color:#111827;margin-bottom:8px}</style></head><body><div class="box"><div class="title">教師預覽模式</div><div>正在開啟 ${String(name || '學生')} 的學生端……</div></div></body></html>`);
      win.document.close();
    } catch (_) {}
  }

  function installPreviewChrome(win) {
    const started = Date.now();
    const timer = setInterval(() => {
      try {
        if (win.closed) { clearInterval(timer); return; }
        const doc = win.document;
        const appView = doc.getElementById('appView');
        const logout = doc.getElementById('logoutBtn');
        const header = doc.querySelector('.app-header');
        if (!appView || appView.classList.contains('hidden') || !logout || !header) {
          if (Date.now() - started > 15000) clearInterval(timer);
          return;
        }

        if (!doc.getElementById('teacherPreviewBanner')) {
          const banner = doc.createElement('div');
          banner.id = 'teacherPreviewBanner';
          banner.textContent = '教師預覽模式';
          banner.style.cssText = 'background:#fff7ed;color:#9a3412;border-bottom:1px solid #fed7aa;text-align:center;font-size:13px;font-weight:900;padding:7px 12px;letter-spacing:.04em;';
          header.insertBefore(banner, header.firstChild);
        }

        logout.textContent = '關閉預覽';
        if (!logout.dataset.teacherPreviewBound) {
          logout.dataset.teacherPreviewBound = '1';
          logout.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            win.close();
          }, true);
        }
        clearInterval(timer);
      } catch (_) {
        if (Date.now() - started > 15000) clearInterval(timer);
      }
    }, 80);
  }

  async function openPreview(studentIndex) {
    const c = current();
    const student = c?.students?.[studentIndex];
    if (!c || !student) return;

    const win = window.open('about:blank', '_blank');
    if (!win) {
      if (typeof toast === 'function') toast('瀏覽器阻擋了新分頁，請允許此網站開啟彈出式視窗。');
      return;
    }
    writeLoading(win, student.name);

    try {
      const data = await buildPreviewData(c, student);
      const payload = JSON.stringify({ queryCode: PREVIEW_QUERY_CODE, data, savedAt: Date.now() });
      win.sessionStorage.setItem(PARENT_SESSION_KEY, payload);
      installPreviewChrome(win);
      win.location.replace(`${location.origin}/p/${PREVIEW_QUERY_CODE}`);
    } catch (err) {
      try {
        win.document.body.innerHTML = `<div style="font-family:system-ui;padding:30px;color:#b91c1c">無法開啟教師預覽：${text(err?.message || '請稍後再試')}</div>`;
      } catch (_) {}
    }
  }

  function decorateStudentNames() {
    const table = document.querySelector('#studentTable table');
    if (!table) return;
    table.querySelectorAll('tbody tr').forEach((row, index) => {
      const cell = row.children?.[1];
      if (!cell || cell.querySelector('[data-student-preview]')) return;
      const name = text(cell.textContent);
      cell.textContent = '';
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.studentPreview = String(index);
      button.textContent = name;
      button.title = '以學生角度預覽成績';
      button.style.cssText = 'border:0;background:transparent;color:#2563eb;font:inherit;font-weight:800;padding:0;cursor:pointer;text-decoration:underline;text-underline-offset:3px;';
      button.addEventListener('click', () => openPreview(index));
      cell.appendChild(button);
    });
  }

  function install() {
    const host = document.getElementById('studentTable');
    if (!host) return false;
    decorateStudentNames();
    if (!observer) {
      observer = new MutationObserver(decorateStudentNames);
      observer.observe(host, { childList: true, subtree: true });
    }
    return true;
  }

  document.addEventListener('click', event => {
    if (event.target?.closest?.('button[data-page="students"]')) setTimeout(install, 0);
  }, true);

  const started = Date.now();
  const wait = () => {
    if (install()) return;
    if (Date.now() - started < 30000) setTimeout(wait, 200);
  };
  wait();

  window.StudentParentPreview = { open: openPreview };
})();
