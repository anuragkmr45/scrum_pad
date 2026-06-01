import React from 'react';
import { Link } from 'react-router-dom';

export default function AuditRoadmap() {
  document.title = 'Audit & Reports Roadmap - HexScrum Workspace';

  return (
    <main className="audit-roadmap-page">
      <section className="audit-roadmap-content">
        <Link className="roadmap-link" to="/">Back to workspace</Link>
        <h1>Audit & Reports Roadmap</h1>
        <p>
          HexScrum Workspace currently provides a whiteboard MVP. Enterprise audit, user-wise
          reporting, meeting archives, and export history require a dedicated backend schema and
          event pipeline before they should be treated as production-ready.
        </p>
        <div className="audit-roadmap-grid">
          <article>
            <h2>MVP Now</h2>
            <p>Live workspace, document canvas, annotations, participant presence, and PDF export path from the upstream SDK.</p>
          </article>
          <article>
            <h2>Next Build</h2>
            <p>Persist users, workspaces, documents, pages, annotation events, meeting notes, and exports.</p>
          </article>
          <article>
            <h2>Production Gate</h2>
            <p>Add authorization, retention policy, report generation, audit review, and load testing before enterprise rollout.</p>
          </article>
        </div>
      </section>
    </main>
  );
}
