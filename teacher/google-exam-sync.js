// Sync exam records and all related scores to the current class Google Sheet after explicit exam save/edit/delete actions.
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

  async function getExistingCounts(id){
    const params=new URLSearchParams();
    params.append('ranges',"'考試資料'!A:C");
    params.append('ranges',"'成績資料'!A:F");
    params.set('majorDimension','ROWS');
    const data=await (await authFetch(`${SHEETS_API}/${encodeURIComponent(id)}/values:batchGet?${params.toString()}`)).json();
    const ranges=Array.isArray(data.valueRanges)?data.valueRanges:[];
    return {
      exam:Array.isArray(ranges[0]?.values)?ranges[0].values.length:0,
      grade:Array.isArray(ranges[1]?.values)?ranges[1].values.length:0
    };
  }

  async function syncExamsAndGrades(c){
    if(!c) throw new Error('找不到目前班級。');
    const id=await ensureClassSpreadsheet(c);

    const examRows=[['日期','科目','考試名稱']];
    const gradeRows=[['日期','科目','考試名稱','座號','姓名','成績']];

    (c.exams||[]).forEach(e=>{
      examRows.push([
        String(e.date||''),String(e.subject||''),String(e.name||'')
      ]);
      (e.scores||[]).forEach(s=>{
        gradeRows.push([
          String(e.date||''),String(e.subject||''),String(e.name||''),
          String(s.seat||''),String(s.name||''),String(s.value??'')
        ]);
      });
    });

    // 先讀取目前使用列數，再以單一 batchUpdate 同時覆寫新資料與多餘舊列。
    // 不先 clear，避免網路中斷時出現「舊資料已清空、新資料尚未寫回」的空窗。
    const old=await getExistingCounts(id);
    const examTarget=Math.max(1,old.exam,examRows.length);
    const gradeTarget=Math.max(1,old.grade,gradeRows.length);
    const examValues=examRows.slice();
    const gradeValues=gradeRows.slice();
    while(examValues.length<examTarget) examValues.push(['','','']);
    while(gradeValues.length<gradeTarget) gradeValues.push(['','','','','','']);

    await authFetch(`${SHEETS_API}/${encodeURIComponent(id)}/values:batchUpdate`,{
      method:'POST',
      body:JSON.stringify({
        valueInputOption:'RAW',
        data:[
          {range:`'考試資料'!A1:C${examTarget}`,values:examValues},
          {range:`'成績資料'!A1:F${gradeTarget}`,values:gradeValues}
        ]
      })
    });

    return {
      spreadsheetId:id,
      examCount:(c.exams||[]).length,
      gradeCount:Math.max(0,gradeRows.length-1)
    };
  }

  window.GoogleExamSync={syncExamsAndGrades};
})();