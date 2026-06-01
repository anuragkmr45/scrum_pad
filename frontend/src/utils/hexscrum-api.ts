export type HexscrumProfile = {
  userId: string
  name: string
  designation: string
  color: string
}

const PROFILE_KEY = 'hexscrum_profile';
const WORKSPACE_ID_KEY = 'hexscrum_workspace_id';
const DEFAULT_COLOR = '#2563EB';

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
  return {
    userId: stored.userId || '',
    name: stored.name || '',
    designation: stored.designation || '',
    color: stored.color || DEFAULT_COLOR,
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

export async function backendRequest(path: string, init: RequestInit = {}) {
  const baseUrl = getBackendBaseUrl();
  if (!baseUrl) {
    throw new Error('backend_url_missing');
  }

  const headers = new Headers(init.headers || {});
  if (!(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
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

export function createWorkspace(payload: any) {
  return backendRequest('/api/workspaces', {
    method: 'POST',
    body: JSON.stringify(payload),
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
