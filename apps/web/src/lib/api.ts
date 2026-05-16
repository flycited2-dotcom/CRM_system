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
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;

  if (!isFormData) {
    headers.set('Content-Type', 'application/json');
  }

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

export type ClientContact = {
  id: string;
  contactType: 'phone' | 'email' | 'telegram' | 'max' | 'whatsapp' | 'other';
  value: string;
  isPrimary: boolean;
  comment?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type ClientUserSummary = {
  id: string;
  fullName: string;
  email: string;
};

export type ClientRow = {
  id: string;
  type: 'individual' | 'company';
  status: 'active' | 'inactive' | 'archived';
  name: string;
  inn?: string | null;
  kpp?: string | null;
  ogrn?: string | null;
  legalAddress?: string | null;
  actualAddress?: string | null;
  city?: string | null;
  source?: string | null;
  comment?: string | null;
  responsibleUser?: ClientUserSummary | null;
  contacts: ClientContact[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
};

export type ClientComment = {
  id: string;
  clientId: string;
  text: string;
  createdAt: string;
  user?: ClientUserSummary | null;
};

export type ClientFile = {
  id: string;
  clientId: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  storagePath: string;
  comment?: string | null;
  createdAt: string;
  uploadedBy?: ClientUserSummary | null;
};

export type ClientHistoryItem = {
  id: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  oldValueJson?: unknown;
  newValueJson?: unknown;
  createdAt: string;
  user?: ClientUserSummary | null;
};

export type ClientDetail = ClientRow & {
  comments: ClientComment[];
  files: ClientFile[];
};

export type ClientFilters = {
  search?: string;
  type?: string;
  status?: string;
  source?: string;
  city?: string;
  responsibleUserId?: string;
};

export type ClientPayload = {
  type: 'individual' | 'company';
  status?: 'active' | 'inactive' | 'archived';
  name: string;
  inn?: string;
  kpp?: string;
  ogrn?: string;
  legalAddress?: string;
  actualAddress?: string;
  city?: string;
  source?: string;
  responsibleUserId?: string;
  comment?: string;
  contacts?: Array<{
    contactType: ClientContact['contactType'];
    value: string;
    isPrimary?: boolean;
    comment?: string;
  }>;
};

function toQueryString(filters: ClientFilters) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });

  const query = params.toString();
  return query ? `?${query}` : '';
}

export async function fetchClients(filters: ClientFilters = {}) {
  return apiRequest<ClientRow[]>(`/clients${toQueryString(filters)}`);
}

export async function fetchClient(id: string) {
  return apiRequest<ClientDetail>(`/clients/${id}`);
}

export async function createClient(payload: ClientPayload) {
  return apiRequest<ClientDetail>('/clients', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateClient(id: string, payload: Partial<ClientPayload>) {
  return apiRequest<ClientDetail>(`/clients/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export async function deleteClient(id: string) {
  return apiRequest<{ success: boolean }>(`/clients/${id}`, {
    method: 'DELETE'
  });
}

export async function addClientContact(
  id: string,
  payload: {
    contactType: ClientContact['contactType'];
    value: string;
    isPrimary?: boolean;
    comment?: string;
  }
) {
  return apiRequest<ClientContact>(`/clients/${id}/contacts`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateClientContact(
  id: string,
  contactId: string,
  payload: Partial<ClientContact>
) {
  return apiRequest<ClientContact>(`/clients/${id}/contacts/${contactId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export async function deleteClientContact(id: string, contactId: string) {
  return apiRequest<{ success: boolean }>(`/clients/${id}/contacts/${contactId}`, {
    method: 'DELETE'
  });
}

export async function addClientComment(id: string, text: string) {
  return apiRequest<ClientComment>(`/clients/${id}/comments`, {
    method: 'POST',
    body: JSON.stringify({ text })
  });
}

export async function uploadClientFile(id: string, file: File, comment: string) {
  const formData = new FormData();
  formData.set('file', file);

  if (comment) {
    formData.set('comment', comment);
  }

  return apiRequest<ClientFile>(`/clients/${id}/files`, {
    method: 'POST',
    body: formData
  });
}

export async function fetchClientHistory(id: string) {
  return apiRequest<ClientHistoryItem[]>(`/clients/${id}/history`);
}
