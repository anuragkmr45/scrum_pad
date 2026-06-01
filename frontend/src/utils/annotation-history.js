import renderAnnotations from './PdfAnnotate/render';

const MAX_HISTORY = 80;
const HISTORY_EVENT = 'hexscrum:annotation-history-changed';
const SNAPSHOT_EVENT = 'hexscrum:annotation-snapshot-applied';

let undoStack = [];
let redoStack = [];
let applyingSnapshot = false;

function clone(value) {
  return JSON.parse(JSON.stringify(value || []));
}

function sameAnnotations(first, second) {
  return JSON.stringify(first || []) === JSON.stringify(second || []);
}

function storageKey(documentId) {
  return `${documentId}/annotations`;
}

export function getStoredAnnotations(documentId) {
  try {
    return JSON.parse(localStorage.getItem(storageKey(documentId))) || [];
  } catch (err) {
    return [];
  }
}

function setStoredAnnotations(documentId, annotations) {
  if (!annotations || annotations.length === 0) {
    localStorage.removeItem(storageKey(documentId));
    return;
  }
  localStorage.setItem(storageKey(documentId), JSON.stringify(annotations));
}

function emitHistoryState() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(HISTORY_EVENT, {
    detail: getAnnotationHistoryState(),
  }));
}

function emitSnapshotApplied(documentId, annotations) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SNAPSHOT_EVENT, {
    detail: {
      documentId,
      annotations: clone(annotations),
    },
  }));
}

export function getAnnotationHistoryState() {
  return {
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
  };
}

export function recordAnnotationChange(documentId, beforeAnnotations, afterAnnotations) {
  if (applyingSnapshot || !documentId) return;
  const before = clone(beforeAnnotations);
  const after = clone(afterAnnotations);

  if (sameAnnotations(before, after)) return;

  undoStack.push({
    documentId,
    before,
    after,
  });

  if (undoStack.length > MAX_HISTORY) {
    undoStack.shift();
  }

  redoStack = [];
  emitHistoryState();
}

export function clearAnnotationHistory() {
  undoStack = [];
  redoStack = [];
  emitHistoryState();
}

async function renderDocument(documentId, annotations) {
  const layers = Array.from(
    document.querySelectorAll(`[data-pdf-annotate-document="${documentId}"]`)
  );

  await Promise.all(layers.map((svg) => {
    const pageNumber = Number(svg.getAttribute('data-pdf-annotate-page') || 1);
    const viewport = JSON.parse(svg.getAttribute('data-pdf-annotate-viewport'));
    const pageAnnotations = annotations.filter((annotation) => Number(annotation.page || 1) === pageNumber);

    return renderAnnotations(svg, viewport, {
      documentId,
      pageNumber,
      annotations: pageAnnotations,
    });
  }));
}

async function applyHistorySnapshot(change, annotations) {
  applyingSnapshot = true;
  try {
    const nextAnnotations = clone(annotations);
    setStoredAnnotations(change.documentId, nextAnnotations);
    await renderDocument(change.documentId, nextAnnotations);
    emitSnapshotApplied(change.documentId, nextAnnotations);
    return {
      documentId: change.documentId,
      annotations: nextAnnotations,
    };
  } finally {
    applyingSnapshot = false;
    emitHistoryState();
  }
}

export async function undoAnnotations() {
  const change = undoStack.pop();
  if (!change) return null;

  redoStack.push(change);
  return applyHistorySnapshot(change, change.before);
}

export async function redoAnnotations() {
  const change = redoStack.pop();
  if (!change) return null;

  undoStack.push(change);
  return applyHistorySnapshot(change, change.after);
}

export function addSnapshotAppliedListener(listener) {
  window.addEventListener(SNAPSHOT_EVENT, listener);
  return () => window.removeEventListener(SNAPSHOT_EVENT, listener);
}

export function addHistoryStateListener(listener) {
  window.addEventListener(HISTORY_EVENT, listener);
  return () => window.removeEventListener(HISTORY_EVENT, listener);
}
