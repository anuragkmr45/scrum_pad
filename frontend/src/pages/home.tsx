import React, { useEffect, useState } from 'react';
import { Link, useHistory, useLocation } from 'react-router-dom';
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
  getWorkspace,
  inviteWorkspaceUser,
  listWorkspaceMembers,
  listMyWorkspaces,
  loginUser,
  registerUser,
  releaseWorkspaceLeadLock,
  saveHexscrumProfile,
  searchUsers,
  setWorkspaceId,
  updateWorkspaceMemberStatus,
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

type WorkspaceMemberRow = {
  id: string
  workspace_id: string
  user_id: string
  role: string
  color: string
  status: string
  user_name: string
  user_email: string
  user_designation: string
}

type WorkspaceTab = 'previous' | 'invited' | 'joined';

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

function workspaceCodeFromId(workspaceId: string) {
  return String(workspaceId || '').replace(/^workspace-/, '').toUpperCase() || 'NEW';
}

function workspaceIdFromCode(code: string) {
  const trimmed = String(code || '').trim().toLowerCase();
  if (!trimmed) return '';
  const compact = trimmed.replace(/^workspace-/, '').replace(/[^a-z0-9]/g, '');
  return compact ? `workspace-${compact}` : '';
}

function formatJoinCodeInput(value: string) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 32);
}

function formatDateLabel(value: string) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function generateWorkspaceCode() {
  const bytes = new Uint8Array(4);
  if (window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    bytes.forEach((_, index) => {
      bytes[index] = Math.floor(Math.random() * 255);
    });
  }
  return Array.from(bytes)
    .map((value) => value.toString(36).padStart(2, '0').slice(-2).toUpperCase())
    .join('')
    .replace(/(.{4})/, '$1-');
}

function HomePage() {
  document.title = t(`home.short_title.title`);

  const history = useHistory();
  const location = useLocation();
  const joinWorkspaceId = new URLSearchParams(location.search).get('join') || '';
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
  const [generatedWorkspaceCode, setGeneratedWorkspaceCode] = useState<string>(generateWorkspaceCode());
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [status, setStatus] = useState<string>('');
  const [backendHealth, setBackendHealth] = useState<any>({ checked: false, ok: true });
  const [shareWorkspace, setShareWorkspace] = useState<WorkspaceRow | null>(null);
  const [shareEmail, setShareEmail] = useState<string>('');
  const [userSearch, setUserSearch] = useState<string>('');
  const [userResults, setUserResults] = useState<any[]>([]);
  const [shareLink, setShareLink] = useState<string>('');
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMemberRow[]>([]);
  const [autoJoinStarted, setAutoJoinStarted] = useState<boolean>(false);
  const [workspaceLoadComplete, setWorkspaceLoadComplete] = useState<boolean>(false);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('previous');
  const [joinCode, setJoinCode] = useState<string>('');

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
    setWorkspaceLoadComplete(false);
    listMyWorkspaces()
      .then((data: any) => {
        setWorkspaces(data.workspaces || []);
        setInvitations(data.invitations || []);
        setWorkspaceLoadComplete(true);
      })
      .catch((err: any) => {
        setStatus(err.message);
        setWorkspaceLoadComplete(true);
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
      listMyWorkspaces().then((result: any) => {
        setWorkspaces(result.workspaces || []);
        setInvitations(result.invitations || []);
        setWorkspaceLoadComplete(true);
      }).catch(() => {});
    } catch (err) {
      setStatus(err.message || 'Authentication failed.');
    }
  };

  const handleLogout = () => {
    clearAuthSession();
    setAuthUser(null);
    setAuthMode('login');
    setAuthForm({
      ...authForm,
      password: '',
    });
    setWorkspaces([]);
    setInvitations([]);
    setShareWorkspace(null);
    setWorkspaceMembers([]);
    setWorkspaceLoadComplete(false);
    setStatus('Signed out');
  };

  const loadWorkspaceMembers = (workspace: WorkspaceRow | null) => {
    setShareWorkspace(workspace);
    setWorkspaceMembers([]);
    if (!workspace) return;
    const role = roleForWorkspace(workspace);
    if (role !== 'lead') return;
    listWorkspaceMembers(workspace.id)
      .then((data: any) => setWorkspaceMembers(data.members || []))
      .catch((err: any) => setStatus(err.message));
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
      authUserId: authUser.id,
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

  useEffect(() => {
    if (!joinWorkspaceId || !authUser || autoJoinStarted || !workspaceLoadComplete) return;
    const workspace = workspaces.find((item) => item.id === joinWorkspaceId);
    if (!workspace) {
      setStatus('This invite link is only available to invited users. Login or register with the invited email.');
      return;
    }
    setAutoJoinStarted(true);
    launchWorkspace(workspace.name, roleForWorkspace(workspace), workspace.id, workspace.member_color);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinWorkspaceId, authUser, autoJoinStarted, workspaceLoadComplete, workspaces]);

  const createGeneratedWorkspace = () => {
    const code = generatedWorkspaceCode || generateWorkspaceCode();
    const name = `Workspace ${code}`;
    const workspaceId = `workspace-${code.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    launchWorkspace(name, 'lead', workspaceId);
    setGeneratedWorkspaceCode(generateWorkspaceCode());
  };

  const handleJoinByCode = async () => {
    if (!hasConverterUrl) {
      setStatus('Set REACT_APP_LIBRE_BACKEND_URL before joining by code.');
      return;
    }
    const workspaceId = workspaceIdFromCode(joinCode);
    if (!workspaceId || workspaceId.replace(/^workspace-/, '').length < 4) {
      setStatus('Enter a valid workspace code.');
      return;
    }

    const knownWorkspace = workspaces.find((workspace) => workspace.id === workspaceId);
    if (knownWorkspace) {
      launchWorkspace(
        knownWorkspace.name,
        roleForWorkspace(knownWorkspace),
        knownWorkspace.id,
        knownWorkspace.member_color
      );
      return;
    }

    try {
      const data = await getWorkspace(workspaceId);
      const workspace = data.workspace;
      if (!workspace || workspace.status === 'ended') {
        setStatus('Workspace code is not active.');
        return;
      }
      launchWorkspace(
        workspace.name || `Workspace ${workspaceCodeFromId(workspaceId)}`,
        'reviewer',
        workspaceId
      );
    } catch (err) {
      setStatus('Workspace code not found. Check the code and try again.');
    }
  };

  const copyShareLink = async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setStatus('Invite link copied.');
    } catch (err) {
      setStatus('Copy failed. Select and copy the invite link manually.');
    }
  };

  const handleShare = () => {
    if (!shareWorkspace || !shareEmail.trim()) return;
    inviteWorkspaceUser(shareWorkspace.id, {
      email: shareEmail.trim(),
      role: 'reviewer',
    })
      .then(() => {
        const link = `${window.location.origin}/?join=${encodeURIComponent(shareWorkspace.id)}`;
        setShareLink(link);
        setStatus('Workspace invite created. Share the link only with the invited reviewer.');
        setShareEmail('');
        setUserResults([]);
        loadWorkspaceMembers(shareWorkspace);
        loadWorkspaces();
      })
      .catch((err: any) => setStatus(err.message));
  };

  const updateMemberStatus = (member: WorkspaceMemberRow, nextStatus: 'active' | 'kicked' | 'blocked') => {
    if (!shareWorkspace) return;
    updateWorkspaceMemberStatus(shareWorkspace.id, member.user_id, nextStatus)
      .then(() => {
        setStatus(`${member.user_name || member.user_email || 'Reviewer'} marked as ${nextStatus}.`);
        loadWorkspaceMembers(shareWorkspace);
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

  const joinedWorkspaces = authUser
    ? workspaces.filter((workspace) => roleForWorkspace(workspace) === 'reviewer')
    : [];
  const visibleWorkspaces = workspaceTab === 'joined' ? joinedWorkspaces : workspaces;
  const workspaceTabCounts = {
    previous: workspaces.length,
    invited: invitations.length,
    joined: joinedWorkspaces.length,
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
          {joinWorkspaceId ? <p className="auth-status">Use the invited email to login or create an account for this workspace link.</p> : null}
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
          <div className="workspace-code-card">
            <span>Generated workspace code</span>
            <strong>{generatedWorkspaceCode}</strong>
            <small>Lead reviewers share this code through an invite link. Reviewers join from their previous or invited workspace list after login.</small>
          </div>
          <div className="dashboard-actions">
            <button onClick={createGeneratedWorkspace}>Create as lead</button>
            <button onClick={() => setGeneratedWorkspaceCode(generateWorkspaceCode())}>New code</button>
          </div>
          <div className="join-code-card">
            <div>
              <span>Join workspace</span>
              <strong>Enter code</strong>
            </div>
            <label>
              Workspace code
              <input
                value={joinCode}
                onChange={(evt: any) => setJoinCode(formatJoinCodeInput(evt.target.value))}
                onKeyDown={(evt: any) => {
                  if (evt.key === 'Enter') handleJoinByCode();
                }}
                placeholder="ABCD-EFGH"
              />
            </label>
            <button disabled={!joinCode.trim()} onClick={handleJoinByCode}>Join workspace</button>
            <small>Use the code shared by the lead reviewer. If you already have access, your role and color are kept.</small>
          </div>
          <div className="setup-warnings">
            {!hasAgoraAppId ? <p>Missing Agora App ID. Live collaboration is disabled.</p> : null}
            {!hasConverterUrl ? <p>Missing converter URL. Upload, auth, and reports need the backend.</p> : null}
            {hasConverterUrl && backendHealth.checked && !backendHealth.ok ? <p>Backend health check failed.</p> : null}
            {invitations.length ? <p>{invitations.length} pending invite will appear after the invited account logs in.</p> : null}
          </div>
          {status ? <p className="dashboard-status">{status}</p> : null}
        </section>

        <section className="dashboard-panel workspace-list-panel">
          <div className="section-heading-row">
            <div>
              <span className="eyebrow">Workspaces</span>
              <h2>Your workspace activity</h2>
            </div>
            <strong>{workspaceTabCounts[workspaceTab]}</strong>
          </div>
          <div className="workspace-tabs" role="tablist" aria-label="Workspace lists">
            {(['previous', 'invited', 'joined'] as WorkspaceTab[]).map((tab) => (
              <button
                key={tab}
                role="tab"
                type="button"
                className={workspaceTab === tab ? 'active' : ''}
                aria-selected={workspaceTab === tab}
                onClick={() => setWorkspaceTab(tab)}
              >
                <span>{tab === 'previous' ? 'Previous' : tab === 'invited' ? 'Invited' : 'Joined'}</span>
                <strong>{workspaceTabCounts[tab]}</strong>
              </button>
            ))}
          </div>
          <div className="workspace-card-list">
            {workspaceTab === 'invited' ? (
              invitations.length ? invitations.map((invite: any, index: number) => (
                <article key={invite.id || `${invite.workspace_id}-${index}`} className="workspace-card invite-card">
                  <div className="workspace-card-top">
                    <div>
                      <h3>{invite.workspace_name || 'Invited workspace'}</h3>
                      <span>Pending invitation · Reviewer access</span>
                    </div>
                    <span className="workspace-code-inline">{workspaceCodeFromId(invite.workspace_id)}</span>
                  </div>
                  <div className="workspace-card-metrics">
                    <span>Invited {formatDateLabel(invite.created_at)}</span>
                    <span>{invite.invited_email || authUser.email}</span>
                  </div>
                  <p className="workspace-card-helper">Login with the invited email. Accepted workspaces appear under Previous and Joined.</p>
                </article>
              )) : <p className="empty-state">No pending invitations for {authUser.email}. Ask the lead reviewer to invite this email if a workspace is missing.</p>
            ) : visibleWorkspaces.length ? visibleWorkspaces.map((workspace) => {
              const role = roleForWorkspace(workspace);
              return (
                <article key={workspace.id} className="workspace-card">
                  <div className="workspace-card-top">
                    <div>
                      <h3>{workspace.name}</h3>
                      <span>{role === 'lead' ? 'Lead reviewer' : 'Reviewer'} · {workspace.status || 'active'}</span>
                    </div>
                    <div className="workspace-card-marker">
                      <span className="workspace-code-inline">{workspaceCodeFromId(workspace.id)}</span>
                      <i style={{ background: workspace.member_color || authUser.color }} />
                    </div>
                  </div>
                  <div className="workspace-card-metrics">
                    <span>{workspace.participant_count || 1} participants</span>
                    <span>{workspace.document_count || 0} documents</span>
                    <span>{workspace.annotation_event_count || 0} collaboration events</span>
                  </div>
                  <p className="workspace-card-helper">History includes meeting notes, contributor reports, annotation timeline, and archive exports for this workspace.</p>
                  <div className="workspace-card-actions">
                    <button onClick={() => launchWorkspace(workspace.name, role, workspace.id, workspace.member_color)}>Open</button>
                    <Link onClick={() => setWorkspaceId(workspace.id)} to="/workspace-tools">History</Link>
                    {role === 'lead' ? <button onClick={() => loadWorkspaceMembers(workspace)}>Share</button> : null}
                    {role === 'lead' && workspace.status !== 'ended' ? <button onClick={() => handleEndWorkspace(workspace)}>End</button> : null}
                  </div>
                </article>
              );
            }) : <p className="empty-state">{workspaceTab === 'joined' ? 'No joined reviewer workspaces yet.' : 'No saved workspace yet. Create one or ask the lead reviewer to share it with your email.'}</p>}
          </div>
        </section>

        <section className="dashboard-panel share-panel">
          <span className="eyebrow">Share</span>
          <h2>Invite reviewers</h2>
          <label>
            Workspace
            <input value={shareWorkspace ? shareWorkspace.name : ''} readOnly placeholder="Select Share on a workspace" />
          </label>
          {shareWorkspace ? (
            <div className="workspace-code-card compact">
              <span>Invite code</span>
              <strong>{workspaceCodeFromId(shareWorkspace.id)}</strong>
              <small>Access is still limited to invited users.</small>
            </div>
          ) : null}
          <label>
            Reviewer email
            <input value={shareEmail} onChange={(evt: any) => setShareEmail(evt.target.value)} />
          </label>
          <div className="dashboard-actions">
            <button disabled={!shareWorkspace || !shareEmail.trim()} onClick={handleShare}>Send invite</button>
          </div>
          {shareLink ? (
            <div className="invite-link-box">
              <span>Reviewer join link</span>
              <input value={shareLink} readOnly />
              <button onClick={copyShareLink}>Copy link</button>
            </div>
          ) : null}
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
          {shareWorkspace ? (
            <div className="participant-manage-list">
              <div className="section-heading-row compact-heading">
                <div>
                  <span className="eyebrow">Participants</span>
                  <h3>Access control</h3>
                </div>
                <strong>{workspaceMembers.length}</strong>
              </div>
              {workspaceMembers.length ? workspaceMembers.map((member) => {
                const isLead = member.role === 'lead' || member.user_id === shareWorkspace.owner_user_id;
                return (
                  <div key={`${member.workspace_id}-${member.user_id}`} className="participant-manage-row">
                    <i style={{ background: member.color || '#EB5E28' }} />
                    <div>
                      <strong>{member.user_name || member.user_email || member.user_id}</strong>
                      <span>{member.user_designation || member.user_email || member.role} · {member.status}</span>
                    </div>
                    {isLead ? <small>Lead</small> : (
                      <div className="participant-actions">
                        {member.status !== 'active' ? <button onClick={() => updateMemberStatus(member, 'active')}>Admit</button> : null}
                        <button onClick={() => updateMemberStatus(member, 'kicked')}>Kick</button>
                        <button onClick={() => updateMemberStatus(member, 'blocked')}>Block</button>
                      </div>
                    )}
                  </div>
                );
              }) : <p className="empty-state">No reviewers yet. Send an invite to add one.</p>}
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}

export default React.memo(HomePage);
