'use client';

const TOKEN_KEY = 'faceit_token';

export function getApiUrl(): string {
  if (typeof window === 'undefined') {
    // SSR: используем env переменную или пустую строку (для относительных путей)
    return process.env.NEXT_PUBLIC_API_URL || '';
  }
  // В браузере используем тот же origin (nginx проксирует /api на backend)
  return window.location.origin;
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
}

export function removeToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
}

export function getSteamLoginUrl(): string {
  // На сервере возвращаем placeholder, который будет заменён на клиенте
  if (typeof window === 'undefined') {
    return '#';
  }
  return `${getApiUrl()}/api/auth/steam`;
}
