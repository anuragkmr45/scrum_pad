import React, { useEffect, useMemo, useRef, useState } from 'react';
import { roomStore } from '../../stores/room';
import { exportSpreadsheetDocument, getSpreadsheetState, patchSpreadsheetOperations } from '../../utils/hexscrum-api';
import { SpreadsheetDocumentMeta } from '../../utils/spreadsheet-docs';

type SpreadsheetReviewCanvasProps = {
  fileUrl: string
  meta: SpreadsheetDocumentMeta
  viewerZoom?: number
  viewerRotation?: number
}

type Selection = {
  row: number
  col: number
}

type SpreadsheetOverlayMode = 'cell' | 'draw' | 'line' | 'area' | 'ellipse' | 'text' | 'note' | 'eraser'

type OverlayPoint = {
  x: number
  y: number
}

type SpreadsheetOverlay = {
  id: string
  type: 'pen' | 'line' | 'rectangle' | 'ellipse' | 'text' | 'note'
  sheetId: string
  x?: number
  y?: number
  x2?: number
  y2?: number
  width?: number
  height?: number
  points?: OverlayPoint[]
  text?: string
  color?: string
  strokeWidth?: number
  createdAt?: string
}

const DEFAULT_FILL = '#FFF7ED';
const DEFAULT_TEXT = '#252422';
const ROW_HEADER_WIDTH = 54;
const COLUMN_HEADER_HEIGHT = 32;

function cellKey(row: number, col: number) {
  return `${row}:${col}`;
}

function columnLabel(index: number) {
  let value = '';
  let next = index + 1;
  while (next > 0) {
    const mod = (next - 1) % 26;
    value = String.fromCharCode(65 + mod) + value;
    next = Math.floor((next - mod) / 26);
  }
  return value;
}

function cloneModel(model: any) {
  try {
    return JSON.parse(JSON.stringify(model || { sheets: [] }));
  } catch (err) {
    return { sheets: [] };
  }
}

function makeOverlayId() {
  return `sheet_overlay_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeOverlayMode(tool: string): SpreadsheetOverlayMode {
  if (tool === 'draw') return 'draw';
  if (tool === 'line') return 'line';
  if (tool === 'area' || tool === 'highlight') return 'area';
  if (tool === 'ellipse') return 'ellipse';
  if (tool === 'text') return 'text';
  if (tool === 'note') return 'note';
  if (tool === 'eraser') return 'eraser';
  return 'cell';
}

function normalizeOverlay(overlay: any, sheetId: string): SpreadsheetOverlay | null {
  if (!overlay || !overlay.id) return null;
  const type = overlay.type === 'rectangle' || overlay.type === 'ellipse' || overlay.type === 'line' || overlay.type === 'text' || overlay.type === 'note'
    ? overlay.type
    : overlay.type === 'pen'
      ? 'pen'
      : null;
  if (!type) return null;
  return {
    ...overlay,
    type,
    sheetId: String(overlay.sheetId || sheetId),
    color: overlay.color || '#EB5E28',
    strokeWidth: Math.max(1, Math.min(16, Number(overlay.strokeWidth) || 2)),
  };
}

function applySpreadsheetOverlayOperation(model: any, operation: any, sheet: any) {
  sheet.overlays = Array.isArray(sheet.overlays) ? sheet.overlays : [];
  const type = String(operation.type || '');
  const overlayId = String(operation.overlayId || (operation.overlay && operation.overlay.id) || '');

  if (type === 'clearOverlays') {
    sheet.overlays = [];
    return model;
  }

  if (type === 'deleteOverlay') {
    if (!overlayId) return model;
    sheet.overlays = sheet.overlays.filter((item: any) => String(item.id) !== overlayId);
    return model;
  }

  if (type === 'addOverlay' || type === 'updateOverlay') {
    const overlay = normalizeOverlay(operation.overlay || operation, sheet.id);
    if (!overlay) return model;
    const index = sheet.overlays.findIndex((item: any) => String(item.id) === String(overlay.id));
    if (index === -1) sheet.overlays.push(overlay);
    else sheet.overlays[index] = { ...sheet.overlays[index], ...overlay };
    return model;
  }

  return model;
}

function sheetById(model: any, sheetId: string) {
  const sheets = Array.isArray(model && model.sheets) ? model.sheets : [];
  return sheets.find((sheet: any) => String(sheet.id) === String(sheetId)) || sheets[0] || null;
}

function rangeFromOperation(operation: any) {
  const range = operation.range || {};
  const startRow = Number(range.startRow !== undefined ? range.startRow : operation.row) || 0;
  const startCol = Number(range.startCol !== undefined ? range.startCol : operation.col) || 0;
  const endRow = Number(range.endRow !== undefined ? range.endRow : startRow) || startRow;
  const endCol = Number(range.endCol !== undefined ? range.endCol : startCol) || startCol;
  return {
    startRow: Math.min(startRow, endRow),
    endRow: Math.max(startRow, endRow),
    startCol: Math.min(startCol, endCol),
    endCol: Math.max(startCol, endCol),
  };
}

function applySpreadsheetOperation(model: any, operation: any) {
  const next = cloneModel(model);
  const sheet = sheetById(next, operation.sheetId);
  if (!sheet) return next;
  sheet.cells = sheet.cells || {};
  sheet.rowHeights = sheet.rowHeights || {};
  sheet.columnWidths = sheet.columnWidths || {};
  sheet.overlays = Array.isArray(sheet.overlays) ? sheet.overlays : [];

  if (operation.layer === 'overlay') {
    return applySpreadsheetOverlayOperation(next, operation, sheet);
  }

  if (operation.type === 'setRowHeight') {
    sheet.rowHeights[String(operation.row)] = operation.height;
    sheet.rowCount = Math.max(Number(sheet.rowCount) || 0, Number(operation.row) + 1);
    return next;
  }

  if (operation.type === 'setColumnWidth') {
    sheet.columnWidths[String(operation.col)] = operation.width;
    sheet.columnCount = Math.max(Number(sheet.columnCount) || 0, Number(operation.col) + 1);
    return next;
  }

  const range = rangeFromOperation(operation);
  for (let row = range.startRow; row <= range.endRow; row += 1) {
    for (let col = range.startCol; col <= range.endCol; col += 1) {
      const key = cellKey(row, col);
      const cell = sheet.cells[key] || { value: '' };
      if (operation.type === 'setCellValue') {
        cell.value = operation.value || '';
      } else if (operation.type === 'setFillColor') {
        cell.fillColor = operation.color;
      } else if (operation.type === 'setTextColor') {
        cell.textColor = operation.color;
      } else if (operation.type === 'resetCellStyle') {
        delete cell.fillColor;
        delete cell.textColor;
      }
      sheet.cells[key] = cell;
      sheet.rowCount = Math.max(Number(sheet.rowCount) || 0, row + 1);
      sheet.columnCount = Math.max(Number(sheet.columnCount) || 0, col + 1);
    }
  }
  return next;
}

function cleanExportFileName(originalName: string, format: 'pdf' | 'xlsx', serverFileName: string = '') {
  const rawName = String(originalName || serverFileName || 'spreadsheet-review').split(/[?#]/)[0];
  const baseName = (rawName || 'spreadsheet-review')
    .replace(/\.(xlsx|xls|ods|csv|pdf)$/i, '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .trim() || 'spreadsheet-review';
  return `${baseName}.${format}`;
}

function readBlobBytes(blob: Blob, byteCount: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      resolve(new Uint8Array(result instanceof ArrayBuffer ? result : new ArrayBuffer(0)));
    };
    reader.onerror = () => reject(reader.error || new Error('file_read_failed'));
    reader.readAsArrayBuffer(blob.slice(0, byteCount));
  });
}

async function validateExportBlob(blob: Blob, format: 'pdf' | 'xlsx', contentType: string = '') {
  if (!blob || blob.size < 512) {
    throw new Error(`${format.toUpperCase()} export was empty. Try again after making a cell edit.`);
  }
  if (/json|html|text/i.test(contentType)) {
    throw new Error(`${format.toUpperCase()} export returned an error response instead of a file.`);
  }

  const bytes = await readBlobBytes(blob, 4);
  if (format === 'xlsx') {
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
      throw new Error('XLSX export is invalid. Please retry the export.');
    }
    return;
  }

  if (
    bytes[0] !== 0x25 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x44 ||
    bytes[3] !== 0x46
  ) {
    throw new Error('PDF export is invalid. Please retry the export.');
  }
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const msSaveOrOpenBlob = (window.navigator as any).msSaveOrOpenBlob;
  if (typeof msSaveOrOpenBlob === 'function') {
    msSaveOrOpenBlob(blob, fileName);
    window.setTimeout(() => URL.revokeObjectURL(url), 500);
    return;
  }

  const anchor = document.createElement('a');
  const supportsDownload = 'download' in anchor;
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  anchor.target = '_blank';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  if (!supportsDownload) {
    window.open(url, '_blank', 'noopener');
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

function broadcastSpreadsheetOperation(documentId: string, operation: any, revision: number) {
  const status = operation && operation.layer === 'overlay' ? 'spreadsheet-overlay-op' : 'spreadsheet-op';
  const rendering = {
    annotations: {
      annotations: {
        operation,
        revision,
      },
      documentId,
    },
    type: 'annotation',
    status,
    annotationId: revision,
    senderUid: roomStore._state.me.uid,
  };
  try {
    roomStore.rtmClient.sendChannelMessage(JSON.stringify(rendering)).catch(() => {});
    roomStore.sendAnnotation(rendering);
  } catch (err) {}
}

const SpreadsheetReviewCanvas: React.FC<SpreadsheetReviewCanvasProps> = ({ meta, viewerZoom = 1, viewerRotation = 0 }) => {
  const [model, setModel] = useState<any>(meta.model || { sheets: [] });
  const [revision, setRevision] = useState(Number(meta.revision || 0));
  const [activeSheetId, setActiveSheetId] = useState('');
  const [selection, setSelection] = useState<Selection>({ row: 0, col: 0 });
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [overlayMode, setOverlayMode] = useState<SpreadsheetOverlayMode>('cell');
  const [overlayColor, setOverlayColor] = useState('#EB5E28');
  const [overlayStrokeWidth, setOverlayStrokeWidth] = useState(2);
  const [draftOverlay, setDraftOverlay] = useState<SpreadsheetOverlay | null>(null);
  const [textDraft, setTextDraft] = useState<{ x: number, y: number, type: 'text' | 'note', value: string } | null>(null);
  const revisionRef = useRef(0);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const fallbackModelRef = useRef(meta.model || { sheets: [] });
  const overlaySvgRef = useRef<SVGSVGElement | null>(null);
  const overlayPointerRef = useRef<{ id: number, mode: SpreadsheetOverlayMode } | null>(null);

  const activeSheet = useMemo(() => {
    const sheet = sheetById(model, activeSheetId);
    return sheet || { id: 'sheet-1', name: 'Sheet 1', rowCount: 1, columnCount: 1, cells: {}, rowHeights: {}, columnWidths: {} };
  }, [activeSheetId, model]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getSpreadsheetState(meta.workspaceId, meta.documentId)
      .then((data: any) => {
        if (cancelled) return;
        setModel(data.model || fallbackModelRef.current || { sheets: [] });
        setRevision(Number(data.revision || 0));
        const firstSheet = (data.model && data.model.sheets && data.model.sheets[0]) || null;
        setActiveSheetId((data.model && data.model.activeSheetId) || (firstSheet && firstSheet.id) || '');
      })
      .catch(() => {
        if (!cancelled) {
          const fallbackModel = fallbackModelRef.current || { sheets: [] };
          setModel(fallbackModel);
          const firstSheet = fallbackModel && fallbackModel.sheets && fallbackModel.sheets[0];
          setActiveSheetId((fallbackModel && fallbackModel.activeSheetId) || (firstSheet && firstSheet.id) || '');
          setStatus('Spreadsheet state could not be loaded. Showing upload-time data.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  // Freeze upload-time fallback data; refetch only when the actual document target changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.documentId, meta.workspaceId]);

  useEffect(() => {
    revisionRef.current = revision;
  }, [revision]);

  useEffect(() => {
    const handler = (event: any) => {
      const detail = event.detail || {};
      if (String(detail.documentId) !== String(meta.documentId)) return;
      const operation = detail.operation || (detail.payload && detail.payload.operation);
      if (!operation) return;
      setModel((current: any) => applySpreadsheetOperation(current, operation));
      if (detail.revision) setRevision(Number(detail.revision));
    };
    window.addEventListener('hexscrum:spreadsheet-op', handler);
    window.addEventListener('hexscrum:spreadsheet-overlay-op', handler);
    return () => {
      window.removeEventListener('hexscrum:spreadsheet-op', handler);
      window.removeEventListener('hexscrum:spreadsheet-overlay-op', handler);
    };
  }, [meta.documentId]);

  useEffect(() => {
    const handler = (event: any) => {
      const detail = event.detail || {};
      const nextMode = normalizeOverlayMode(String(detail.tool || 'cell'));
      setOverlayMode(nextMode);
      if (detail.color) setOverlayColor(detail.color);
      if (detail.thickness) setOverlayStrokeWidth(Math.max(1, Math.min(16, Number(detail.thickness) || 2)));
    };
    window.addEventListener('hexscrum:tool-change', handler);
    return () => window.removeEventListener('hexscrum:tool-change', handler);
  }, []);

  const commitOperation = (operation: any) => {
    setModel((current: any) => applySpreadsheetOperation(current, operation));
    setStatus('Saving...');

    const save = saveQueue.current
      .then(async () => {
        const result = await patchSpreadsheetOperations(meta.workspaceId, meta.documentId, [operation]);
        const nextRevision = Number(result.revision || revisionRef.current + 1);
        revisionRef.current = nextRevision;
        setRevision(nextRevision);
        broadcastSpreadsheetOperation(meta.documentId, operation, nextRevision);
        setStatus('Saved');
      })
      .catch((err) => {
        setStatus(err instanceof Error ? err.message : 'Save failed');
      });

    saveQueue.current = save.then(() => undefined, () => undefined);
    return save;
  };

  useEffect(() => {
    const handler = (event: any) => {
      const detail = event.detail || {};
      if (detail.documentId && String(detail.documentId) !== String(meta.documentId)) return;
      if (!activeSheet.id) return;
      commitOperation({
        layer: 'overlay',
        type: 'clearOverlays',
        sheetId: activeSheet.id,
      });
    };
    window.addEventListener('hexscrum:clear-spreadsheet-overlays', handler);
    return () => window.removeEventListener('hexscrum:clear-spreadsheet-overlays', handler);
  // Rebind when the active sheet changes so the sidebar clear action targets the visible sheet.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSheet.id, meta.documentId]);

  const selectedCell = (activeSheet.cells && activeSheet.cells[cellKey(selection.row, selection.col)]) || {};
  const rowCount = Math.max(1, Math.min(400, Number(activeSheet.rowCount) || 1));
  const columnCount = Math.max(1, Math.min(80, Number(activeSheet.columnCount) || 1));
  const rows = Array.from({ length: rowCount }, (_, index) => index);
  const cols = Array.from({ length: columnCount }, (_, index) => index);
  const columnWidthAt = (col: number) => Number((activeSheet.columnWidths || {})[String(col)] || 112);
  const rowHeightAt = (row: number) => Number((activeSheet.rowHeights || {})[String(row)] || 28);
  const gridWidth = ROW_HEADER_WIDTH + cols.reduce((sum, col) => sum + columnWidthAt(col), 0);
  const gridHeight = COLUMN_HEADER_HEIGHT + rows.reduce((sum, row) => sum + rowHeightAt(row), 0);
  const overlays = (Array.isArray(activeSheet.overlays) ? activeSheet.overlays : [])
    .filter((overlay: any) => String(overlay.sheetId || activeSheet.id) === String(activeSheet.id));

  const setSelectedFill = (color: string) => commitOperation({
    type: 'setFillColor',
    sheetId: activeSheet.id,
    row: selection.row,
    col: selection.col,
    color,
  });

  const setSelectedTextColor = (color: string) => commitOperation({
    type: 'setTextColor',
    sheetId: activeSheet.id,
    row: selection.row,
    col: selection.col,
    color,
  });

  const adjustSelectedRowHeight = (delta: number) => {
    const current = Number((activeSheet.rowHeights || {})[String(selection.row)] || 28);
    commitOperation({
      type: 'setRowHeight',
      sheetId: activeSheet.id,
      row: selection.row,
      height: Math.max(18, Math.min(140, current + delta)),
    });
  };

  const adjustSelectedColumnWidth = (delta: number) => {
    const current = Number((activeSheet.columnWidths || {})[String(selection.col)] || 112);
    commitOperation({
      type: 'setColumnWidth',
      sheetId: activeSheet.id,
      col: selection.col,
      width: Math.max(48, Math.min(420, current + delta)),
    });
  };

  const exportEditedSpreadsheet = async (format: 'pdf' | 'xlsx') => {
    setStatus(`Exporting ${format.toUpperCase()}...`);
    try {
      const result = await exportSpreadsheetDocument(meta.workspaceId, meta.documentId, format);
      await validateExportBlob(result.blob, format, result.contentType);
      downloadBlob(result.blob, cleanExportFileName(meta.originalName || '', format, result.fileName));
      setStatus(`${format.toUpperCase()} export ready`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Export failed');
    }
  };

  const getOverlayPoint = (event: React.PointerEvent<SVGSVGElement>): OverlayPoint | null => {
    const svg = overlaySvgRef.current;
    if (!svg) return null;
    try {
      const point = svg.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      const matrix = svg.getScreenCTM();
      if (matrix) {
        const transformed = point.matrixTransform(matrix.inverse());
        return {
          x: Math.max(0, Math.min(gridWidth, transformed.x)),
          y: Math.max(0, Math.min(gridHeight, transformed.y)),
        };
      }
    } catch (err) {}
    const rect = svg.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(gridWidth, ((event.clientX - rect.left) / Math.max(1, rect.width)) * gridWidth)),
      y: Math.max(0, Math.min(gridHeight, ((event.clientY - rect.top) / Math.max(1, rect.height)) * gridHeight)),
    };
  };

  const overlayBounds = (overlay: SpreadsheetOverlay) => {
    if (overlay.type === 'pen' && overlay.points && overlay.points.length) {
      const xs = overlay.points.map((point) => Number(point.x) || 0);
      const ys = overlay.points.map((point) => Number(point.y) || 0);
      return {
        left: Math.min(...xs),
        right: Math.max(...xs),
        top: Math.min(...ys),
        bottom: Math.max(...ys),
      };
    }
    const x = Number(overlay.x || 0);
    const y = Number(overlay.y || 0);
    const x2 = overlay.x2 !== undefined ? Number(overlay.x2) : x + Number(overlay.width || 0);
    const y2 = overlay.y2 !== undefined ? Number(overlay.y2) : y + Number(overlay.height || 0);
    return {
      left: Math.min(x, x2),
      right: Math.max(x, x2),
      top: Math.min(y, y2),
      bottom: Math.max(y, y2),
    };
  };

  const findOverlayAtPoint = (point: OverlayPoint) => {
    const padding = 10;
    for (let index = overlays.length - 1; index >= 0; index -= 1) {
      const overlay = overlays[index];
      const bounds = overlayBounds(overlay);
      if (
        point.x >= bounds.left - padding &&
        point.x <= bounds.right + padding &&
        point.y >= bounds.top - padding &&
        point.y <= bounds.bottom + padding
      ) {
        return overlay;
      }
    }
    return null;
  };

  const commitOverlay = (overlay: SpreadsheetOverlay) => commitOperation({
    layer: 'overlay',
    type: 'addOverlay',
    sheetId: activeSheet.id,
    overlay,
  });

  const deleteOverlay = (overlayId: string) => commitOperation({
    layer: 'overlay',
    type: 'deleteOverlay',
    sheetId: activeSheet.id,
    overlayId,
  });

  const startOverlayPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    if (overlayMode === 'cell') return;
    const point = getOverlayPoint(event);
    if (!point) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    overlayPointerRef.current = { id: event.pointerId, mode: overlayMode };

    if (overlayMode === 'eraser') {
      const target = findOverlayAtPoint(point);
      if (target && target.id) deleteOverlay(target.id);
      setDraftOverlay(null);
      return;
    }

    if (overlayMode === 'text' || overlayMode === 'note') {
      setTextDraft({ x: point.x, y: point.y, type: overlayMode, value: '' });
      setDraftOverlay(null);
      return;
    }

    const nextType = overlayMode === 'draw'
      ? 'pen'
      : overlayMode === 'area'
        ? 'rectangle'
        : overlayMode;
    setDraftOverlay({
      id: makeOverlayId(),
      type: nextType as SpreadsheetOverlay['type'],
      sheetId: activeSheet.id,
      x: point.x,
      y: point.y,
      x2: point.x,
      y2: point.y,
      width: 0,
      height: 0,
      points: nextType === 'pen' ? [point] : undefined,
      color: overlayColor,
      strokeWidth: overlayStrokeWidth,
      createdAt: new Date().toISOString(),
    });
  };

  const moveOverlayPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const pointer = overlayPointerRef.current;
    if (!pointer || pointer.id !== event.pointerId || !draftOverlay) return;
    const point = getOverlayPoint(event);
    if (!point) return;
    event.preventDefault();
    setDraftOverlay((current) => {
      if (!current) return current;
      if (current.type === 'pen') {
        return {
          ...current,
          points: [...(current.points || []), point],
        };
      }
      const x = Number(current.x || 0);
      const y = Number(current.y || 0);
      return {
        ...current,
        x2: point.x,
        y2: point.y,
        width: Math.abs(point.x - x),
        height: Math.abs(point.y - y),
      };
    });
  };

  const finishOverlayPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const pointer = overlayPointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch (err) {}
    overlayPointerRef.current = null;
    if (!draftOverlay || draftOverlay.type === 'text' || draftOverlay.type === 'note') return;
    const bounds = overlayBounds(draftOverlay);
    if (draftOverlay.type !== 'pen' && Math.abs(bounds.right - bounds.left) < 2 && Math.abs(bounds.bottom - bounds.top) < 2) {
      setDraftOverlay(null);
      return;
    }
    commitOverlay(draftOverlay);
    setDraftOverlay(null);
  };

  const commitTextDraft = () => {
    if (!textDraft || !textDraft.value.trim()) {
      setTextDraft(null);
      return;
    }
    commitOverlay({
      id: makeOverlayId(),
      type: textDraft.type,
      sheetId: activeSheet.id,
      x: textDraft.x,
      y: textDraft.y,
      text: textDraft.value.trim(),
      color: overlayColor,
      strokeWidth: overlayStrokeWidth,
      createdAt: new Date().toISOString(),
    });
    setTextDraft(null);
  };

  const renderOverlay = (overlay: SpreadsheetOverlay, isDraft = false) => {
    const stroke = overlay.color || overlayColor;
    const strokeWidth = Number(overlay.strokeWidth || overlayStrokeWidth || 2);
    const opacity = isDraft ? 0.68 : 1;
    if (overlay.type === 'pen') {
      const points = overlay.points || [];
      if (!points.length) return null;
      const d = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${Number(point.x) || 0} ${Number(point.y) || 0}`).join(' ');
      return <path key={overlay.id} d={d} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" opacity={opacity} />;
    }
    if (overlay.type === 'line') {
      return <line key={overlay.id} x1={overlay.x || 0} y1={overlay.y || 0} x2={overlay.x2 || overlay.x || 0} y2={overlay.y2 || overlay.y || 0} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" opacity={opacity} />;
    }
    if (overlay.type === 'rectangle') {
      const bounds = overlayBounds(overlay);
      return <rect key={overlay.id} x={bounds.left} y={bounds.top} width={bounds.right - bounds.left} height={bounds.bottom - bounds.top} fill="rgba(235, 94, 40, 0.08)" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />;
    }
    if (overlay.type === 'ellipse') {
      const bounds = overlayBounds(overlay);
      return <ellipse key={overlay.id} cx={(bounds.left + bounds.right) / 2} cy={(bounds.top + bounds.bottom) / 2} rx={Math.max(1, (bounds.right - bounds.left) / 2)} ry={Math.max(1, (bounds.bottom - bounds.top) / 2)} fill="rgba(235, 94, 40, 0.08)" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />;
    }
    if (overlay.type === 'text' || overlay.type === 'note') {
      return (
        <text key={overlay.id} x={overlay.x || 0} y={overlay.y || 0} fill={stroke} fontSize="16" fontWeight={overlay.type === 'note' ? 700 : 600} opacity={opacity}>
          {overlay.text || ''}
        </text>
      );
    }
    return null;
  };

  const normalizedZoom = Math.min(2.75, Math.max(0.5, Number(viewerZoom) || 1));
  const normalizedRotation = ((Number(viewerRotation) || 0) % 360 + 360) % 360;
  const frameStyle = {
    '--spreadsheet-viewer-zoom': normalizedZoom,
    '--spreadsheet-viewer-rotation': `${normalizedRotation}deg`,
  } as React.CSSProperties;

  return (
    <div className={`spreadsheet-review-frame rotation-${normalizedRotation}`} style={frameStyle}>
    <div className="spreadsheet-review-canvas" data-document-id={meta.documentId}>
      <div className="spreadsheet-review-toolbar">
        <div>
          <strong>{meta.originalName || 'Spreadsheet review'}</strong>
          <span>Cell {columnLabel(selection.col)}{selection.row + 1} · Rev {revision}</span>
        </div>
        <label>
          Fill
          <input type="color" value={selectedCell.fillColor || DEFAULT_FILL} onChange={(event) => setSelectedFill(event.target.value)} />
        </label>
        <label>
          Text
          <input type="color" value={selectedCell.textColor || DEFAULT_TEXT} onChange={(event) => setSelectedTextColor(event.target.value)} />
        </label>
        <button type="button" onClick={() => adjustSelectedColumnWidth(-16)}>Col -</button>
        <button type="button" onClick={() => adjustSelectedColumnWidth(16)}>Col +</button>
        <button type="button" onClick={() => adjustSelectedRowHeight(-8)}>Row -</button>
        <button type="button" onClick={() => adjustSelectedRowHeight(8)}>Row +</button>
        <button type="button" onClick={() => commitOperation({ type: 'resetCellStyle', sheetId: activeSheet.id, row: selection.row, col: selection.col })}>Reset</button>
        <button type="button" onClick={() => exportEditedSpreadsheet('pdf')}>PDF</button>
        <button type="button" onClick={() => exportEditedSpreadsheet('xlsx')}>XLSX</button>
      </div>

      <div className="spreadsheet-overlay-toolbar" aria-label="Spreadsheet review modes">
        {[
          ['cell', 'Cell'],
          ['draw', 'Pen'],
          ['area', 'Rect'],
          ['line', 'Line'],
          ['ellipse', 'Ellipse'],
          ['text', 'Text'],
          ['note', 'Note'],
          ['eraser', 'Erase'],
        ].map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            className={overlayMode === mode ? 'active' : ''}
            onClick={() => setOverlayMode(mode as SpreadsheetOverlayMode)}
          >
            {label}
          </button>
        ))}
        <label>
          Ink
          <input type="color" value={overlayColor} onChange={(event) => setOverlayColor(event.target.value)} />
        </label>
        <label>
          Size
          <input type="range" min="1" max="12" value={overlayStrokeWidth} onChange={(event) => setOverlayStrokeWidth(Number(event.target.value))} />
        </label>
      </div>

      <div className="spreadsheet-sheet-tabs">
        {(model.sheets || []).map((sheet: any) => (
          <button
            key={sheet.id}
            type="button"
            className={String(sheet.id) === String(activeSheet.id) ? 'active' : ''}
            onClick={() => setActiveSheetId(sheet.id)}
          >
            {sheet.name || sheet.id}
          </button>
        ))}
      </div>

      <div className="spreadsheet-status">{loading ? 'Loading spreadsheet...' : status}</div>
      <div className="spreadsheet-grid-scroll">
        <div className="spreadsheet-grid-stage" style={{ width: gridWidth, minHeight: gridHeight }}>
        <table className="spreadsheet-grid" style={{ width: gridWidth }}>
          <thead>
            <tr>
              <th className="corner-cell"></th>
              {cols.map((col) => (
                <th
                  key={col}
                  style={{ width: Number((activeSheet.columnWidths || {})[String(col)] || 112) }}
                  onClick={() => setSelection({ row: selection.row, col })}
                >
                  {columnLabel(col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row} style={{ height: Number((activeSheet.rowHeights || {})[String(row)] || 28) }}>
                <th onClick={() => setSelection({ row, col: selection.col })}>{row + 1}</th>
                {cols.map((col) => {
                  const key = cellKey(row, col);
                  const cell = (activeSheet.cells && activeSheet.cells[key]) || {};
                  const selected = row === selection.row && col === selection.col;
                  return (
                    <td
                      key={key}
                      className={selected ? 'selected' : ''}
                      style={{
                        width: Number((activeSheet.columnWidths || {})[String(col)] || 112),
                        backgroundColor: cell.fillColor || '#FFFCF2',
                        color: cell.textColor || '#252422',
                      }}
                      onClick={() => setSelection({ row, col })}
                    >
                      <input
                        key={`${key}:${cell.value || ''}`}
                        defaultValue={cell.value || ''}
                        style={{ color: cell.textColor || '#252422' }}
                        onFocus={() => setSelection({ row, col })}
                        onBlur={(event) => {
                          if (event.currentTarget.value !== (cell.value || '')) {
                            commitOperation({
                              type: 'setCellValue',
                              sheetId: activeSheet.id,
                              row,
                              col,
                              value: event.currentTarget.value,
                            });
                          }
                        }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <svg
          ref={overlaySvgRef}
          className={`spreadsheet-overlay-layer mode-${overlayMode}`}
          width={gridWidth}
          height={gridHeight}
          viewBox={`0 0 ${gridWidth} ${gridHeight}`}
          onPointerDown={startOverlayPointer}
          onPointerMove={moveOverlayPointer}
          onPointerUp={finishOverlayPointer}
          onPointerCancel={finishOverlayPointer}
        >
          {overlays.map((overlay: SpreadsheetOverlay) => renderOverlay(overlay))}
          {draftOverlay ? renderOverlay(draftOverlay, true) : null}
        </svg>
        {textDraft ?
          <textarea
            className="spreadsheet-overlay-text-editor"
            style={{ left: textDraft.x, top: textDraft.y }}
            autoFocus
            value={textDraft.value}
            onChange={(event) => setTextDraft({ ...textDraft, value: event.target.value })}
            onBlur={commitTextDraft}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                commitTextDraft();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                setTextDraft(null);
              }
            }}
            placeholder={textDraft.type === 'note' ? 'Note' : 'Text'}
          /> : null}
        </div>
      </div>
    </div>
    </div>
  );
};

export default SpreadsheetReviewCanvas;
