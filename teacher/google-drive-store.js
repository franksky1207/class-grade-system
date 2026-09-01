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

    files.sort((a, b) => String(a.createdTime || '').localeCompare(String(b.createdTime || '')));
    return files[0] || null;
  }

  async function ensureIndexSchema(fileId) {
    const metaResponse = await authFetch(
      `${SHEETS_API}/${encodeURIComponent(fileId)}?fields=sheets.properties`
    );
    const meta = await metaResponse.json();
    const sheets = Array.isArray(meta?.sheets) ? meta.sheets : [];
    if (!sheets.length) throw new Error('索引試算表存在，但沒有可用的工作表。');

    let target = sheets.find(s => s?.properties?.title === INDEX_SHEET_NAME)?.properties || null;

    if (!target) {
      const firstSheet = sheets[0]?.properties;
      if (!firstSheet) throw new Error('無法讀取索引試算表工作表結構。');

      await authFetch(`${SHEETS_API}/${encodeURIComponent(fileId)}:batchUpdate`, {
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
      target = { ...firstSheet, title: INDEX_SHEET_NAME };
    } else if ((target.gridProperties?.frozenRowCount || 0) !== 1) {
      await authFetch(`${SHEETS_API}/${encodeURIComponent(fileId)}:batchUpdate`, {
        method: 'POST',
        body: JSON.stringify({
          requests: [
            {
              updateSheetProperties: {
                properties: {
                  sheetId: target.sheetId,
                  gridProperties: { frozenRowCount: 1 }
                },
                fields: 'gridProperties.frozenRowCount'
              }
            }
          ]
        })
      });
    }

    const sheetRange = `'${INDEX_SHEET_NAME}'!A1:G1`;
    const encodedRange = encodeURIComponent(sheetRange);
    await authFetch(
      `${SHEETS_API}/${encodeURIComponent(fileId)}/values/${encodedRange}?valueInputOption=RAW`,
      {
        method: 'PUT',
        body: JSON.stringify({
          range: sheetRange,
          majorDimension: 'ROWS',
          values: [INDEX_HEADERS]
        })
      }
    );
  }

  async function createIndexSpreadsheet() {
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
    await ensureIndexSchema(file.id);
    return { ...file, createdNow: true };
  }

  async function ensureTeacherIndex() {
    if (!window.GoogleAuth?.isSignedIn()) {
      throw new Error('尚未完成 Google 登入。');
    }

    let file = await findIndexSpreadsheet();
    if (!file) {
      file = await createIndexSpreadsheet();
    } else {
      // Repair older/partially-created index files instead of assuming they are complete.
      await ensureIndexSchema(file.id);
    }

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
    ensureIndexSchema,
    indexFileName: INDEX_FILE_NAME,
    indexSheetName: INDEX_SHEET_NAME
  };
})();
