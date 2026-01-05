const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: any;
  token?: string;
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

// Auth API
export const authApi = {
  getMe: (token: string) => request<any>('/api/auth/me', { token }),
  logout: (token: string) => request<any>('/api/auth/logout', { method: 'POST', token }),
};

// Matchmaking API
export const matchmakingApi = {
  join: (token: string) => request<any>('/api/matchmaking/join', { method: 'POST', token }),
  leave: (token: string) => request<any>('/api/matchmaking/leave', { method: 'DELETE', token }),
  status: (token?: string) => request<any>('/api/matchmaking/status', { token }),
};

// Lobby API
export const lobbyApi = {
  create: (token: string, map: string) =>
    request<any>('/api/lobby/create', { method: 'POST', token, body: { map } }),
  get: (code: string) => request<any>(`/api/lobby/${code}`),
  join: (token: string, code: string) =>
    request<any>(`/api/lobby/${code}/join`, { method: 'POST', token }),
  leave: (token: string, code: string) =>
    request<any>(`/api/lobby/${code}/leave`, { method: 'POST', token }),
  start: (token: string, code: string) =>
    request<any>(`/api/lobby/${code}/start`, { method: 'POST', token }),
  cancel: (token: string, code: string) =>
    request<any>(`/api/lobby/${code}/cancel`, { method: 'DELETE', token }),
};

// Matches API
export const matchesApi = {
  get: (id: string, token?: string) => request<any>(`/api/matches/${id}`, { token }),
  getActive: () => request<any>('/api/matches'),
  getHistory: (token: string, limit?: number) =>
    request<any>(`/api/matches/history${limit ? `?limit=${limit}` : ''}`, { token }),
};

// Premium API
export const premiumApi = {
  getInfo: () => request<any>('/api/premium/info'),
  getStatus: (token: string) => request<any>('/api/premium/status', { token }),
  sendRequest: (token: string, phoneNumber: string) =>
    request<any>('/api/premium/request', { method: 'POST', token, body: { phoneNumber } }),
};

// Admin API
export const adminApi = {
  login: (login: string, password: string) =>
    request<any>('/api/admin/login', { method: 'POST', body: { login, password } }),
  getMe: (token: string) => request<any>('/api/admin/me', { token }),
  getStats: (token: string) => request<any>('/api/admin/stats', { token }),
  getPendingRequests: (token: string) =>
    request<any>('/api/admin/premium-requests/pending', { token }),
  getAllRequests: (token: string, limit?: number) =>
    request<any>(`/api/admin/premium-requests${limit ? `?limit=${limit}` : ''}`, { token }),
  approveRequest: (token: string, id: string, note?: string) =>
    request<any>(`/api/admin/premium-requests/${id}/approve`, { method: 'POST', token, body: { note } }),
  rejectRequest: (token: string, id: string, note?: string) =>
    request<any>(`/api/admin/premium-requests/${id}/reject`, { method: 'POST', token, body: { note } }),
  getServers: (token: string) => request<any>('/api/admin/servers', { token }),
  getMatches: (token: string) => request<any>('/api/admin/matches', { token }),
  getUsers: (token: string, limit?: number) =>
    request<any>(`/api/admin/users${limit ? `?limit=${limit}` : ''}`, { token }),
};
