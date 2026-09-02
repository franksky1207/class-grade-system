// Touch / pointer drag support for teacher-side parent subject ordering.
(function () {
  let dragging = false;
  let dragIndex = -1;
  let pointerId = null;

  function handleOf(row) {
    return row?.querySelector(':scope > span:first-child') || null;
  }

  function prepareHandles(root = document) {
    root.querySelectorAll?.('.parent-subject-order-row').forEach(row => {
      const handle = handleOf(row);
      if (!handle) return;
      handle.dataset.touchDragHandle = '1';
      handle.style.touchAction = 'none';
      handle.style.userSelect = 'none';
      handle.style.webkitUserSelect = 'none';
      handle.style.cursor = 'grab';
    });
  }

  function rowAtPoint(x, y) {
    return document.elementFromPoint(x, y)?.closest?.('.parent-subject-order-row') || null;
  }

  function moveOneStep(direction) {
    if (dragIndex < 0) return false;
    const row = document.querySelector(`.parent-subject-order-row[data-index="${dragIndex}"]`);
    const button = row?.querySelector(`button[data-move="${direction}"]`);
    if (!button) return false;
    button.click();
    dragIndex += direction === 'down' ? 1 : -1;
    requestAnimationFrame(() => prepareHandles());
    return true;
  }

  document.addEventListener('pointerdown', event => {
    const handle = event.target?.closest?.('[data-touch-drag-handle="1"]');
    if (!handle) return;
    const row = handle.closest('.parent-subject-order-row');
    if (!row) return;
    dragIndex = Number(row.dataset.index);
    if (!Number.isInteger(dragIndex) || dragIndex < 0) return;
    dragging = true;
    pointerId = event.pointerId;
    handle.style.cursor = 'grabbing';
    try { handle.setPointerCapture(pointerId); } catch (_) {}
    event.preventDefault();
  }, { passive: false });

  document.addEventListener('pointermove', event => {
    if (!dragging || event.pointerId !== pointerId) return;
    event.preventDefault();
    const target = rowAtPoint(event.clientX, event.clientY);
    if (!target) return;
    const targetIndex = Number(target.dataset.index);
    if (!Number.isInteger(targetIndex) || targetIndex === dragIndex) return;

    if (targetIndex > dragIndex) {
      while (dragIndex < targetIndex) {
        if (!moveOneStep('down')) break;
      }
    } else {
      while (dragIndex > targetIndex) {
        if (!moveOneStep('up')) break;
      }
    }
  }, { passive: false });

  function finish(event) {
    if (!dragging) return;
    if (event?.pointerId != null && pointerId != null && event.pointerId !== pointerId) return;
    dragging = false;
    dragIndex = -1;
    pointerId = null;
    prepareHandles();
  }

  document.addEventListener('pointerup', finish, true);
  document.addEventListener('pointercancel', finish, true);

  const observer = new MutationObserver(() => prepareHandles());
  observer.observe(document.body, { childList: true, subtree: true });
  prepareHandles();
})();
