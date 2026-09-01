// Google Drive / Sheets lifecycle actions for teacher classes.
(function () {
  const DRIVE_API = 'https://www.googleapis.com/drive/v3';
  const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
  const INDEX_SHEET_NAME = '班級索引';

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

  async function getIndexInfo() {
    if (window.classGradeSystemIndex?.id) return window.classGradeSystemIndex;
    if (!window.GoogleDriveStore?.ensureTeacherIndex) throw new Error('Google Drive 資料模組尚未載入。');
    return window.GoogleDriveStore.ensureTeacherIndex();
  }

  async function readIndexRows(indexId) {
    if (window.GoogleDriveStore?.readIndexRows) return window.GoogleDriveStore.readIndexRows(indexId);
    const range = encodeURIComponent(`'${INDEX_SHEET_NAME}'!A2:G`);
    const res = await authFetch(`${SHEETS_API}/${encodeURIComponent(indexId)}/values/${range}`);
    const data = await res.json();
    return Array.isArray(data.values) ? data.values : [];
  }

  async function rewriteIndexRows(indexId, rows) {
    const clearRange = encodeURIComponent(`'${INDEX_SHEET_NAME}'!A2:G`);
    await authFetch(`${SHEETS_API}/${encodeURIComponent(indexId)}/values/${clearRange}:clear`, {
      method: 'POST', body: '{}'
    });
    if (!rows.length) return;
    const range = encodeURIComponent(`'${INDEX_SHEET_NAME}'!A2:G${rows.length + 1}`);
    await authFetch(`${SHEETS_API}/${encodeURIComponent(indexId)}/values/${range}?valueInputOption=RAW`, {
      method: 'PUT', body: JSON.stringify({ majorDimension: 'ROWS', values: rows })
    });
  }

  async function setTrashed(spreadsheetId, trashed) {
    await authFetch(`${DRIVE_API}/files/${encodeURIComponent(spreadsheetId)}?fields=id,trashed`, {
      method: 'PATCH', body: JSON.stringify({ trashed: !!trashed })
    });
  }

  async function createClass(c) {
    if (!c) throw new Error('找不到要建立的班級。');
    if (!window.GoogleDriveStore?.ensureLocalClasses) throw new Error('Google Drive 資料模組尚未載入。');
    await window.GoogleDriveStore.ensureLocalClasses([c]);
    if (!c.spreadsheetId) throw new Error('班級 Google 試算表建立失敗。');
    return { spreadsheetId: c.spreadsheetId };
  }

  async function writeClassSettings(c, archived) {
    const id = String(c?.spreadsheetId || '').trim();
    if (!id) throw new Error('這個班級缺少 Google Spreadsheet ID。');
    const rows = [
      ['欄位','內容'],
      ['班級名稱',String(c.name || '')],
      ['學年度',String(c.year || '')],
      ['學期',String(c.term || '')],
      ['archived',String(!!archived)]
    ];
    const range = encodeURIComponent("'班級設定'!A1:B5");
    await authFetch(`${SHEETS_API}/${encodeURIComponent(id)}/values/${range}?valueInputOption=RAW`, {
      method: 'PUT', body: JSON.stringify({ majorDimension:'ROWS', values:rows })
    });
  }

  async function updateIndexArchived(c, archived) {
    const id = String(c?.spreadsheetId || '').trim();
    if (!id) throw new Error('這個班級缺少 Google Spreadsheet ID。');
    const index = await getIndexInfo();
    const rows = await readIndexRows(index.id);
    const at = rows.findIndex(r => String(r?.[3] || '').trim() === id);
    if (at < 0) throw new Error('班級索引找不到這個班級。');
    const row = [...rows[at]];
    while (row.length < 7) row.push('');
    row[4] = String(!!archived);
    row[6] = new Date().toISOString();
    rows[at] = row;
    await rewriteIndexRows(index.id, rows);
  }

  async function setArchived(c, archived) {
    if (!c) throw new Error('找不到班級。');
    const previousArchived = !archived;
    await writeClassSettings(c, archived);
    try {
      await updateIndexArchived(c, archived);
    } catch (err) {
      try { await writeClassSettings(c, previousArchived); } catch (_) {}
      throw err;
    }
    return { archived: !!archived };
  }

  async function touchClassUpdatedAt(c) {
    const id = String(c?.spreadsheetId || '').trim();
    if (!id) return { updated:false };
    const index = await getIndexInfo();
    const rows = await readIndexRows(index.id);
    const at = rows.findIndex(r => String(r?.[3] || '').trim() === id);
    if (at < 0) return { updated:false };
    const rowNumber = at + 2;
    const range = encodeURIComponent(`'${INDEX_SHEET_NAME}'!G${rowNumber}`);
    await authFetch(`${SHEETS_API}/${encodeURIComponent(index.id)}/values/${range}?valueInputOption=RAW`, {
      method:'PUT', body:JSON.stringify({ majorDimension:'ROWS', values:[[new Date().toISOString()]] })
    });
    return { updated:true };
  }

  async function permanentDeleteClass(c) {
    if (!c) throw new Error('找不到要刪除的班級。');
    const spreadsheetId = String(c.spreadsheetId || '').trim();
    if (!spreadsheetId) throw new Error('這個班級缺少 Google Spreadsheet ID，無法安全永久刪除。');

    const index = await getIndexInfo();
    const rows = await readIndexRows(index.id);
    const kept = rows.filter(r => String(r?.[3] || '').trim() !== spreadsheetId);

    await setTrashed(spreadsheetId, true);
    try {
      await rewriteIndexRows(index.id, kept);
    } catch (err) {
      try { await setTrashed(spreadsheetId, false); } catch (_) {}
      throw err;
    }

    return { spreadsheetId, removedIndexRows: rows.length - kept.length };
  }

  window.GoogleClassLifecycle = {
    createClass,
    setArchived,
    touchClassUpdatedAt,
    permanentDeleteClass
  };
})();