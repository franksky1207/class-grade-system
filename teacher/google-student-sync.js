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

  async function syncStudents(c){
    if(!c) throw new Error('找不到目前班級。');
    const id=await ensureClassSpreadsheet(c);
    const clearRange=encodeURIComponent("'學生資料'!A:D");
    await authFetch(`${SHEETS_API}/${encodeURIComponent(id)}/values/${clearRange}:clear`,{
      method:'POST',body:'{}'
    });
    const rows=[['座號','姓名','學號','身分證後4碼'],...(c.students||[]).map(s=>[
      String(s.seat||''),String(s.name||''),String(s.account||''),String(s.pass||'')
    ])];
    const range=`'學生資料'!A1:D${Math.max(1,rows.length)}`;
    const encoded=encodeURIComponent(range);
    await authFetch(`${SHEETS_API}/${encodeURIComponent(id)}/values/${encoded}?valueInputOption=RAW`,{
      method:'PUT',
      body:JSON.stringify({range,majorDimension:'ROWS',values:rows})
    });
    return {spreadsheetId:id,count:(c.students||[]).length};
  }

  window.GoogleStudentSync={syncStudents};
})();
