export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  roleName: string;
  permissions: string[];
};

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
  workSessionId?: string;
};

const ACCESS_TOKEN_KEY = 'crm.accessToken';
const REFRESH_TOKEN_KEY = 'crm.refreshToken';
const USER_KEY = 'crm.user';

export function saveSession(session: AuthSession) {
  localStorage.setItem(ACCESS_TOKEN_KEY, session.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, session.refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(session.user));
}

export function clearSession() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getAccessToken() {
  if (typeof window === 'undefined') {
    return null;
  }

  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken() {
  if (typeof window === 'undefined') {
    return null;
  }

  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function getStoredUser(): SessionUser | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const rawUser = localStorage.getItem(USER_KEY);

  if (!rawUser) {
    return null;
  }

  try {
    return JSON.parse(rawUser) as SessionUser;
  } catch {
    clearSession();
    return null;
  }
}
