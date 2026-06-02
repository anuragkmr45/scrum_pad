export type HexscrumProfile = {
  userId: string
  name: string
  designation: string
  color: string
}

export type HexscrumAuthUser = {
  id: string
  name: string
  email: string
  designation: string
  color: string
}

const PROFILE_KEY = 'hexscrum_profile';
const WORKSPACE_ID_KEY = 'hexscrum_workspace_id';
const AUTH_SESSION_KEY = 'hexscrum_auth_session';
const DEFAULT_COLOR = '#EB5E28';
const LEGACY_DEFAULT_COLOR = '#2563EB';

function readJson(key: string) {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch (err) {
    return null;
  }
}

function writeJson(key: string, value: any) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {}
}

export function getBackendBaseUrl() {
  return (process.env.REACT_APP_LIBRE_BACKEND_URL || '').replace(/\/$/, '');
}

export function getHexscrumProfile(): HexscrumProfile {
  const stored = readJson(PROFILE_KEY) || {};
  const color = stored.color && String(stored.color).toUpperCase() !== LEGACY_DEFAULT_COLOR
    ? stored.color
    : DEFAULT_COLOR;

  return {
    userId: stored.userId || '',
    name: stored.name || '',
    designation: stored.designation || '',
    color,
  };
}

export function saveHexscrumProfile(profile: Partial<HexscrumProfile>) {
  const next = {
    ...getHexscrumProfile(),
    ...profile,
  };
  writeJson(PROFILE_KEY, next);
  return next;
}

export function getAuthSession() {
  const session = readJson(AUTH_SESSION_KEY);
  if (!session || !session.token || !session.user) return null;
  return session as { token: string, user: HexscrumAuthUser };
}

export function getAuthToken() {
  const session = getAuthSession();
  return session ? session.token : '';
}

export function getCurrentUser() {
  const session = getAuthSession();
  return session ? session.user : null;
}

export function saveAuthSession(session: { token: string, user: HexscrumAuthUser }) {
  writeJson(AUTH_SESSION_KEY, session);
  saveHexscrumProfile({
    userId: session.user.id,
    name: session.user.name,
    designation: session.user.designation,
    color: session.user.color,
  });
  return session;
}

export function clearAuthSession() {
  try {
    window.localStorage.removeItem(AUTH_SESSION_KEY);
    window.localStorage.removeItem(WORKSPACE_ID_KEY);
    window.localStorage.removeItem(PROFILE_KEY);
  } catch (err) {}
}

export function getWorkspaceId() {
  try {
    return window.localStorage.getItem(WORKSPACE_ID_KEY) || '';
  } catch (err) {
    return '';
  }
}

export function setWorkspaceId(workspaceId: string) {
  try {
    window.localStorage.setItem(WORKSPACE_ID_KEY, workspaceId);
  } catch (err) {}
}

export function workspaceJoinLink(workspaceId: string) {
  if (!workspaceId || typeof window === 'undefined') return '';
  return `${window.location.origin}/#/?join=${encodeURIComponent(workspaceId)}`;
}

export function getWorkspaceJoinParam(routeSearch: string = '') {
  const routeJoin = new URLSearchParams(routeSearch || '').get('join') || '';
  if (routeJoin) return routeJoin;
  if (typeof window === 'undefined') return '';

  const pageJoin = new URLSearchParams(window.location.search || '').get('join') || '';
  if (pageJoin) return pageJoin;

  const hash = window.location.hash || '';
  const queryStart = hash.indexOf('?');
  if (queryStart === -1) return '';
  return new URLSearchParams(hash.slice(queryStart)).get('join') || '';
}

export async function backendRequest(path: string, init: RequestInit = {}) {
  const baseUrl = getBackendBaseUrl();
  if (!baseUrl) {
    throw new Error('backend_url_missing');
  }

  const headers = new Headers(init.headers || {});
  if (!(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getAuthToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const error: any = new Error(data.error || `Backend request failed with ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export async function checkBackendHealth() {
  try {
    return await backendRequest('/health');
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'backend_unreachable',
    };
  }
}

export async function fetchAgoraRtmToken(uid: string) {
  const baseUrl = getBackendBaseUrl();
  if (!baseUrl || !uid) return '';

  try {
    const data = await backendRequest(`/api/agora/rtm-token?uid=${encodeURIComponent(uid)}`);
    return data.token || '';
  } catch (err) {
    return '';
  }
}

export async function registerUser(payload: any) {
  const data = await backendRequest('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return saveAuthSession(data);
}

export async function loginUser(payload: any) {
  const data = await backendRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return saveAuthSession(data);
}

export async function fetchCurrentUser() {
  const data = await backendRequest('/api/auth/me');
  const session = getAuthSession();
  if (session && data.user) {
    return saveAuthSession({
      token: session.token,
      user: data.user,
    });
  }
  return data;
}

export function listMyWorkspaces() {
  return backendRequest('/api/workspaces');
}

export function searchUsers(query: string) {
  return backendRequest(`/api/users?q=${encodeURIComponent(query)}`);
}

export function createWorkspace(payload: any) {
  return backendRequest('/api/workspaces', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getWorkspace(workspaceId: string) {
  return backendRequest(`/api/workspaces/${encodeURIComponent(workspaceId)}`);
}

export function inviteWorkspaceUser(workspaceId: string, payload: any) {
  return backendRequest(`/api/workspaces/${encodeURIComponent(workspaceId)}/invites`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function listWorkspaceMembers(workspaceId: string) {
  return backendRequest(`/api/workspaces/${encodeURIComponent(workspaceId)}/members`);
}

export function updateWorkspaceMemberStatus(workspaceId: string, userId: string, status: string) {
  return backendRequest(`/api/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function endWorkspace(workspaceId: string) {
  return backendRequest(`/api/workspaces/${encodeURIComponent(workspaceId)}/end`, {
    method: 'POST',
  });
}

export function acquireWorkspaceLeadLock(workspaceId: string) {
  return backendRequest(`/api/workspaces/${encodeURIComponent(workspaceId)}/lead-lock`, {
    method: 'POST',
  });
}

export function releaseWorkspaceLeadLock(workspaceId: string) {
  return backendRequest(`/api/workspaces/${encodeURIComponent(workspaceId)}/lead-lock`, {
    method: 'DELETE',
  });
}

export function heartbeatWorkspacePresence(workspaceId: string, payload: any) {
  return backendRequest(`/api/workspaces/${encodeURIComponent(workspaceId)}/presence`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getWorkspacePresence(workspaceId: string) {
  return backendRequest(`/api/workspaces/${encodeURIComponent(workspaceId)}/presence`);
}

export function clearWorkspacePresence(workspaceId: string) {
  return backendRequest(`/api/workspaces/${encodeURIComponent(workspaceId)}/presence`, {
    method: 'DELETE',
  });
}

export function postAnnotationEvent(payload: any) {
  return backendRequest('/api/annotations/events', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getAnnotationHistory(workspaceId: string) {
  return backendRequest(`/api/reports/annotation-history?workspaceId=${encodeURIComponent(workspaceId)}`);
}

export function getAnnotationEvents(workspaceId: string) {
  return backendRequest(`/api/annotations/events?workspaceId=${encodeURIComponent(workspaceId)}`);
}

export function getRecentAnnotationEvents(workspaceId: string) {
  return backendRequest(`/api/annotations/recent?workspaceId=${encodeURIComponent(workspaceId)}`);
}

export function getAnnotationTimeline(workspaceId: string, annotationId: string) {
  return backendRequest(`/api/annotations/${encodeURIComponent(annotationId)}/timeline?workspaceId=${encodeURIComponent(workspaceId)}`);
}

export function getUserWiseReport(workspaceId: string) {
  return backendRequest(`/api/reports/user-wise?workspaceId=${encodeURIComponent(workspaceId)}`);
}

export function saveMeetingNote(payload: any) {
  return backendRequest('/api/meeting-notes', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getMeetingNotes(workspaceId: string) {
  return backendRequest(`/api/meeting-notes?workspaceId=${encodeURIComponent(workspaceId)}`);
}

export function generateArchive(payload: any) {
  return backendRequest('/api/archives/generate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
