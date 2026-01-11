import { getApiUrl } from './auth';

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

  const response = await fetch(`${getApiUrl()}${endpoint}`, {
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
  join: (token: string, code: string, team: 1 | 2) =>
    request<any>(`/api/lobby/${code}/join`, { method: 'POST', token, body: { team } }),
  switchTeam: (token: string, code: string, team: 1 | 2) =>
    request<any>(`/api/lobby/${code}/switch-team`, { method: 'POST', token, body: { team } }),
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
  getMyActive: (token: string) => request<any>('/api/matches/my-active', { token }),
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

// Stats API (public)
export const statsApi = {
  get: () => request<{
    onlinePlayers: number;
    matchesToday: number;
    totalPlayers: number;
    playersWithMatches: number;
  }>('/api/stats'),
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
  addServer: (token: string, data: { name: string; ip: string; port: string; rconPassword: string; internalIp?: string }) =>
    request<any>('/api/admin/servers', { method: 'POST', token, body: data }),
  updateServer: (token: string, id: string, data: { name?: string; ip?: string; port?: string; rconPassword?: string; internalIp?: string }) =>
    request<any>(`/api/admin/servers/${id}`, { method: 'PUT', token, body: data }),
  deleteServer: (token: string, id: string) =>
    request<any>(`/api/admin/servers/${id}`, { method: 'DELETE', token }),
  setServerOnline: (token: string, id: string) =>
    request<any>(`/api/admin/servers/${id}/online`, { method: 'POST', token }),
  setServerOffline: (token: string, id: string) =>
    request<any>(`/api/admin/servers/${id}/offline`, { method: 'POST', token }),
  resetStuckServers: (token: string) =>
    request<any>('/api/admin/servers/reset-stuck', { method: 'POST', token }),
  getMatches: (token: string) => request<any>('/api/admin/matches', { token }),
  getUsers: (token: string, limit?: number) =>
    request<any>(`/api/admin/users${limit ? `?limit=${limit}` : ''}`, { token }),
  // Premium settings
  getPremiumSettings: (token: string) =>
    request<{ enabled: boolean; price: number; currency: string; duration_days: number }>('/api/admin/settings/premium', { token }),
  updatePremiumSettings: (token: string, data: { enabled: boolean; price: number; currency: string; duration_days: number }) =>
    request<any>('/api/admin/settings/premium', { method: 'PUT', token, body: data }),
};
