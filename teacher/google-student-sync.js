// Sync student roster to the current class Google Sheet only after explicit save/add/edit/delete actions.
(function(){
  const SHEETS_API='https://sheets.googleapis.com/v4/spreadsheets';

  async function authFetch(url,options={}){
    const token=await window.GoogleAuth.getAccessToken();
    const headers=new Headers(options.headers||{});
    headers.set('Authorization',`Bearer ${token}`);
    if(options.body&&!headers.has('Content-Type')) headers.set('Content-Type','application/json');
    const res=await fetch(url,{...options,headers});
    if(!res.ok){
      let detail='';
      try{detail=(await res.json())?.error?.message||'';}catch(_){}
      throw new Error(detail||`Google API 發生錯誤（${res.status}）`);
    }
    return res;
  }

  async function ensureClassSpreadsheet(c){
    if(c.spreadsheetId) return c.spreadsheetId;
    if(!window.GoogleDriveStore) throw new Error('Google Drive 資料模組尚未載入。');
    const result=await window.GoogleDriveStore.ensureLocalClasses([c]);
    if(result.changed&&typeof save==='function') save();
    if(!c.spreadsheetId) throw new Error('找不到班級試算表。');
    return c.spreadsheetId;
  }

  async function getExistingRowCount(id){
    const range=encodeURIComponent("'學生資料'!A:D");
    const data=await (await authFetch(`${SHEETS_API}/${encodeURIComponent(id)}/values/${range}`)).json();
    return Array.isArray(data.values)?data.values.length:0;
  }

  async function syncStudents(c){
    if(!c) throw new Error('找不到目前班級。');
    const id=await ensureClassSpreadsheet(c);
    const rows=[['座號','姓名','學號','身分證後4碼'],...(c.students||[]).map(s=>[
      String(s.seat||''),String(s.name||''),String(s.account||''),String(s.pass||'')
    ])];

    // 先取得目前使用列數，再一次覆寫新資料與多餘舊列。
    // 不先 clear，避免「清空成功但下一個寫入失敗」造成整張學生表暫時變空。
    const oldCount=await getExistingRowCount(id);
    const targetRows=Math.max(1,oldCount,rows.length);
    const values=rows.slice();
    while(values.length<targetRows) values.push(['','','','']);

    const range=`'學生資料'!A1:D${targetRows}`;
    const encoded=encodeURIComponent(range);
    await authFetch(`${SHEETS_API}/${encodeURIComponent(id)}/values/${encoded}?valueInputOption=RAW`,{
      method:'PUT',
      body:JSON.stringify({range,majorDimension:'ROWS',values})
    });
    return {spreadsheetId:id,count:(c.students||[]).length};
  }

  window.GoogleStudentSync={syncStudents};
})();