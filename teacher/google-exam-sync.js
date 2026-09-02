// Incrementally sync exam records and scores to the current class Google Sheet.
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

  function text(v){return String(v??'').trim();}
  function keyOf(date,subject,name){return `${text(date)}\u0001${text(subject)}\u0001${text(name)}`;}

  async function ensureClassSpreadsheet(c){
    if(c.spreadsheetId) return c.spreadsheetId;
    if(!window.GoogleDriveStore) throw new Error('Google Drive 資料模組尚未載入。');
    const result=await window.GoogleDriveStore.ensureLocalClasses([c]);
    if(result.changed&&typeof save==='function') save();
    if(!c.spreadsheetId) throw new Error('找不到班級試算表。');
    return c.spreadsheetId;
  }

  async function readCurrentRows(id){
    const params=new URLSearchParams();
    params.append('ranges',"'考試資料'!A:C");
    params.append('ranges',"'成績資料'!A:F");
    params.set('majorDimension','ROWS');
    const data=await (await authFetch(`${SHEETS_API}/${encodeURIComponent(id)}/values:batchGet?${params.toString()}`)).json();
    const ranges=Array.isArray(data.valueRanges)?data.valueRanges:[];
    return {
      exams:Array.isArray(ranges[0]?.values)?ranges[0].values:[],
      grades:Array.isArray(ranges[1]?.values)?ranges[1].values:[]
    };
  }

  function currentExamMap(c){
    const map=new Map();
    for(const e of (c.exams||[])) map.set(keyOf(e.date,e.subject,e.name),e);
    return map;
  }

  function sheetState(rows){
    const examMap=new Map();
    const gradeMap=new Map();
    let anomaly=false;

    rows.exams.slice(1).forEach((r,i)=>{
      const date=text(r[0]),subject=text(r[1]),name=text(r[2]);
      if(!date&&!subject&&!name) return;
      const key=keyOf(date,subject,name);
      if(examMap.has(key)){anomaly=true;return;}
      examMap.set(key,{row:i+2,date,subject,name});
    });

    rows.grades.slice(1).forEach((r,i)=>{
      const date=text(r[0]),subject=text(r[1]),name=text(r[2]);
      if(!date&&!subject&&!name) return;
      const key=keyOf(date,subject,name);
      if(!gradeMap.has(key)) gradeMap.set(key,[]);
      const seat=text(r[3]);
      const list=gradeMap.get(key);
      if(list.some(x=>x.seat===seat)) anomaly=true;
      list.push({row:i+2,date,subject,name,seat,nameText:text(r[4]),value:text(r[5])});
    });

    for(const key of gradeMap.keys()) if(!examMap.has(key)) anomaly=true;
    return {examMap,gradeMap,anomaly};
  }

  function sameExam(sheetGrades,e){
    const current=(e.scores||[]).map(s=>[text(s.seat),text(s.name),text(s.value)]);
    const existing=(sheetGrades||[]).map(s=>[s.seat,s.nameText,s.value]);
    if(current.length!==existing.length) return false;
    const a=new Map(current.map(x=>[x[0],`${x[1]}\u0001${x[2]}`]));
    const b=new Map(existing.map(x=>[x[0],`${x[1]}\u0001${x[2]}`]));
    if(a.size!==b.size) return false;
    for(const [seat,v] of a) if(b.get(seat)!==v) return false;
    return true;
  }

  async function fullSync(c,id,existingRows=null){
    const rows=existingRows||await readCurrentRows(id);
    const examRows=[['日期','科目','考試名稱']];
    const gradeRows=[['日期','科目','考試名稱','座號','姓名','成績']];
    (c.exams||[]).forEach(e=>{
      examRows.push([text(e.date),text(e.subject),text(e.name)]);
      (e.scores||[]).forEach(s=>gradeRows.push([text(e.date),text(e.subject),text(e.name),text(s.seat),text(s.name),text(s.value)]));
    });
    const examTarget=Math.max(1,rows.exams.length,examRows.length);
    const gradeTarget=Math.max(1,rows.grades.length,gradeRows.length);
    while(examRows.length<examTarget) examRows.push(['','','']);
    while(gradeRows.length<gradeTarget) gradeRows.push(['','','','','','']);
    await authFetch(`${SHEETS_API}/${encodeURIComponent(id)}/values:batchUpdate`,{
      method:'POST',body:JSON.stringify({valueInputOption:'RAW',data:[
        {range:`'考試資料'!A1:C${examTarget}`,values:examRows},
        {range:`'成績資料'!A1:F${gradeTarget}`,values:gradeRows}
      ]})
    });
    return {mode:'full',examCount:(c.exams||[]).length,gradeCount:Math.max(0,gradeRows.filter(r=>r.some(Boolean)).length-1)};
  }

  async function syncExamsAndGrades(c){
    if(!c) throw new Error('找不到目前班級。');
    const id=await ensureClassSpreadsheet(c);
    const rows=await readCurrentRows(id);
    const sheet=sheetState(rows);
    if(sheet.anomaly) return fullSync(c,id,rows);

    const current=currentExamMap(c);
    const removeKeys=new Set();
    const upserts=[];

    for(const [key,storedExam] of sheet.examMap){
      const now=current.get(key);
      if(!now){removeKeys.add(key);continue;}
      if(!sameExam(sheet.gradeMap.get(key)||[],now)){
        removeKeys.add(key);
        upserts.push(now);
      }
    }
    for(const [key,e] of current) if(!sheet.examMap.has(key)) upserts.push(e);

    if(!removeKeys.size&&!upserts.length){
      return {spreadsheetId:id,mode:'noop',examCount:(c.exams||[]).length};
    }

    const data=[];
    for(const key of removeKeys){
      const exam=sheet.examMap.get(key);
      if(exam) data.push({range:`'考試資料'!A${exam.row}:C${exam.row}`,values:[['','','']]});
      for(const g of (sheet.gradeMap.get(key)||[])) data.push({range:`'成績資料'!A${g.row}:F${g.row}`,values:[['','','','','','']]});
    }

    let nextExamRow=Math.max(2,rows.exams.length+1);
    let nextGradeRow=Math.max(2,rows.grades.length+1);
    for(const e of upserts){
      data.push({range:`'考試資料'!A${nextExamRow}:C${nextExamRow}`,values:[[text(e.date),text(e.subject),text(e.name)]]});
      nextExamRow++;
      const grades=(e.scores||[]).map(s=>[text(e.date),text(e.subject),text(e.name),text(s.seat),text(s.name),text(s.value)]);
      if(grades.length){
        const end=nextGradeRow+grades.length-1;
        data.push({range:`'成績資料'!A${nextGradeRow}:F${end}`,values:grades});
        nextGradeRow=end+1;
      }
    }

    await authFetch(`${SHEETS_API}/${encodeURIComponent(id)}/values:batchUpdate`,{
      method:'POST',body:JSON.stringify({valueInputOption:'RAW',data})
    });

    return {spreadsheetId:id,mode:'incremental',removed:removeKeys.size,upserted:upserts.length,examCount:(c.exams||[]).length};
  }

  window.GoogleExamSync={syncExamsAndGrades};
})();