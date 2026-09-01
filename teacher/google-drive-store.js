// Google Drive / Sheets persistence helpers for the teacher site.
(function () {
  const INDEX_FILE_NAME = 'class-grade-system-index';
  const INDEX_SHEET_NAME = '班級索引';
  const INDEX_HEADERS = ['班級名稱','學年度','學期','Spreadsheet ID','archived','建立時間','更新時間'];
  const CLASS_SHEETS = ['班級設定','學生資料','考試資料','成績資料'];
  const DRIVE_API = 'https://www.googleapis.com/drive/v3';
  const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

  async function authFetch(url, options = {}) {
    const token = await window.GoogleAuth.getAccessToken();
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      let detail = '';
      try { detail = (await response.json())?.error?.message || ''; } catch (_) {}
      throw new Error(detail || `Google API 發生錯誤（${response.status}）`);
    }
    return response;
  }

  async function findIndexSpreadsheet() {
    const q = [
      "trashed = false",
      "mimeType = 'application/vnd.google-apps.spreadsheet'",
      "appProperties has { key='classGradeSystemType' and value='class-index' }"
    ].join(' and ');
    const params = new URLSearchParams({ q, spaces:'drive', fields:'files(id,name,createdTime,modifiedTime,appProperties)', pageSize:'10' });
    const data = await (await authFetch(`${DRIVE_API}/files?${params}`)).json();
    const files = Array.isArray(data.files) ? data.files : [];
    files.sort((a,b)=>String(a.createdTime||'').localeCompare(String(b.createdTime||'')));
    return files[0] || null;
  }

  async function writeRange(fileId, range, values) {
    const encoded = encodeURIComponent(range);
    await authFetch(`${SHEETS_API}/${encodeURIComponent(fileId)}/values/${encoded}?valueInputOption=RAW`, {
      method:'PUT',
      body:JSON.stringify({ range, majorDimension:'ROWS', values })
    });
  }

  async function ensureIndexSchema(fileId) {
    const meta = await (await authFetch(`${SHEETS_API}/${encodeURIComponent(fileId)}?fields=sheets.properties`)).json();
    const sheets = Array.isArray(meta?.sheets) ? meta.sheets : [];
    if (!sheets.length) throw new Error('索引試算表存在，但沒有可用的工作表。');
    let target = sheets.find(s=>s?.properties?.title===INDEX_SHEET_NAME)?.properties || null;
    if (!target) {
      const first = sheets[0]?.properties;
      await authFetch(`${SHEETS_API}/${encodeURIComponent(fileId)}:batchUpdate`, {
        method:'POST',
        body:JSON.stringify({ requests:[{ updateSheetProperties:{ properties:{ sheetId:first.sheetId, title:INDEX_SHEET_NAME, gridProperties:{ frozenRowCount:1 } }, fields:'title,gridProperties.frozenRowCount' } }] })
      });
    }
    await writeRange(fileId, `'${INDEX_SHEET_NAME}'!A1:G1`, [INDEX_HEADERS]);
  }

  async function createIndexSpreadsheet() {
    const file = await (await authFetch(`${DRIVE_API}/files?fields=id,name,createdTime,modifiedTime,appProperties`, {
      method:'POST',
      body:JSON.stringify({ name:INDEX_FILE_NAME, mimeType:'application/vnd.google-apps.spreadsheet', appProperties:{ classGradeSystemType:'class-index', schemaVersion:'1' } })
    })).json();
    await ensureIndexSchema(file.id);
    return { ...file, createdNow:true };
  }

  async function ensureTeacherIndex() {
    if (!window.GoogleAuth?.isSignedIn()) throw new Error('尚未完成 Google 登入。');
    let file = await findIndexSpreadsheet();
    if (!file) file = await createIndexSpreadsheet(); else await ensureIndexSchema(file.id);
    const result = { id:file.id, name:file.name||INDEX_FILE_NAME, createdNow:!!file.createdNow, url:`https://docs.google.com/spreadsheets/d/${file.id}/edit` };
    window.classGradeSystemIndex = result;
    return result;
  }

  async function readIndexRows(indexId) {
    const range = encodeURIComponent(`'${INDEX_SHEET_NAME}'!A2:G`);
    const response = await authFetch(`${SHEETS_API}/${encodeURIComponent(indexId)}/values/${range}`);
    const data = await response.json();
    return Array.isArray(data.values) ? data.values : [];
  }

  async function appendIndexRow(indexId, c, spreadsheetId) {
    const range = encodeURIComponent(`'${INDEX_SHEET_NAME}'!A:G`);
    const now = new Date().toISOString();
    await authFetch(`${SHEETS_API}/${encodeURIComponent(indexId)}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method:'POST',
      body:JSON.stringify({ values:[[c.name,c.year,String(c.term),spreadsheetId,String(!!c.archived),now,now]] })
    });
  }

  async function createClassSpreadsheet(c) {
    const title = `${c.name}-${c.year}-${c.term}`;
    const payload = {
      properties:{ title },
      sheets:CLASS_SHEETS.map(name=>({ properties:{ title:name, gridProperties:{ frozenRowCount:1 } } }))
    };
    const file = await (await authFetch(SHEETS_API, { method:'POST', body:JSON.stringify(payload) })).json();
    const id = file.spreadsheetId;
    if (!id) throw new Error('班級試算表建立失敗。');

    await authFetch(`${DRIVE_API}/files/${encodeURIComponent(id)}?fields=id,appProperties`, {
      method:'PATCH',
      body:JSON.stringify({ appProperties:{ classGradeSystemType:'class-data', schemaVersion:'1', className:String(c.name||''), schoolYear:String(c.year||''), term:String(c.term||'') } })
    });

    const classSettingRows = [
      ['欄位','內容'],
      ['班級名稱',String(c.name||'')],
      ['學年度',String(c.year||'')],
      ['學期',String(c.term||'')],
      ['archived',String(!!c.archived)]
    ];
    const studentRows = [['座號','姓名','學號','身分證後4碼'], ...(c.students||[]).map(s=>[String(s.seat||''),String(s.name||''),String(s.account||''),String(s.pass||'')])];
    const examRows = [['日期','科目','考試名稱'], ...(c.exams||[]).map(e=>[String(e.date||''),String(e.subject||''),String(e.name||'')])];
    const gradeRows = [['日期','科目','考試名稱','座號','姓名','成績']];
    (c.exams||[]).forEach(e=>(e.scores||[]).forEach(s=>gradeRows.push([String(e.date||''),String(e.subject||''),String(e.name||''),String(s.seat||''),String(s.name||''),String(s.value??'')])));

    await authFetch(`${SHEETS_API}/${encodeURIComponent(id)}/values:batchUpdate`, {
      method:'POST',
      body:JSON.stringify({ valueInputOption:'RAW', data:[
        { range:`'班級設定'!A1:B${classSettingRows.length}`, values:classSettingRows },
        { range:`'學生資料'!A1:D${studentRows.length}`, values:studentRows },
        { range:`'考試資料'!A1:C${examRows.length}`, values:examRows },
        { range:`'成績資料'!A1:F${gradeRows.length}`, values:gradeRows }
      ] })
    });
    return id;
  }

  async function ensureLocalClasses(classes) {
    const index = window.classGradeSystemIndex || await ensureTeacherIndex();
    const rows = await readIndexRows(index.id);
    let changed = false;

    for (const c of (classes || [])) {
      if (c.spreadsheetId) continue;
      const hit = rows.find(r=>String(r[0]||'').trim()===String(c.name||'').trim() && String(r[1]||'').trim()===String(c.year||'').trim() && String(r[2]||'').trim()===String(c.term||'').trim());
      if (hit?.[3]) {
        c.spreadsheetId = hit[3];
        changed = true;
        continue;
      }
      const spreadsheetId = await createClassSpreadsheet(c);
      await appendIndexRow(index.id, c, spreadsheetId);
      c.spreadsheetId = spreadsheetId;
      rows.push([c.name,c.year,String(c.term),spreadsheetId,String(!!c.archived)]);
      changed = true;
    }
    return { changed };
  }

  window.GoogleDriveStore = {
    ensureTeacherIndex,
    ensureLocalClasses,
    createClassSpreadsheet,
    indexFileName:INDEX_FILE_NAME,
    indexSheetName:INDEX_SHEET_NAME
  };
})();
