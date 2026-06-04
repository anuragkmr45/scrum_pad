const REGISTRY_KEY = 'hexscrum_spreadsheet_documents';

export type SpreadsheetDocumentMeta = {
  fileUrl: string
  documentId: string
  workspaceId: string
  originalName?: string
  revision?: number
  model?: any
}

function readRegistry(): { [fileUrl: string]: SpreadsheetDocumentMeta } {
  try {
    const value = window.localStorage.getItem(REGISTRY_KEY);
    return value ? JSON.parse(value) : {};
  } catch (err) {
    return {};
  }
}

function writeRegistry(registry: { [fileUrl: string]: SpreadsheetDocumentMeta }) {
  try {
    window.localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
  } catch (err) {}
}

export function registerSpreadsheetDocument(fileUrl: string, meta: Partial<SpreadsheetDocumentMeta>) {
  if (!fileUrl || !meta.documentId) return null;
  const registry = readRegistry();
  const next = {
    ...(registry[fileUrl] || {}),
    ...meta,
    fileUrl,
  } as SpreadsheetDocumentMeta;
  registry[fileUrl] = next;
  writeRegistry(registry);
  return next;
}

export function getSpreadsheetDocument(fileUrl: string) {
  if (!fileUrl || typeof fileUrl !== 'string') return null;
  return readRegistry()[fileUrl] || null;
}

export function registerSpreadsheetDocumentFromUpload(upload: any) {
  if (!upload || !upload.spreadsheet || !upload.spreadsheet.documentId) return null;
  const fileUrl = upload.secure_url || upload.url || upload.backend_file_url || '';
  return registerSpreadsheetDocument(fileUrl, {
    documentId: upload.spreadsheet.documentId,
    workspaceId: upload.spreadsheet.workspaceId,
    originalName: upload.originalName,
    revision: upload.spreadsheet.revision || 0,
    model: upload.spreadsheet.model,
  });
}

export function registerSpreadsheetDocumentFromWorkspaceDocument(document: any) {
  if (!document || !document.id) return null;
  const metadata = document.metadata || {};
  const kind = metadata.documentKind || metadata.document_kind || '';
  const editable = Boolean(metadata.spreadsheetEditable || metadata.spreadsheet_editable);
  if (kind !== 'spreadsheet' || !editable) return null;
  const fileUrl = document.converted_pdf_url || document.convertedPdfUrl || document.storage_url || document.storageUrl || '';
  return registerSpreadsheetDocument(fileUrl, {
    documentId: document.id,
    workspaceId: document.workspace_id || document.workspaceId || '',
    originalName: document.original_file_name || document.originalFileName || '',
  });
}
