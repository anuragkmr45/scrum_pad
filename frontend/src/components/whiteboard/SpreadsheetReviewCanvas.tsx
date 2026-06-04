import React, { useEffect, useMemo, useRef, useState } from 'react';
import { roomStore } from '../../stores/room';
import { exportSpreadsheetDocument, getSpreadsheetState, patchSpreadsheetOperations } from '../../utils/hexscrum-api';
import { SpreadsheetDocumentMeta } from '../../utils/spreadsheet-docs';

type SpreadsheetReviewCanvasProps = {
  fileUrl: string
  meta: SpreadsheetDocumentMeta
}

type Selection = {
  row: number
  col: number
}

const DEFAULT_FILL = '#FFF7ED';
const DEFAULT_TEXT = '#252422';

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

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

function broadcastSpreadsheetOperation(documentId: string, operation: any, revision: number) {
  const rendering = {
    annotations: {
      annotations: {
        operation,
        revision,
      },
      documentId,
    },
    type: 'annotation',
    status: 'spreadsheet-op',
    annotationId: revision,
    senderUid: roomStore._state.me.uid,
  };
  try {
    roomStore.rtmClient.sendChannelMessage(JSON.stringify(rendering)).catch(() => {});
    roomStore.sendAnnotation(rendering);
  } catch (err) {}
}

const SpreadsheetReviewCanvas: React.FC<SpreadsheetReviewCanvasProps> = ({ meta }) => {
  const [model, setModel] = useState<any>(meta.model || { sheets: [] });
  const [revision, setRevision] = useState(Number(meta.revision || 0));
  const [activeSheetId, setActiveSheetId] = useState('');
  const [selection, setSelection] = useState<Selection>({ row: 0, col: 0 });
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const revisionRef = useRef(0);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const fallbackModelRef = useRef(meta.model || { sheets: [] });

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
    return () => window.removeEventListener('hexscrum:spreadsheet-op', handler);
  }, [meta.documentId]);

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

  const selectedCell = (activeSheet.cells && activeSheet.cells[cellKey(selection.row, selection.col)]) || {};
  const rowCount = Math.max(1, Math.min(400, Number(activeSheet.rowCount) || 1));
  const columnCount = Math.max(1, Math.min(80, Number(activeSheet.columnCount) || 1));
  const rows = Array.from({ length: rowCount }, (_, index) => index);
  const cols = Array.from({ length: columnCount }, (_, index) => index);

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
      const blob = await exportSpreadsheetDocument(meta.workspaceId, meta.documentId, format);
      downloadBlob(blob, `${meta.originalName || 'spreadsheet-review'}.${format}`);
      setStatus('Export ready');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Export failed');
    }
  };

  return (
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
        <table className="spreadsheet-grid">
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
      </div>
    </div>
  );
};

export default SpreadsheetReviewCanvas;
