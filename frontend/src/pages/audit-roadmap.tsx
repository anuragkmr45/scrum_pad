import React from 'react';
import { Link } from 'react-router-dom';

export default function AuditRoadmap() {
  document.title = 'Audit Coverage - HexScrum Workspace';

  const coverage = [
    {
      title: 'Annotation tracking',
      body: 'Each tracked annotation event includes workspace, document page, action, author name, designation, color, and timestamp for reviewer-level ownership.',
    },
    {
      title: 'Contributor reports',
      body: 'Workspace tools summarize user-wise contribution counts and export CSV reports for lead review follow-up.',
    },
    {
      title: 'Meeting documentation',
      body: 'Leads can save meeting notes, export annotation history, and generate an archive manifest for the workspace.',
    },
    {
      title: 'Annotated PDF export',
      body: 'The live canvas can export the marked-up document pages as a PDF from the workspace controls.',
    },
  ];

  return (
    <main className="audit-roadmap-page">
      <section className="audit-roadmap-content">
        <Link className="roadmap-link" to="/">Back to workspace</Link>
        <span className="eyebrow">MVP audit coverage</span>
        <h1>Track every reviewer contribution without slowing the room.</h1>
        <p>
          HexScrum Workspace now exposes the bare minimum review documentation paths needed for
          live document collaboration: ownership tags, timestamps, annotation history, user-wise
          reports, notes, archives, and annotated PDF export. This is MVP coverage and should not be
          treated as enterprise compliance or load-tested reporting.
        </p>
        <div className="audit-roadmap-grid">
          {coverage.map((item) => (
            <article key={item.title}>
              <h2>{item.title}</h2>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
        <div className="audit-roadmap-note">
          <strong>Production gate:</strong>
          <span>
            Add authorization, retention policy, signed export records, report review workflow, and
            load testing before making enterprise audit claims.
          </span>
        </div>
      </section>
    </main>
  );
}
