import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  saveSession,
  type AuthSession,
  type SessionUser
} from './auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

type ApiErrorBody = {
  success: false;
  error: {
    code: string;
    message: string;
    details: string[];
  };
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    const errorBody = body as ApiErrorBody | null;
    throw new ApiError(
      errorBody?.error?.message ?? 'Ошибка запроса',
      response.status,
      errorBody?.error?.code
    );
  }

  return body as T;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}) {
  const token = getAccessToken();
  const headers = new Headers(init.headers);

  headers.set('Content-Type', 'application/json');

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers
  });

  return parseResponse<T>(response);
}

export async function login(email: string, password: string) {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, password })
  });
  const session = await parseResponse<AuthSession>(response);
  saveSession(session);
  return session;
}

export async function logout() {
  const refreshToken = getRefreshToken();

  try {
    await apiRequest('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken })
    });
  } finally {
    clearSession();
  }
}

export async function fetchMe() {
  return apiRequest<{ user: SessionUser }>('/auth/me');
}

export type UserRow = {
  id: string;
  fullName: string;
  email: string;
  phone?: string | null;
  status: string;
  isActive: boolean;
  lastLoginAt?: string | null;
  lastLogoutAt?: string | null;
  role: {
    code: string;
    name: string;
  };
};

export async function fetchUsers() {
  return apiRequest<UserRow[]>('/users');
}
