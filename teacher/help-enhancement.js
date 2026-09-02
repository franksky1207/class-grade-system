// Progressive in-page help and expanded global usage guide.
(function () {
  function addStyles() {
    if (document.getElementById('helpEnhancementStyles')) return;
    const style = document.createElement('style');
    style.id = 'helpEnhancementStyles';
    style.textContent = `
      .context-help{margin:0 0 14px;border:1px solid #dbeafe;background:#f8fbff;border-radius:12px;padding:10px 12px;color:#475569;font-size:13px;line-height:1.65}
      .context-help summary{cursor:pointer;font-weight:800;color:#1d4ed8;list-style:none}
      .context-help summary::-webkit-details-marker{display:none}
      .context-help summary::after{content:' ▾';font-weight:700}
      .context-help[open] summary::after{content:' ▴'}
      .context-help .help-detail{margin-top:9px;padding-top:9px;border-top:1px solid #dbeafe;color:#475569}
      .context-help .help-detail p{margin:6px 0}
      .guide-quick{border:1px solid #bfdbfe;background:#eff6ff;border-radius:12px;padding:12px 13px;margin-bottom:12px;font-size:13px;line-height:1.75;color:#374151}
      .guide-section{border:1px solid #e5e7eb;border-radius:12px;background:#fafafa;margin-top:8px;padding:10px 12px}
      .guide-section summary{cursor:pointer;font-weight:800;color:#1f2937}
      .guide-section .guide-body{margin-top:9px;padding-top:9px;border-top:1px solid #e5e7eb;font-size:13px;color:#4b5563;line-height:1.75}
      .guide-section .guide-body p{margin:6px 0}
      .guide-section .guide-body ul{margin:6px 0 6px 18px;padding:0}
      .guide-section .guide-body li{margin:4px 0}
    `;
    document.head.appendChild(style);
  }

  function ensureStudentHelp() {
    const page = document.getElementById('students');
    if (!page || page.querySelector('[data-student-context-help]')) return;
    const card = page.querySelector('.card.pad');
    const head = card?.querySelector('.head');
    if (!card || !head) return;
    const details = document.createElement('details');
    details.className = 'context-help';
    details.dataset.studentContextHelp = '1';
    details.innerHTML = `
      <summary>點學生姓名可預覽學生端；「趨勢分析」可查看個人班級百分位變化。　詳細說明</summary>
      <div class="help-detail">
        <p><b>教師預覽：</b>點擊學生姓名，可直接以教師預覽模式開啟該學生實際看到的學生／家長端成績畫面，不需另外輸入學號與身分證後4碼。預覽使用目前教師端所選班級資料，不會改變家長目前公開的班級，也不會以學生帳密登入。</p>
        <p><b>個人趨勢分析：</b>點擊學生旁的「趨勢分析」，會在新分頁開啟該生的班級百分位趨勢。可自行選擇科目與分析範圍。此功能只供教師端使用，分析結果不會寫回 Google 試算表。</p>
      </div>`;
    head.insertAdjacentElement('afterend', details);
  }

  function ensureOverviewHelp() {
    const page = document.getElementById('overview');
    if (!page || page.querySelector('[data-overview-context-help]')) return;
    const card = page.querySelector('.card.pad');
    const head = card?.querySelector('.head');
    if (!card || !head) return;
    const details = document.createElement('details');
    details.className = 'context-help';
    details.dataset.overviewContextHelp = '1';
    details.innerHTML = `
      <summary>想查看全班相對位置與近期變化，可使用「班級分析」。　詳細說明</summary>
      <div class="help-detail">
        <p><b>成績總覽</b>用來查看原始成績表；<b>班級分析</b>則把目前班級資料轉成班級百分位，依科目、分析範圍、位置與變化型態篩選學生，再用群體趨勢圖查看。</p>
        <p>班級分析只在瀏覽器即時計算，不會新增欄位，也不會把分析結果寫回 Google 試算表。</p>
      </div>`;
    head.insertAdjacentElement('afterend', details);
  }

  function replaceGlobalGuide() {
    const drawer = document.getElementById('helpDrawer');
    if (!drawer || drawer.dataset.progressiveGuide === '1') return;
    const head = drawer.querySelector('.head');
    if (!head) return;
    drawer.dataset.progressiveGuide = '1';
    [...drawer.children].forEach(el => { if (el !== head) el.remove(); });
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="guide-quick">
        <b>快速使用</b><br>
        成績輸入：新增考試與成績<br>
        成績總覽：查看全班原始成績<br>
        考試紀錄：查看、修改、刪除考試<br>
        學生與帳號管理：管理學生資料、預覽學生端、查看個人趨勢<br>
        班級分析：從成績總覽進入，查看全班百分位與近期變化<br>
        統計與設定：管理班級、家長查詢與 Google 雲端資料
      </div>

      <details class="guide-section"><summary>1. 班級與學期｜建立、切換、封存班級</summary><div class="guide-body">
        <p>每個「班級名稱＋學年度＋學期」是一組獨立班級資料，包含學生、考試與成績。可在右上角切換目前使用中的班級。</p>
        <p>第一學期可使用「建立下一學期」，只複製學生名單，不複製考試與成績。第二學期之後請使用「新增班級」建立下一學年度資料。</p>
        <p>封存會保留完整資料，之後可重新啟用；永久刪除則會移除整個班級資料，且無法復原。</p>
      </div></details>

      <details class="guide-section"><summary>2. 學生與帳號｜新增、修改與登入資料</summary><div class="guide-body">
        <p>學生欄位固定為「座號｜姓名｜學號｜身分證後4碼」。學號為學生／家長登入帳號，身分證後4碼為登入密碼；資料暫時不完整時可先留空。</p>
        <p>座號只接受數字並會自動標準化，因此 01 與 1 視為同一座號。身分證後4碼若不足4位會自動左側補0，例如 567 會存成 0567。</p>
        <p>可用 Excel 四欄貼上批次建立／更新學生，也可手動新增。刪除目前班級中的學生不會刪除過去考試內已存在的歷史成績。</p>
      </div></details>

      <details class="guide-section"><summary>3. 成績輸入｜手動輸入與 Excel 貼上</summary><div class="guide-body">
        <p>可使用手動輸入或 Excel 貼上。手動輸入需設定日期、科目與考試內容，再輸入學生分數。</p>
        <p>Excel 第1列視為科目，第2、3列可作為考試內容；最多支援「1列科目＋2列內容」。系統會先辨識與預覽，再由教師確認儲存。</p>
        <p>成績可為任意數字或空白；0 分是有效成績。平均、總分、排名、名次等統計欄位預設不匯入。</p>
      </div></details>

      <details class="guide-section"><summary>4. 成績總覽｜查看全班原始成績</summary><div class="guide-body">
        <p>可依科目、學生與顯示範圍查看全班成績。範圍可選最近10次、最近2週、自訂次數、自訂日期區間或全部。</p>
        <p>最新考試排列在左側，表格最後一列顯示各次班平均；低於該次班平均的個人成績以深紅色文字標示。</p>
        <p>若要進一步看全班相對位置與近期變化，可由此頁右上方開啟「班級分析」。</p>
      </div></details>

      <details class="guide-section"><summary>5. 考試紀錄｜查看、修改、刪除與成績複製</summary><div class="guide-body">
        <p>可依日期、科目、考試名稱與排序查找已儲存考試，並查看、修改或刪除。修改後會同步更新該場考試與成績。</p>
        <p>成績複製表可選擇多場考試，在乾淨的新分頁中只選取分數儲存格複製回 Excel；座號與姓名只作為視覺定位，不會一起被選取。</p>
      </div></details>

      <details class="guide-section"><summary>6. 教師預覽｜直接查看學生端畫面</summary><div class="guide-body">
        <p>在「學生與帳號管理」點擊學生姓名，可直接開啟該生實際使用的學生／家長端介面，不必記住或輸入學生帳號與密碼。</p>
        <p>預覽使用目前教師端所選班級資料，與家長目前公開的班級設定互相獨立；不會替學生真正登入，也不會把教師 Google 權杖交給學生端。</p>
        <p>預覽頁頂端會顯示「教師預覽模式」，原本的「登出」會改為「關閉預覽」。</p>
      </div></details>

      <details class="guide-section"><summary>7. 個人趨勢分析｜查看單一學生百分位變化</summary><div class="guide-body">
        <p>在「學生與帳號管理」點擊「趨勢分析」，會在新分頁開啟該生分析。科目由教師自行選擇，範圍可選近5、10、15次、自訂最近 N 次或全部。</p>
        <p>每次考試的班級百分位採 midrank：〔低於該生成績的人數＋0.5×同分人數〕÷實際應試人數×100。百分位越高，代表該次考試在班級中的相對位置越前。</p>
        <p>空白成績不列入，0 分有效；若實際次數少於選定範圍，就顯示現有次數。同一天不同考試仍分開顯示，資料多時只抽稀 X 軸日期標籤，不刪除資料點。</p>
        <p>桌機滑過、手機點擊節點，可查看日期、科目、完整考試內容、原始分數、班平均、班級百分位、名次與應試人數。所有分析都即時計算，不回寫 Google 試算表。</p>
      </div></details>

      <details class="guide-section"><summary>8. 班級分析｜依位置與變化篩選全班</summary><div class="guide-body">
        <p>從「成績總覽」開啟「班級分析」。先選科目與分析範圍，再用「位置」和「變化型態」兩個獨立條件篩選學生；兩邊都可選「全部」，因此可只限制其中一項，也可交叉篩選。</p>
        <p><b>位置：</b>依所選範圍內的平均班級百分位判定。高位 ≥ 70；中位 ≥ 30 且未滿 70；低位 &lt; 30。</p>
        <p><b>變化型態：</b>先看所選範圍的整體線性趨勢。整體上升幅度 ≥ 12 個百分位點判為「上升」；≤ -12 判為「下降」。若未達上升／下降門檻，但相鄰考試百分位的平均絕對變動 ≥ 15，判為「波動較大」；其餘判為「穩定」。</p>
        <p>篩選後會顯示符合條件的人數與群體趨勢圖。可用「聚焦學生」選擇座號＋姓名，讓該生線條加粗、其他線條淡化；桌機可滑過、手機可點節點查看完整考試資料。</p>
        <p>所有分類、百分位與圖表都只在瀏覽器即時計算，不新增欄位，也不回寫 Google 試算表。</p>
      </div></details>

      <details class="guide-section"><summary>9. 平均與成績計算規則</summary><div class="guide-body">
        <p>班平均＝有效數字成績總和 ÷ 實際有成績人數。空白不計，0 分必須計入。</p>
        <p>名次採競賽排名方式：例如 100、95、95、90 的名次為 1、2、2、4。百分位與名次都只使用該次實際有有效成績的學生計算。</p>
      </div></details>

      <details class="guide-section"><summary>10. 家長查詢｜公開班級與查詢方式</summary><div class="guide-body">
        <p>家長／學生使用固定查詢網址，以學號＋身分證後4碼登入，只能查看自己的資料。教師目前正在操作的班級與家長目前公開的班級互相獨立。</p>
        <p>切換教師端班級不會自動改變家長公開班級；只有在「家長查詢設定」明確儲存後才會更換。舊班級資料仍保留在 Google Drive，但不再透過目前家長入口登入。</p>
      </div></details>

      <details class="guide-section"><summary>11. 新學期、封存與刪除</summary><div class="guide-body">
        <p>建立下一學期只複製學生名單，不複製考試與成績。封存班級會保留全部學生與歷史成績，重新啟用後可繼續使用。</p>
        <p>永久刪除班級會移除班級索引並將對應 Google 試算表移至垃圾桶，屬不可逆操作，系統會再次要求確認。</p>
      </div></details>

      <details class="guide-section"><summary>12. Google 試算表與資料保存</summary><div class="guide-body">
        <p>每個「班級＋學年度＋學期」使用獨立 Google 試算表，另有班級索引資料。系統以 Spreadsheet ID 定位，因此可自行修改檔名或在 Drive 中移動位置。</p>
        <p>班級試算表固定使用「班級設定、學生資料、考試資料、成績資料」等工作表。不建議任意刪除或重新命名系統工作表；若偵測格式異常，系統會停止寫入並提示修復。</p>
        <p>教師端採明確儲存操作，不會每打一個字就寫入 Google Sheet。右上角會顯示「儲存中…／✓ 已儲存／⚠ 儲存失敗」；儲存失敗時應保留尚未成功同步的修改。</p>
      </div></details>`;
    drawer.appendChild(wrap);
  }

  function install() {
    addStyles();
    ensureStudentHelp();
    ensureOverviewHelp();
    replaceGlobalGuide();
  }

  document.addEventListener('click', event => {
    if (event.target?.closest?.('button[data-page="students"]')) setTimeout(ensureStudentHelp, 0);
    if (event.target?.closest?.('button[data-page="overview"]')) setTimeout(ensureOverviewHelp, 0);
    if (event.target?.closest?.('#helpBtn')) setTimeout(replaceGlobalGuide, 0);
  }, true);

  const observer = new MutationObserver(install);
  observer.observe(document.body, { childList: true, subtree: true });
  install();
})();
