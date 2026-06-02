import React, { useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import {
  generateArchive,
  getAnnotationHistory,
  getAnnotationTimeline,
  getBackendBaseUrl,
  getCurrentUser,
  getHexscrumProfile,
  getMeetingNotes,
  getUserWiseReport,
  getWorkspaceId,
  saveMeetingNote,
  setWorkspaceId,
} from '../utils/hexscrum-api';

function downloadFile(fileName: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.URL.revokeObjectURL(url);
}

function csvEscape(value: any) {
  const text = value === undefined || value === null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function htmlEscape(value: any) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function workspaceCodeFromId(workspaceId: string) {
  return String(workspaceId || '').replace(/^workspace-/, '').toUpperCase() || 'No workspace selected';
}

function workspaceIdFromInput(value: string) {
  const trimmed = String(value || '').trim().toLowerCase();
  if (!trimmed) return '';
  const compact = trimmed.replace(/^workspace-/, '').replace(/[^a-z0-9]/g, '');
  return compact ? `workspace-${compact}` : '';
}

function shortId(value: any) {
  const text = value === undefined || value === null ? '' : String(value);
  if (!text) return '-';
  if (text.startsWith('workspace-')) return workspaceCodeFromId(text);
  return text.length > 18 ? `${text.slice(0, 8)}...${text.slice(-5)}` : text;
}

function formatDateTime(value: any) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function formatCountMap(value: any) {
  if (!value) return '-';
  const data = typeof value === 'string' ? (() => {
    try {
      return JSON.parse(value);
    } catch (err) {
      return value;
    }
  })() : value;

  if (!data || typeof data !== 'object') return String(data || '-');
  const entries = Object.entries(data);
  if (!entries.length) return '-';
  return entries.map(([key, count]) => `${key}: ${count}`).join(', ');
}

function contributorKey(row: any) {
  return row.userId || row.userName || 'unknown';
}

function contributorName(row: any) {
  return row.userName || 'Unknown contributor';
}

function humanizeEvent(value: any) {
  return String(value || 'event').replace(/[_-]+/g, ' ');
}

function toCsv(rows: any[], columns: string[]) {
  return [
    columns.map(csvEscape).join(','),
    ...rows.map(row => columns.map(column => csvEscape(row[column])).join(',')),
  ].join('\n');
}

function notesAsHtml(notes: any[]) {
  const rows = notes.map(note => (
    `<article><h2>${htmlEscape(note.author_name || note.authorName || 'Unknown')}</h2><time>${htmlEscape(note.created_at || '')}</time><p>${htmlEscape(note.body || '').replace(/\n/g, '<br />')}</p></article>`
  ));
  return `<!doctype html><html><head><meta charset="utf-8"><title>HexScrum Meeting Notes</title></head><body>${rows.join('')}</body></html>`;
}

function actionErrorMessage(err: any) {
  if (!err) return 'Action failed.';
  if (err.status === 401) return 'Login session expired. Please login again.';
  if (err.message === 'backend_url_missing') return 'Missing converter API URL. Set REACT_APP_LIBRE_BACKEND_URL.';
  if (err.message === 'Failed to fetch') return 'Converter API is not reachable. Check backend health and CORS.';
  return err.message || 'Action failed.';
}

function WorkspaceTools() {
  document.title = 'HexScrum Notes & Reports';

  const routerHistory = useHistory();
  const currentUser = getCurrentUser();
  const profile = getHexscrumProfile();
  const [workspaceId, updateWorkspaceId] = useState<string>(getWorkspaceId());
  const [noteBody, setNoteBody] = useState<string>('');
  const [notes, setNotes] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string>('');
  const [annotationTimeline, setAnnotationTimeline] = useState<any[]>([]);
  const [userReport, setUserReport] = useState<any[]>([]);
  const [selectedContributor, setSelectedContributor] = useState<string>('all');
  const [archive, setArchive] = useState<any>(null);
  const [status, setStatus] = useState<string>('');
  const backendUrl = getBackendBaseUrl();

  useEffect(() => {
    const root = document.documentElement;
    document.body.classList.remove('touch-action-disable');
    root.classList.add('workspace-tools-scroll-enabled');
    document.body.classList.add('workspace-tools-scroll-enabled');

    return () => {
      root.classList.remove('workspace-tools-scroll-enabled');
      document.body.classList.remove('workspace-tools-scroll-enabled');
    };
  }, []);

  useEffect(() => {
    if (!currentUser) {
      routerHistory.push('/');
    }
  }, [currentUser, routerHistory]);

  const rememberWorkspace = (value: string) => {
    const normalized = workspaceIdFromInput(value);
    updateWorkspaceId(normalized);
    setWorkspaceId(normalized);
    setStatus(normalized ? `Selected ${workspaceCodeFromId(normalized)}` : 'Enter a workspace code first.');
  };

  const canUseBackend = () => {
    if (!backendUrl) {
      setStatus('Missing converter API URL. Set REACT_APP_LIBRE_BACKEND_URL.');
      return false;
    }
    return true;
  };

  const canUseWorkspace = () => {
    if (!workspaceId) {
      setStatus('Enter or select a workspace code first.');
      return false;
    }
    return true;
  };

  const loadNotes = () => {
    if (!canUseBackend() || !canUseWorkspace()) return;
    setStatus('Loading meeting notes...');
    getMeetingNotes(workspaceId)
      .then((data: any) => {
        setNotes(data.notes || []);
        setStatus(`Loaded ${(data.notes || []).length} meeting notes.`);
      })
      .catch((err: any) => setStatus(actionErrorMessage(err)));
  };

  const loadHistory = () => {
    if (!canUseBackend() || !canUseWorkspace()) return;
    setStatus('Loading annotation history...');
    getAnnotationHistory(workspaceId)
      .then((data: any) => {
        setHistory(data.report || []);
        setStatus(`Loaded ${(data.report || []).length} annotation events.`);
      })
      .catch((err: any) => setStatus(actionErrorMessage(err)));
  };

  const loadAnnotationTimeline = (annotationId: string) => {
    if (!canUseBackend() || !canUseWorkspace()) return;
    if (!annotationId) {
      setStatus('This event does not have an annotation id.');
      return;
    }
    setSelectedAnnotationId(annotationId);
    getAnnotationTimeline(workspaceId, annotationId)
      .then((data: any) => {
        setAnnotationTimeline(data.events || []);
        setStatus((data.events || []).length ? 'Timeline loaded' : 'No timeline found for this annotation.');
      })
      .catch((err: any) => setStatus(actionErrorMessage(err)));
  };

  const loadUserReport = () => {
    if (!canUseBackend() || !canUseWorkspace()) return;
    setStatus('Loading user-wise report...');
    getUserWiseReport(workspaceId)
      .then((data: any) => {
        setUserReport(data.report || []);
        setStatus(`Loaded ${(data.report || []).length} user report rows.`);
      })
      .catch((err: any) => setStatus(actionErrorMessage(err)));
  };

  useEffect(() => {
    if (!workspaceId || !backendUrl) return;
    loadNotes();
    loadHistory();
    loadUserReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, backendUrl]);

  const handleSaveNote = () => {
    if (!canUseBackend() || !canUseWorkspace()) return;
    if (!noteBody.trim()) {
      setStatus('Write a meeting note before saving.');
      return;
    }
    setStatus('Saving meeting note...');
    saveMeetingNote({
      workspaceId,
      authorUserId: profile.userId,
      authorName: profile.name,
      body: noteBody.trim(),
    })
      .then(() => {
        setNoteBody('');
        setStatus('Saved');
        loadNotes();
      })
      .catch((err: any) => setStatus(actionErrorMessage(err)));
  };

  const handleArchive = () => {
    if (!canUseBackend() || !canUseWorkspace()) return;
    setStatus('Generating meeting archive...');
    generateArchive({
      workspaceId,
      requestedByUserId: profile.userId,
    })
      .then((data: any) => {
        setArchive(data.manifest);
        setStatus('Archive generated');
      })
      .catch((err: any) => setStatus(actionErrorMessage(err)));
  };

  const handleDownload = (fileName: string, content: string, type: string, label: string) => {
    downloadFile(fileName, content, type);
    setStatus(`${label} download started.`);
  };

  const historyColumns = ['timestamp', 'userName', 'userDesignation', 'action', 'toolType', 'pageNumber', 'annotationId', 'documentId'];
  const userColumns = ['userName', 'designation', 'total', 'byAction', 'byTool', 'byPage'];
  const historyColumnLabels: { [key: string]: string } = {
    timestamp: 'Time',
    userName: 'Contributor',
    userDesignation: 'Designation',
    action: 'Action',
    toolType: 'Tool',
    pageNumber: 'Page',
    annotationId: 'Annotation',
    documentId: 'Document',
  };
  const userColumnLabels: { [key: string]: string } = {
    userName: 'Contributor',
    designation: 'Designation',
    total: 'Events',
    byAction: 'Actions',
    byTool: 'Tools',
    byPage: 'Pages',
  };
  const workspaceCode = workspaceCodeFromId(workspaceId);
  const contributorsByKey = history.reduce((items: { [key: string]: any }, row: any) => {
    const key = contributorKey(row);
    if (!items[key]) {
      items[key] = {
        key,
        userName: contributorName(row),
        userDesignation: row.userDesignation || '',
        userColor: row.userColor || '#EB5E28',
        total: 0,
      };
    }
    items[key].total += 1;
    return items;
  }, {});
  const contributors = Object.values(contributorsByKey);
  const filteredHistory = selectedContributor === 'all'
    ? history
    : history.filter((row: any) => contributorKey(row) === selectedContributor);
  const formatHistoryValue = (row: any, column: string) => {
    if (column === 'timestamp') return formatDateTime(row[column]);
    if (column === 'annotationId' || column === 'documentId') return shortId(row[column]);
    if (column === 'toolType') return row[column] || 'canvas';
    if (column === 'pageNumber') return row[column] || 1;
    return row[column] || '-';
  };
  const summary = [
    { label: 'Meeting notes', value: notes.length },
    { label: 'Annotation events', value: history.length },
    { label: 'Contributors', value: userReport.length },
    { label: 'Archive', value: archive ? 'Ready' : 'Pending' },
  ];

  return (
    <div className="workspace-tools-page">
      <header className="workspace-tools-header">
        <div>
          <span className="eyebrow">Audit & export center</span>
          <h1>Workspace documentation</h1>
          <span>{profile.name || 'Local User'} {profile.designation ? `- ${profile.designation}` : ''}</span>
        </div>
        <button className="workspace-tools-back" type="button" onClick={() => routerHistory.push('/')}>Back</button>
      </header>

      {!backendUrl ? <p className="setup-warning">Missing REACT_APP_LIBRE_BACKEND_URL.</p> : null}
      {status ? <p className="status-line">{status}</p> : null}

      <section className="workspace-tools-section">
        <label htmlFor="workspaceId">Workspace code or selected workspace</label>
        <input id="workspaceId" value={workspaceId} onChange={(evt: any) => rememberWorkspace(evt.target.value)} />
        <div className="workspace-context-card">
          <span>Selected workspace</span>
          <strong>{workspaceCode}</strong>
          <p>Use History from a workspace card to open this page with the correct workspace. The reports below show contributors, actions, page activity, documents, notes, and export archive data.</p>
        </div>
      </section>

      <section className="workspace-summary-grid" aria-label="Workspace summary">
        {summary.map(item => (
          <article key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </article>
        ))}
      </section>

      <section className="workspace-feature-strip" aria-label="Available exports">
        <span>User-wise ownership</span>
        <span>Name and designation tags</span>
        <span>Timestamps</span>
        <span>Annotation history</span>
        <span>Meeting archive</span>
      </section>

      <section className="workspace-tools-section">
        <h2>Meeting Notes</h2>
        <textarea value={noteBody} onChange={(evt: any) => setNoteBody(evt.target.value)} />
        <div className="tool-actions">
          <button type="button" onClick={handleSaveNote}>Save Note</button>
          <button type="button" onClick={loadNotes}>Refresh</button>
          <button type="button" onClick={() => handleDownload('hexscrum-meeting-notes.html', notesAsHtml(notes), 'text/html', 'Meeting notes HTML')}>Export HTML</button>
          <button type="button" onClick={() => handleDownload('hexscrum-meeting-notes.json', JSON.stringify(notes, null, 2), 'application/json', 'Meeting notes JSON')}>Export JSON</button>
        </div>
        <ul className="notes-list">
          {notes.map(note => (
            <li key={note.id}>
              <strong>{note.author_name || note.authorName || 'Unknown'}</strong>
              <span>{note.created_at || ''}</span>
              <p>{note.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="workspace-tools-section">
        <h2>Annotation History</h2>
        <div className="tool-actions">
          <button type="button" onClick={loadHistory}>Refresh</button>
          <button type="button" onClick={() => handleDownload('hexscrum-annotation-history.csv', toCsv(filteredHistory, historyColumns), 'text/csv', 'Annotation history CSV')}>Export CSV</button>
          <button type="button" onClick={() => handleDownload('hexscrum-annotation-history.json', JSON.stringify(filteredHistory, null, 2), 'application/json', 'Annotation history JSON')}>Export JSON</button>
        </div>
        <div className="contributor-filter-row" aria-label="Filter annotation history by contributor">
          <button
            className={selectedContributor === 'all' ? 'active' : ''}
            onClick={() => setSelectedContributor('all')}
          >
            <span>All contributors</span>
            <strong>{history.length}</strong>
          </button>
          {contributors.map((contributor: any) => (
            <button
              key={contributor.key}
              className={selectedContributor === contributor.key ? 'active' : ''}
              onClick={() => setSelectedContributor(contributor.key)}
            >
              <i style={{ background: contributor.userColor || '#EB5E28' }} />
              <span>{contributor.userName}</span>
              <strong>{contributor.total}</strong>
            </button>
          ))}
        </div>
        <div className="contributor-step-feed">
          <div className="timeline-header compact">
            <div>
              <span className="eyebrow">Step-by-step activity</span>
              <h3>{selectedContributor === 'all' ? 'All user actions' : `${(contributors.find((item: any) => item.key === selectedContributor) || {}).userName || 'Contributor'} actions`}</h3>
            </div>
            <strong>{filteredHistory.length}</strong>
          </div>
          {filteredHistory.length ? (
            <ol className="contributor-step-list">
              {filteredHistory.map((row: any, index: number) => (
                <li key={`${row.annotationId || 'event'}-${row.timestamp || index}-${index}`}>
                  <i style={{ background: row.userColor || '#EB5E28' }} />
                  <article>
                    <header>
                      <strong>{humanizeEvent(row.action)} · {row.toolType || 'canvas'}</strong>
                      <span>{formatDateTime(row.timestamp)}</span>
                    </header>
                    <p>{contributorName(row)} {row.userDesignation ? `- ${row.userDesignation}` : ''}</p>
                    <dl>
                      <div>
                        <dt>Page</dt>
                        <dd>{row.pageNumber || 1}</dd>
                      </div>
                      <div>
                        <dt>Annotation</dt>
                        <dd>{shortId(row.annotationId)}</dd>
                      </div>
                      <div>
                        <dt>Document</dt>
                        <dd>{shortId(row.documentId)}</dd>
                      </div>
                    </dl>
                  </article>
                </li>
              ))}
            </ol>
          ) : (
            <p className="empty-state">No collaboration events are recorded for this contributor filter yet.</p>
          )}
        </div>
        <div className="report-table">
          <table>
            <thead>
              <tr>{historyColumns.map(column => <th key={column}>{historyColumnLabels[column] || column}</th>)}</tr>
            </thead>
            <tbody>
              {filteredHistory.map((row, index) => (
                <tr
                  key={`${row.annotationId}-${index}`}
                  className={row.annotationId === selectedAnnotationId ? 'selected' : ''}
                  onClick={() => loadAnnotationTimeline(row.annotationId)}
                >
                  {historyColumns.map(column => <td key={column}>{formatHistoryValue(row, column)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="annotation-timeline-panel">
          <div className="timeline-header">
            <div>
              <span className="eyebrow">Annotation timeline</span>
              <h3>{selectedAnnotationId ? `Annotation ${shortId(selectedAnnotationId)}` : 'Select an annotation row'}</h3>
            </div>
            <strong>{annotationTimeline.length}</strong>
          </div>
          {annotationTimeline.length ? (
            <ol className="annotation-timeline-list">
              {annotationTimeline.map((event, index) => (
                <li key={event.id || `${event.annotationId}-${index}`}>
                  <div className="timeline-dot" style={{ background: event.userColor || '#EB5E28' }} />
                  <article>
                    <header>
                      <strong>{event.action || 'event'} · {event.toolType || 'tool'}</strong>
                      <span>{formatDateTime(event.timestamp)}</span>
                    </header>
                    <p>{event.userName || 'Unknown'} {event.userDesignation ? `- ${event.userDesignation}` : ''}</p>
                    <dl>
                      <div>
                        <dt>Page</dt>
                        <dd>{event.pageNumber || 1}</dd>
                      </div>
                      <div>
                        <dt>Document</dt>
                        <dd title={event.documentId || ''}>{shortId(event.documentId)}</dd>
                      </div>
                    </dl>
                    <details>
                      <summary>State payload</summary>
                      <pre>{JSON.stringify({
                        payload: event.payload || {},
                        beforeState: event.beforeState || null,
                        afterState: event.afterState || null,
                      }, null, 2)}</pre>
                    </details>
                  </article>
                </li>
              ))}
            </ol>
          ) : (
            <p className="empty-state">Click an annotation history row to inspect who created, updated, or deleted it and what state was recorded.</p>
          )}
        </div>
      </section>

      <section className="workspace-tools-section">
        <h2>User-wise Report</h2>
        <div className="tool-actions">
          <button type="button" onClick={loadUserReport}>Refresh</button>
          <button type="button" onClick={() => handleDownload('hexscrum-user-wise-report.csv', toCsv(userReport.map(row => ({
            ...row,
            byAction: JSON.stringify(row.byAction || {}),
            byTool: JSON.stringify(row.byTool || {}),
            byPage: JSON.stringify(row.byPage || {}),
          })), userColumns), 'text/csv', 'User-wise report CSV')}>Export CSV</button>
          <button type="button" onClick={() => handleDownload('hexscrum-user-wise-report.json', JSON.stringify(userReport, null, 2), 'application/json', 'User-wise report JSON')}>Export JSON</button>
        </div>
        <div className="report-table">
          <table>
            <thead>
              <tr>{userColumns.map(column => <th key={column}>{userColumnLabels[column] || column}</th>)}</tr>
            </thead>
            <tbody>
              {userReport.map((row, index) => (
                <tr key={`${row.userId}-${index}`}>
                  <td>{row.userName || 'Unknown'}</td>
                  <td>{row.designation || '-'}</td>
                  <td>{row.total || 0}</td>
                  <td>{formatCountMap(row.byAction)}</td>
                  <td>{formatCountMap(row.byTool)}</td>
                  <td>{formatCountMap(row.byPage)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="workspace-tools-section">
        <h2>Meeting Archive</h2>
        <div className="tool-actions">
          <button type="button" onClick={handleArchive}>Generate Manifest</button>
          <button
            type="button"
            disabled={!archive}
            onClick={() => handleDownload('hexscrum-meeting-archive-manifest.json', JSON.stringify(archive, null, 2), 'application/json', 'Archive manifest JSON')}
          >
            Download JSON
          </button>
        </div>
      </section>
    </div>
  );
}

export default WorkspaceTools;
