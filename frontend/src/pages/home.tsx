import React, { useEffect, useState } from 'react';
import { Link, useHistory } from 'react-router-dom';
import MD5 from 'js-md5';
import Button from '../components/custom-button';
import { roomStore } from '../stores/room';
import { genUid } from '../utils/helper';
import { globalStore } from '../stores/global';
import { t } from '../i18n';
import {
  checkBackendHealth,
  clearAuthSession,
  acquireWorkspaceLeadLock,
  createWorkspace,
  endWorkspace,
  fetchAgoraRtmToken,
  getAuthSession,
  getCurrentUser,
  inviteWorkspaceUser,
  listMyWorkspaces,
  loginUser,
  registerUser,
  releaseWorkspaceLeadLock,
  saveHexscrumProfile,
  searchUsers,
  setWorkspaceId,
} from '../utils/hexscrum-api';

type MemberRole = 'lead' | 'reviewer';

type WorkspaceRow = {
  id: string
  name: string
  owner_user_id: string
  status: string
  member_role: string
  member_color: string
  participant_count: number
  document_count: number
  annotation_event_count: number
}

const hasAgoraAppId = Boolean(process.env.REACT_APP_AGORA_APP_ID);
const hasConverterUrl = Boolean(process.env.REACT_APP_LIBRE_BACKEND_URL);

const defaultAuthForm = {
  name: '',
  email: '',
  password: '',
  designation: '',
  color: '#EB5E28',
};

function normalizedWorkspaceKey(roomName: string) {
  return roomName.trim().replace(/\s+/g, ' ').toLowerCase();
}

function workspaceIdForName(roomName: string) {
  return `workspace-${MD5(normalizedWorkspaceKey(roomName))}`;
}

function HomePage() {
  document.title = t(`home.short_title.title`);

  const history = useHistory();
  const session = getAuthSession();
  const [authUser, setAuthUser] = useState<any>(getCurrentUser());
  const [authMode, setAuthMode] = useState<'login' | 'register'>(session ? 'login' : 'register');
  const [authForm, setAuthForm] = useState<any>({
    ...defaultAuthForm,
    email: authUser ? authUser.email : '',
    name: authUser ? authUser.name : '',
    designation: authUser ? authUser.designation : '',
    color: authUser ? authUser.color : defaultAuthForm.color,
  });
  const [workspaceName, setWorkspaceName] = useState<string>('');
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [status, setStatus] = useState<string>('');
  const [backendHealth, setBackendHealth] = useState<any>({ checked: false, ok: true });
  const [shareWorkspace, setShareWorkspace] = useState<WorkspaceRow | null>(null);
  const [shareEmail, setShareEmail] = useState<string>('');
  const [userSearch, setUserSearch] = useState<string>('');
  const [userResults, setUserResults] = useState<any[]>([]);

  useEffect(() => {
    if (!hasConverterUrl) return;
    checkBackendHealth().then((health: any) => {
      setBackendHealth({
        checked: true,
        ok: Boolean(health.ok),
        details: health,
      });
    });
  }, []);

  const loadWorkspaces = () => {
    if (!authUser || !hasConverterUrl) return;
    listMyWorkspaces()
      .then((data: any) => {
        setWorkspaces(data.workspaces || []);
      })
      .catch((err: any) => {
        setStatus(err.message);
      });
  };

  useEffect(() => {
    loadWorkspaces();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser]);

  const updateAuthField = (field: string, value: string) => {
    setAuthForm({
      ...authForm,
      [field]: value,
    });
  };

  const handleAuthSubmit = async () => {
    if (!hasConverterUrl) {
      setStatus('Set REACT_APP_LIBRE_BACKEND_URL before login.');
      return;
    }
    setStatus('');
    try {
      const data = authMode === 'login'
        ? await loginUser({ email: authForm.email, password: authForm.password })
        : await registerUser(authForm);
      setAuthUser(data.user);
      setAuthForm({
        ...authForm,
        password: '',
        name: data.user.name,
        email: data.user.email,
        designation: data.user.designation,
        color: data.user.color,
      });
      setStatus('Signed in');
      listMyWorkspaces().then((result: any) => setWorkspaces(result.workspaces || [])).catch(() => {});
    } catch (err) {
      setStatus(err.message || 'Authentication failed.');
    }
  };

  const handleLogout = () => {
    clearAuthSession();
    setAuthUser(null);
    setWorkspaces([]);
    setShareWorkspace(null);
    setStatus('Signed out');
  };

  const launchWorkspace = async (
    roomName: string,
    memberRole: MemberRole,
    existingWorkspaceId?: string,
    existingMemberColor?: string
  ) => {
    if (!authUser) {
      setStatus('Login first.');
      return;
    }
    if (!hasAgoraAppId) {
      globalStore.showToast({
        type: 'rtmClient',
        message: 'Missing REACT_APP_AGORA_APP_ID. Set frontend/.env before joining a live workspace.',
      });
      return;
    }

    const cleanName = roomName.trim();
    if (!cleanName) {
      setStatus('Workspace name is required.');
      return;
    }

    const rid = existingWorkspaceId || workspaceIdForName(cleanName);
    const role = memberRole === 'lead' ? 'teacher' : 'student';
    const uid = genUid();
    let leadLockAcquired = false;

    const payload = {
      uid,
      rid,
      role,
      roomName: cleanName,
      roomType: 0,
      video: 0,
      audio: 0,
      chat: 0,
      account: authUser.name,
      rtmToken: '',
      boardId: '',
      linkId: 0,
      sharedId: 0,
      lockBoard: 0,
      grantBoard: memberRole === 'lead' ? 1 : 0,
    };

    try {
      globalStore.showLoading();
      const requestedColor = existingMemberColor || authUser.color;
      setWorkspaceId(rid);
      if (memberRole === 'lead') {
        const lock = await acquireWorkspaceLeadLock(rid);
        if (!lock.acquired) {
          setStatus(lock.reason === 'lead_already_in_other_workspace'
            ? 'You are already lead reviewer in another active workspace.'
            : 'This workspace already has an active lead reviewer.');
          return;
        }
        leadLockAcquired = true;
      }
      const workspaceResult = await createWorkspace({
        id: rid,
        name: cleanName,
        ownerUserId: memberRole === 'lead' ? authUser.id : '',
        memberRole,
        userColor: requestedColor,
        metadata: {
          authUserId: authUser.id,
          userName: authUser.name,
          userDesignation: authUser.designation,
          userColor: requestedColor,
          roomType: 0,
        },
      });
      const assignedColor = (workspaceResult && workspaceResult.member && workspaceResult.member.color) || requestedColor;
      saveHexscrumProfile({
        userId: authUser.id,
        name: authUser.name,
        designation: authUser.designation,
        color: assignedColor,
      });
      const rtmToken = await fetchAgoraRtmToken(payload.uid);
      await roomStore.loginAndJoin({
        ...payload,
        rtmToken,
      });
      Object.keys(localStorage).forEach((key) => {
        if (key.indexOf('/annotations') !== -1) {
          localStorage.removeItem(`${key}`);
        }
      });
      history.push('/classroom/one-to-one');
    } catch (err) {
      if (leadLockAcquired) {
        releaseWorkspaceLeadLock(rid).catch(() => {});
      }
      globalStore.showToast({
        type: 'rtmClient',
        message: err.reason || err.message || t('toast.rtm_login_failed'),
      });
    } finally {
      globalStore.stopLoading();
    }
  };

  const roleForWorkspace = (workspace: WorkspaceRow): MemberRole => {
    if (workspace.member_role === 'lead' || workspace.owner_user_id === authUser.id) return 'lead';
    return 'reviewer';
  };

  const handleShare = () => {
    if (!shareWorkspace || !shareEmail.trim()) return;
    inviteWorkspaceUser(shareWorkspace.id, {
      email: shareEmail.trim(),
      role: 'reviewer',
    })
      .then(() => {
        setStatus('Workspace shared.');
        setShareEmail('');
        setUserResults([]);
        loadWorkspaces();
      })
      .catch((err: any) => setStatus(err.message));
  };

  const handleUserSearch = () => {
    if (!userSearch.trim()) return;
    searchUsers(userSearch.trim())
      .then((data: any) => setUserResults(data.users || []))
      .catch((err: any) => setStatus(err.message));
  };

  const handleEndWorkspace = (workspace: WorkspaceRow) => {
    if (!window.confirm('End this workspace for all participants?')) return;
    endWorkspace(workspace.id)
      .then(() => {
        setStatus('Workspace ended.');
        loadWorkspaces();
      })
      .catch((err: any) => setStatus(err.message));
  };

  if (!authUser) {
    return (
      <div className="auth-page">
        <section className="auth-hero-panel">
          <div className="auth-brand-mark">H</div>
          <span className="eyebrow">HexScrum Workspace</span>
          <h1>Login before creating or joining review workspaces.</h1>
          <p>Authenticated users can create workspaces, reopen previous sessions, share with reviewers, and keep annotation history tied to real identities.</p>
          <div className="auth-feature-row">
            <span>Live collaboration</span>
            <span>Workspace history</span>
            <span>Reviewer invites</span>
          </div>
        </section>
        <section className="auth-form-panel">
          <div className="auth-tabs">
            <button className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>Login</button>
            <button className={authMode === 'register' ? 'active' : ''} onClick={() => setAuthMode('register')}>Create account</button>
          </div>
          {authMode === 'register' ? (
            <label>
              Name
              <input value={authForm.name} onChange={(evt: any) => updateAuthField('name', evt.target.value)} />
            </label>
          ) : null}
          <label>
            Email
            <input type="email" value={authForm.email} onChange={(evt: any) => updateAuthField('email', evt.target.value)} />
          </label>
          <label>
            Password
            <input type="password" value={authForm.password} onChange={(evt: any) => updateAuthField('password', evt.target.value)} />
          </label>
          {authMode === 'register' ? (
            <>
              <label>
                Designation
                <input value={authForm.designation} onChange={(evt: any) => updateAuthField('designation', evt.target.value)} />
              </label>
              <div className="auth-color-row">
                <span>Annotation color</span>
                <input type="color" value={authForm.color} onChange={(evt: any) => updateAuthField('color', evt.target.value)} />
              </div>
            </>
          ) : null}
          {status ? <p className="auth-status">{status}</p> : null}
          {!hasConverterUrl ? <p className="auth-status">Missing converter API URL. Auth needs REACT_APP_LIBRE_BACKEND_URL.</p> : null}
          <Button name={authMode === 'login' ? 'Login' : 'Create account'} onClick={handleAuthSubmit} />
        </section>
      </div>
    );
  }

  return (
    <div className="workspace-dashboard-page">
      <header className="workspace-dashboard-header">
        <div>
          <span className="eyebrow">Authenticated workspace</span>
          <h1>HexScrum Workspace</h1>
          <p>{authUser.name} {authUser.designation ? `- ${authUser.designation}` : ''}</p>
        </div>
        <div className="dashboard-header-actions">
          <Link to="/workspace-tools">Reports</Link>
          <button onClick={loadWorkspaces}>Refresh</button>
          <button onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <main className="workspace-dashboard-grid">
        <section className="dashboard-panel launch-panel">
          <span className="eyebrow">Start</span>
          <h2>Create or join workspace</h2>
          <label>
            Workspace name
            <input value={workspaceName} onChange={(evt: any) => setWorkspaceName(evt.target.value)} />
          </label>
          <div className="dashboard-actions">
            <button onClick={() => launchWorkspace(workspaceName, 'lead')}>Create as lead</button>
            <button onClick={() => launchWorkspace(workspaceName, 'reviewer')}>Join as reviewer</button>
          </div>
          <div className="setup-warnings">
            {!hasAgoraAppId ? <p>Missing Agora App ID. Live collaboration is disabled.</p> : null}
            {!hasConverterUrl ? <p>Missing converter URL. Upload, auth, and reports need the backend.</p> : null}
            {hasConverterUrl && backendHealth.checked && !backendHealth.ok ? <p>Backend health check failed.</p> : null}
          </div>
          {status ? <p className="dashboard-status">{status}</p> : null}
        </section>

        <section className="dashboard-panel workspace-list-panel">
          <div className="section-heading-row">
            <div>
              <span className="eyebrow">Workspaces</span>
              <h2>Previous and invited workspaces</h2>
            </div>
            <strong>{workspaces.length}</strong>
          </div>
          <div className="workspace-card-list">
            {workspaces.length ? workspaces.map((workspace) => {
              const role = roleForWorkspace(workspace);
              return (
                <article key={workspace.id} className="workspace-card">
                  <div className="workspace-card-top">
                    <div>
                      <h3>{workspace.name}</h3>
                      <span>{role === 'lead' ? 'Lead reviewer' : 'Reviewer'} · {workspace.status || 'active'}</span>
                    </div>
                    <i style={{ background: workspace.member_color || authUser.color }} />
                  </div>
                  <div className="workspace-card-metrics">
                    <span>{workspace.participant_count || 1} participants</span>
                    <span>{workspace.document_count || 0} docs</span>
                    <span>{workspace.annotation_event_count || 0} marks</span>
                  </div>
                  <div className="workspace-card-actions">
                    <button onClick={() => launchWorkspace(workspace.name, role, workspace.id, workspace.member_color)}>Open</button>
                    <Link onClick={() => setWorkspaceId(workspace.id)} to="/workspace-tools">History</Link>
                    {role === 'lead' ? <button onClick={() => setShareWorkspace(workspace)}>Share</button> : null}
                    {role === 'lead' && workspace.status !== 'ended' ? <button onClick={() => handleEndWorkspace(workspace)}>End</button> : null}
                  </div>
                </article>
              );
            }) : <p className="empty-state">No saved workspace yet. Create one or ask the lead reviewer to share it with your email.</p>}
          </div>
        </section>

        <section className="dashboard-panel share-panel">
          <span className="eyebrow">Share</span>
          <h2>Invite reviewers</h2>
          <label>
            Workspace
            <input value={shareWorkspace ? shareWorkspace.name : ''} readOnly placeholder="Select Share on a workspace" />
          </label>
          <label>
            Reviewer email
            <input value={shareEmail} onChange={(evt: any) => setShareEmail(evt.target.value)} />
          </label>
          <div className="dashboard-actions">
            <button disabled={!shareWorkspace || !shareEmail.trim()} onClick={handleShare}>Send invite</button>
          </div>
          <div className="user-search-box">
            <label>
              Search previous users
              <input value={userSearch} onChange={(evt: any) => setUserSearch(evt.target.value)} />
            </label>
            <button onClick={handleUserSearch}>Search</button>
          </div>
          <div className="user-result-list">
            {userResults.map((user) => (
              <button key={user.id} onClick={() => setShareEmail(user.email)}>
                <strong>{user.name}</strong>
                <span>{user.email}</span>
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

export default React.memo(HomePage);
