// Google Drive / Sheets persistence helpers for the teacher site.
// Stage 1: ensure each teacher has exactly one app-owned class index spreadsheet.
(function () {
  const INDEX_FILE_NAME = 'class-grade-system-index';
  const INDEX_SHEET_NAME = '班級索引';
  const INDEX_HEADERS = [
    '班級名稱',
    '學年度',
    '學期',
    'Spreadsheet ID',
    'archived',
    '建立時間',
    '更新時間'
  ];

  const DRIVE_API = 'https://www.googleapis.com/drive/v3';
  const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

  async function authFetch(url, options = {}) {
    const token = await window.GoogleAuth.getAccessToken();
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    if (options.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      let detail = '';
      try {
        const data = await response.json();
        detail = data?.error?.message || '';
      } catch (_) {}
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

    const params = new URLSearchParams({
      q,
      spaces: 'drive',
      fields: 'files(id,name,createdTime,modifiedTime,appProperties)',
      pageSize: '10'
    });

    const response = await authFetch(`${DRIVE_API}/files?${params.toString()}`);
    const data = await response.json();
    const files = Array.isArray(data.files) ? data.files : [];

    // If a duplicate somehow exists, use the oldest app-owned index rather than creating another.
    files.sort((a, b) => String(a.createdTime || '').localeCompare(String(b.createdTime || '')));
    return files[0] || null;
  }

  async function createIndexSpreadsheet() {
    // Create through Drive so appProperties can be written at creation time.
    const createResponse = await authFetch(
      `${DRIVE_API}/files?fields=id,name,createdTime,modifiedTime,appProperties`,
      {
        method: 'POST',
        body: JSON.stringify({
          name: INDEX_FILE_NAME,
          mimeType: 'application/vnd.google-apps.spreadsheet',
          appProperties: {
            classGradeSystemType: 'class-index',
            schemaVersion: '1'
          }
        })
      }
    );
    const file = await createResponse.json();

    // Read the first sheet ID, then rename it to a stable name.
    const metaResponse = await authFetch(
      `${SHEETS_API}/${encodeURIComponent(file.id)}?fields=sheets.properties`
    );
    const meta = await metaResponse.json();
    const firstSheet = meta?.sheets?.[0]?.properties;
    if (!firstSheet) throw new Error('索引試算表建立成功，但無法讀取工作表結構。');

    await authFetch(`${SHEETS_API}/${encodeURIComponent(file.id)}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({
        requests: [
          {
            updateSheetProperties: {
              properties: {
                sheetId: firstSheet.sheetId,
                title: INDEX_SHEET_NAME,
                gridProperties: { frozenRowCount: 1 }
              },
              fields: 'title,gridProperties.frozenRowCount'
            }
          }
        ]
      })
    });

    const range = encodeURIComponent(`'${INDEX_SHEET_NAME}'!A1:G1`);
    await authFetch(
      `${SHEETS_API}/${encodeURIComponent(file.id)}/values/${range}?valueInputOption=RAW`,
      {
        method: 'PUT',
        body: JSON.stringify({
          range: `${INDEX_SHEET_NAME}!A1:G1`,
          majorDimension: 'ROWS',
          values: [INDEX_HEADERS]
        })
      }
    );

    return { ...file, createdNow: true };
  }

  async function ensureTeacherIndex() {
    if (!window.GoogleAuth?.isSignedIn()) {
      throw new Error('尚未完成 Google 登入。');
    }

    let file = await findIndexSpreadsheet();
    if (!file) file = await createIndexSpreadsheet();

    const result = {
      id: file.id,
      name: file.name || INDEX_FILE_NAME,
      createdNow: !!file.createdNow,
      url: `https://docs.google.com/spreadsheets/d/${file.id}/edit`
    };

    window.classGradeSystemIndex = result;
    return result;
  }

  window.GoogleDriveStore = {
    ensureTeacherIndex,
    findIndexSpreadsheet,
    indexFileName: INDEX_FILE_NAME,
    indexSheetName: INDEX_SHEET_NAME
  };
})();
