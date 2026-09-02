// Split manual exam name input into two content fields while keeping the stored exam name format unchanged.
(function () {
  function text(v) { return String(v ?? '').trim(); }

  function ensureStyle() {
    if (document.getElementById('manualExamContentFieldsStyle')) return;
    const style = document.createElement('style');
    style.id = 'manualExamContentFieldsStyle';
    style.textContent = `
      #manualEntry .manual-exam-basic-grid{grid-template-columns:repeat(4,minmax(0,1fr))}
      @media(max-width:1000px){#manualEntry .manual-exam-basic-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:767px){#manualEntry .manual-exam-basic-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function ensureFields() {
    const original = document.getElementById('manualName');
    if (!original) return false;
    const label = original.closest('label');
    const grid = label?.parentElement;
    if (!label || !grid) return false;

    ensureStyle();
    grid.classList.add('manual-exam-basic-grid');

    if (!document.getElementById('manualContent1')) {
      const label1 = document.createElement('label');
      label1.textContent = '考試內容1';
      const input1 = document.createElement('input');
      input1.id = 'manualContent1';
      input1.className = 'field';
      input1.autocomplete = 'off';
      label1.appendChild(input1);

      const label2 = document.createElement('label');
      label2.textContent = '考試內容2';
      const input2 = document.createElement('input');
      input2.id = 'manualContent2';
      input2.className = 'field';
      input2.autocomplete = 'off';
      label2.appendChild(input2);

      grid.insertBefore(label1, label);
      grid.insertBefore(label2, label);
    }

    label.style.display = 'none';
    original.type = 'hidden';
    original.setAttribute('aria-hidden', 'true');
    return true;
  }

  function syncCombinedName() {
    const original = document.getElementById('manualName');
    const first = text(document.getElementById('manualContent1')?.value);
    const second = text(document.getElementById('manualContent2')?.value);
    if (!original) return;
    original.value = first ? (second ? `${first}｜${second}` : first) : '';
  }

  function clear() {
    const first = document.getElementById('manualContent1');
    const second = document.getElementById('manualContent2');
    const original = document.getElementById('manualName');
    if (first) first.value = '';
    if (second) second.value = '';
    if (original) original.value = '';
  }

  document.addEventListener('input', event => {
    if (event.target?.matches?.('#manualContent1,#manualContent2')) syncCombinedName();
  }, true);

  // Run before the existing save handler. It will keep using #manualName, now populated from the two fields.
  document.addEventListener('click', event => {
    if (event.target?.closest?.('#saveManualExam')) syncCombinedName();
  }, true);

  const started = Date.now();
  const wait = () => {
    if (ensureFields()) return;
    if (Date.now() - started < 30000) setTimeout(wait, 100);
  };
  wait();

  window.ManualExamContentFields = { ensure: ensureFields, sync: syncCombinedName, clear };
})();
