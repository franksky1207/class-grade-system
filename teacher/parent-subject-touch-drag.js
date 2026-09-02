// Touch / pointer drag support with visual feedback for teacher-side parent subject ordering.
(function () {
  let dragging = false;
  let dragIndex = -1;
  let pointerId = null;
  let ghost = null;
  let dragOffsetY = 0;
  let draggedSubject = '';

  function handleOf(row) {
    return row?.querySelector(':scope > span:first-child') || null;
  }

  function subjectOf(row) {
    const spans = row?.querySelectorAll(':scope > span');
    return String(spans?.[1]?.textContent || '').trim();
  }

  function prepareHandles(root = document) {
    root.querySelectorAll?.('.parent-subject-order-row').forEach(row => {
      const handle = handleOf(row);
      if (!handle) return;
      handle.dataset.touchDragHandle = '1';
      handle.style.touchAction = 'none';
      handle.style.userSelect = 'none';
      handle.style.webkitUserSelect = 'none';
      handle.style.cursor = dragging ? 'grabbing' : 'grab';
      row.style.transition = 'transform .16s ease, box-shadow .16s ease, opacity .16s ease, background .16s ease';
    });
    if (dragging) applyPlaceholder();
  }

  function rowAtPoint(x, y) {
    if (ghost) ghost.style.pointerEvents = 'none';
    return document.elementFromPoint(x, y)?.closest?.('.parent-subject-order-row') || null;
  }

  function makeGhost(row, event) {
    const rect = row.getBoundingClientRect();
    dragOffsetY = event.clientY - rect.top;
    ghost = row.cloneNode(true);
    ghost.removeAttribute('draggable');
    ghost.removeAttribute('data-index');
    ghost.querySelectorAll('button').forEach(b => { b.disabled = true; b.style.visibility = 'hidden'; });
    ghost.style.position = 'fixed';
    ghost.style.zIndex = '9999';
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    ghost.style.width = `${rect.width}px`;
    ghost.style.margin = '0';
    ghost.style.transform = 'scale(1.035)';
    ghost.style.boxShadow = '0 14px 34px rgba(15,23,42,.22)';
    ghost.style.borderColor = '#8b5cf6';
    ghost.style.background = '#faf7ff';
    ghost.style.opacity = '.98';
    ghost.style.pointerEvents = 'none';
    ghost.style.transition = 'box-shadow .12s ease, transform .12s ease';
    document.body.appendChild(ghost);
  }

  function moveGhost(clientY) {
    if (!ghost) return;
    ghost.style.top = `${clientY - dragOffsetY}px`;
  }

  function applyPlaceholder() {
    document.querySelectorAll('.parent-subject-order-row').forEach(row => {
      const isCurrent = Number(row.dataset.index) === dragIndex;
      row.style.opacity = isCurrent ? '.32' : '1';
      row.style.background = isCurrent ? '#f5f3ff' : '#fff';
      row.style.borderStyle = isCurrent ? 'dashed' : 'solid';
      row.style.borderColor = isCurrent ? '#8b5cf6' : '#ddd6fe';
      row.style.transform = 'translateY(0)';
      row.style.boxShadow = 'none';
    });
  }

  function clearPlaceholder() {
    document.querySelectorAll('.parent-subject-order-row').forEach(row => {
      row.style.opacity = '1';
      row.style.background = '#fff';
      row.style.borderStyle = 'solid';
      row.style.borderColor = '#ddd6fe';
      row.style.transform = 'translateY(0)';
      row.style.boxShadow = 'none';
    });
  }

  function pulseTarget(row, direction) {
    if (!row) return;
    row.style.boxShadow = direction === 'down'
      ? 'inset 0 -3px 0 #8b5cf6'
      : 'inset 0 3px 0 #8b5cf6';
    setTimeout(() => {
      if (!dragging) return;
      prepareHandles();
    }, 90);
  }

  function moveOneStep(direction) {
    if (dragIndex < 0) return false;
    const row = document.querySelector(`.parent-subject-order-row[data-index="${dragIndex}"]`);
    const button = row?.querySelector(`button[data-move="${direction}"]`);
    if (!button) return false;
    button.click();
    dragIndex += direction === 'down' ? 1 : -1;
    requestAnimationFrame(() => {
      prepareHandles();
      const current = document.querySelector(`.parent-subject-order-row[data-index="${dragIndex}"]`);
      current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    });
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
    draggedSubject = subjectOf(row);
    handle.style.cursor = 'grabbing';
    makeGhost(row, event);
    applyPlaceholder();
    try { handle.setPointerCapture(pointerId); } catch (_) {}
    event.preventDefault();
  }, { passive: false });

  document.addEventListener('pointermove', event => {
    if (!dragging || event.pointerId !== pointerId) return;
    event.preventDefault();
    moveGhost(event.clientY);

    const target = rowAtPoint(event.clientX, event.clientY);
    if (!target) return;
    const targetIndex = Number(target.dataset.index);
    if (!Number.isInteger(targetIndex) || targetIndex === dragIndex) return;

    const direction = targetIndex > dragIndex ? 'down' : 'up';
    pulseTarget(target, direction);
    if (direction === 'down') {
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
    pointerId = null;
    dragIndex = -1;
    draggedSubject = '';
    if (ghost) {
      ghost.style.transform = 'scale(.985)';
      ghost.style.opacity = '0';
      const oldGhost = ghost;
      ghost = null;
      setTimeout(() => oldGhost.remove(), 120);
    }
    clearPlaceholder();
    prepareHandles();
  }

  document.addEventListener('pointerup', finish, true);
  document.addEventListener('pointercancel', finish, true);

  const observer = new MutationObserver(() => prepareHandles());
  observer.observe(document.body, { childList: true, subtree: true });
  prepareHandles();
})();
