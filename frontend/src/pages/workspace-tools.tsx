import React, { useEffect, useState } from 'react';
import { Link, useHistory } from 'react-router-dom';
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
  const [archive, setArchive] = useState<any>(null);
  const [status, setStatus] = useState<string>('');
  const backendUrl = getBackendBaseUrl();

  useEffect(() => {
    if (!currentUser) {
      routerHistory.push('/');
    }
  }, [currentUser, routerHistory]);

  const rememberWorkspace = (value: string) => {
    updateWorkspaceId(value);
    setWorkspaceId(value);
  };

  const loadNotes = () => {
    if (!workspaceId) return;
    getMeetingNotes(workspaceId)
      .then((data: any) => setNotes(data.notes || []))
      .catch((err: any) => setStatus(err.message));
  };

  const loadHistory = () => {
    if (!workspaceId) return;
    getAnnotationHistory(workspaceId)
      .then((data: any) => setHistory(data.report || []))
      .catch((err: any) => setStatus(err.message));
  };

  const loadAnnotationTimeline = (annotationId: string) => {
    if (!workspaceId || !annotationId) {
      setStatus('This event does not have an annotation id.');
      return;
    }
    setSelectedAnnotationId(annotationId);
    getAnnotationTimeline(workspaceId, annotationId)
      .then((data: any) => {
        setAnnotationTimeline(data.events || []);
        setStatus((data.events || []).length ? 'Timeline loaded' : 'No timeline found for this annotation.');
      })
      .catch((err: any) => setStatus(err.message));
  };

  const loadUserReport = () => {
    if (!workspaceId) return;
    getUserWiseReport(workspaceId)
      .then((data: any) => setUserReport(data.report || []))
      .catch((err: any) => setStatus(err.message));
  };

  useEffect(() => {
    if (!workspaceId || !backendUrl) return;
    loadNotes();
    loadHistory();
    loadUserReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, backendUrl]);

  const handleSaveNote = () => {
    if (!workspaceId || !noteBody.trim()) return;
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
      .catch((err: any) => setStatus(err.message));
  };

  const handleArchive = () => {
    if (!workspaceId) return;
    generateArchive({
      workspaceId,
      requestedByUserId: profile.userId,
    })
      .then((data: any) => {
        setArchive(data.manifest);
        setStatus('Archive generated');
      })
      .catch((err: any) => setStatus(err.message));
  };

  const historyColumns = ['timestamp', 'userName', 'userDesignation', 'action', 'toolType', 'pageNumber', 'annotationId', 'documentId'];
  const userColumns = ['userName', 'designation', 'total', 'byAction', 'byTool', 'byPage'];
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
        <Link to="/">Back</Link>
      </header>

      {!backendUrl ? <p className="setup-warning">Missing REACT_APP_LIBRE_BACKEND_URL.</p> : null}
      {status ? <p className="status-line">{status}</p> : null}

      <section className="workspace-tools-section">
        <label htmlFor="workspaceId">Workspace ID</label>
        <input id="workspaceId" value={workspaceId} onChange={(evt: any) => rememberWorkspace(evt.target.value)} />
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
          <button onClick={handleSaveNote}>Save Note</button>
          <button onClick={loadNotes}>Refresh</button>
          <button onClick={() => downloadFile('hexscrum-meeting-notes.html', notesAsHtml(notes), 'text/html')}>Export HTML</button>
          <button onClick={() => downloadFile('hexscrum-meeting-notes.json', JSON.stringify(notes, null, 2), 'application/json')}>Export JSON</button>
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
          <button onClick={loadHistory}>Refresh</button>
          <button onClick={() => downloadFile('hexscrum-annotation-history.csv', toCsv(history, historyColumns), 'text/csv')}>Export CSV</button>
          <button onClick={() => downloadFile('hexscrum-annotation-history.json', JSON.stringify(history, null, 2), 'application/json')}>Export JSON</button>
        </div>
        <div className="report-table">
          <table>
            <thead>
              <tr>{historyColumns.map(column => <th key={column}>{column}</th>)}</tr>
            </thead>
            <tbody>
              {history.map((row, index) => (
                <tr
                  key={`${row.annotationId}-${index}`}
                  className={row.annotationId === selectedAnnotationId ? 'selected' : ''}
                  onClick={() => loadAnnotationTimeline(row.annotationId)}
                >
                  {historyColumns.map(column => <td key={column}>{row[column]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="annotation-timeline-panel">
          <div className="timeline-header">
            <div>
              <span className="eyebrow">Annotation timeline</span>
              <h3>{selectedAnnotationId || 'Select an annotation row'}</h3>
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
                      <span>{event.timestamp || ''}</span>
                    </header>
                    <p>{event.userName || 'Unknown'} {event.userDesignation ? `- ${event.userDesignation}` : ''}</p>
                    <dl>
                      <div>
                        <dt>Page</dt>
                        <dd>{event.pageNumber || 1}</dd>
                      </div>
                      <div>
                        <dt>Document</dt>
                        <dd>{event.documentId || '-'}</dd>
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
          <button onClick={loadUserReport}>Refresh</button>
          <button onClick={() => downloadFile('hexscrum-user-wise-report.csv', toCsv(userReport.map(row => ({
            ...row,
            byAction: JSON.stringify(row.byAction || {}),
            byTool: JSON.stringify(row.byTool || {}),
            byPage: JSON.stringify(row.byPage || {}),
          })), userColumns), 'text/csv')}>Export CSV</button>
          <button onClick={() => downloadFile('hexscrum-user-wise-report.json', JSON.stringify(userReport, null, 2), 'application/json')}>Export JSON</button>
        </div>
        <div className="report-table">
          <table>
            <thead>
              <tr>{userColumns.map(column => <th key={column}>{column}</th>)}</tr>
            </thead>
            <tbody>
              {userReport.map((row, index) => (
                <tr key={`${row.userId}-${index}`}>
                  <td>{row.userName}</td>
                  <td>{row.designation}</td>
                  <td>{row.total}</td>
                  <td>{JSON.stringify(row.byAction || {})}</td>
                  <td>{JSON.stringify(row.byTool || {})}</td>
                  <td>{JSON.stringify(row.byPage || {})}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="workspace-tools-section">
        <h2>Meeting Archive</h2>
        <div className="tool-actions">
          <button onClick={handleArchive}>Generate Manifest</button>
          <button
            disabled={!archive}
            onClick={() => downloadFile('hexscrum-meeting-archive-manifest.json', JSON.stringify(archive, null, 2), 'application/json')}
          >
            Download JSON
          </button>
        </div>
      </section>
    </div>
  );
}

export default WorkspaceTools;
