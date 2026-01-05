'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { adminApi } from '@/lib/api';

interface PremiumRequest {
  id: string;
  user_id: string;
  phone_number: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  admin_note: string | null;
  created_at: string;
  processed_at: string | null;
  processed_by: string | null;
  user: {
    id: string;
    steam_id: string;
    username: string;
    avatar_url: string | null;
    mmr: number;
    is_premium: boolean;
  };
}

interface Stats {
  requests: {
    pending: number;
    approved: number;
    rejected: number;
    total: number;
  };
  users: {
    total: number;
    premium: number;
  };
}

export default function AdminPage() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [token, setToken] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [activeTab, setActiveTab] = useState<'pending' | 'all' | 'stats'>('pending');
  const [stats, setStats] = useState<Stats | null>(null);
  const [pendingRequests, setPendingRequests] = useState<PremiumRequest[]>([]);
  const [allRequests, setAllRequests] = useState<PremiumRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [actionNote, setActionNote] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    const savedToken = localStorage.getItem('admin_token');
    if (savedToken) {
      verifyToken(savedToken);
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn && token) {
      loadData();
    }
  }, [isLoggedIn, token, activeTab]);

  async function verifyToken(savedToken: string) {
    try {
      await adminApi.getMe(savedToken);
      setToken(savedToken);
      setIsLoggedIn(true);
    } catch (err) {
      localStorage.removeItem('admin_token');
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError('');

    try {
      const result = await adminApi.login(login, password);
      setToken(result.token);
      setIsLoggedIn(true);
      localStorage.setItem('admin_token', result.token);
    } catch (err: any) {
      setLoginError(err.message || 'Неверный логин или пароль');
    } finally {
      setIsLoggingIn(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem('admin_token');
    setToken('');
    setIsLoggedIn(false);
    setLogin('');
    setPassword('');
  }

  async function loadData() {
    setIsLoading(true);
    try {
      if (activeTab === 'stats') {
        const statsData = await adminApi.getStats(token);
        setStats(statsData);
      } else if (activeTab === 'pending') {
        const requests = await adminApi.getPendingRequests(token);
        setPendingRequests(requests);
      } else {
        const requests = await adminApi.getAllRequests(token, 50);
        setAllRequests(requests);
      }
    } catch (err) {
      console.error('Ошибка загрузки данных:', err);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleApprove(id: string) {
    setProcessingId(id);
    try {
      await adminApi.approveRequest(token, id, actionNote);
      setActionNote('');
      await loadData();
      if (activeTab === 'pending') {
        const statsData = await adminApi.getStats(token);
        setStats(statsData);
      }
    } catch (err: any) {
      alert(err.message || 'Ошибка одобрения запроса');
    } finally {
      setProcessingId(null);
    }
  }

  async function handleReject(id: string) {
    setProcessingId(id);
    try {
      await adminApi.rejectRequest(token, id, actionNote);
      setActionNote('');
      await loadData();
      if (activeTab === 'pending') {
        const statsData = await adminApi.getStats(token);
        setStats(statsData);
      }
    } catch (err: any) {
      alert(err.message || 'Ошибка отклонения запроса');
    } finally {
      setProcessingId(null);
    }
  }

  // Форма входа
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="bg-gray-800 rounded-lg p-8 w-full max-w-md">
          <h1 className="text-2xl font-bold text-white mb-6 text-center">
            Админ-панель
          </h1>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="login" className="block text-gray-300 mb-2">
                Логин
              </label>
              <input
                type="text"
                id="login"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-orange-500"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-gray-300 mb-2">
                Пароль
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-orange-500"
                required
              />
            </div>

            {loginError && (
              <div className="bg-red-900/30 border border-red-500 text-red-400 px-4 py-3 rounded-lg">
                {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-600 text-white font-bold py-3 rounded-lg transition-colors"
            >
              {isLoggingIn ? 'Вход...' : 'Войти'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Панель администратора
  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">Faceit.TJ - Админ</h1>
          <button
            onClick={handleLogout}
            className="text-gray-400 hover:text-white transition-colors"
          >
            Выйти
          </button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Быстрая статистика */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-yellow-900/30 border border-yellow-500 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-yellow-500">{stats.requests.pending}</div>
              <div className="text-gray-400">Ожидают</div>
            </div>
            <div className="bg-green-900/30 border border-green-500 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-green-500">{stats.requests.approved}</div>
              <div className="text-gray-400">Одобрено</div>
            </div>
            <div className="bg-blue-900/30 border border-blue-500 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-blue-500">{stats.users.total}</div>
              <div className="text-gray-400">Пользователей</div>
            </div>
            <div className="bg-orange-900/30 border border-orange-500 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-orange-500">{stats.users.premium}</div>
              <div className="text-gray-400">Премиум</div>
            </div>
          </div>
        )}

        {/* Табы */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'pending'
                ? 'bg-orange-500 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Ожидающие {stats ? `(${stats.requests.pending})` : ''}
          </button>
          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'all'
                ? 'bg-orange-500 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Все запросы
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'stats'
                ? 'bg-orange-500 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Статистика
          </button>
        </div>

        {/* Контент */}
        {isLoading ? (
          <div className="text-center text-gray-400 py-8">Загрузка...</div>
        ) : (
          <>
            {/* Ожидающие запросы */}
            {activeTab === 'pending' && (
              <div className="space-y-4">
                {pendingRequests.length === 0 ? (
                  <div className="bg-gray-800 rounded-lg p-8 text-center text-gray-400">
                    Нет ожидающих запросов
                  </div>
                ) : (
                  pendingRequests.map((request) => (
                    <RequestCard
                      key={request.id}
                      request={request}
                      actionNote={actionNote}
                      setActionNote={setActionNote}
                      onApprove={() => handleApprove(request.id)}
                      onReject={() => handleReject(request.id)}
                      isProcessing={processingId === request.id}
                    />
                  ))
                )}
              </div>
            )}

            {/* Все запросы */}
            {activeTab === 'all' && (
              <div className="space-y-4">
                {allRequests.length === 0 ? (
                  <div className="bg-gray-800 rounded-lg p-8 text-center text-gray-400">
                    Нет запросов
                  </div>
                ) : (
                  allRequests.map((request) => (
                    <RequestCard
                      key={request.id}
                      request={request}
                      showActions={request.status === 'pending'}
                      actionNote={actionNote}
                      setActionNote={setActionNote}
                      onApprove={() => handleApprove(request.id)}
                      onReject={() => handleReject(request.id)}
                      isProcessing={processingId === request.id}
                    />
                  ))
                )}
              </div>
            )}

            {/* Статистика */}
            {activeTab === 'stats' && stats && (
              <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-gray-800 rounded-lg p-6">
                  <h3 className="text-xl font-bold text-white mb-4">Запросы на премиум</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Ожидают:</span>
                      <span className="text-yellow-500 font-bold">{stats.requests.pending}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Одобрено:</span>
                      <span className="text-green-500 font-bold">{stats.requests.approved}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Отклонено:</span>
                      <span className="text-red-500 font-bold">{stats.requests.rejected}</span>
                    </div>
                    <div className="border-t border-gray-700 pt-3 flex justify-between">
                      <span className="text-gray-300">Всего:</span>
                      <span className="text-white font-bold">{stats.requests.total}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-800 rounded-lg p-6">
                  <h3 className="text-xl font-bold text-white mb-4">Пользователи</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Всего:</span>
                      <span className="text-blue-500 font-bold">{stats.users.total}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">С премиумом:</span>
                      <span className="text-orange-500 font-bold">{stats.users.premium}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Без премиума:</span>
                      <span className="text-gray-500 font-bold">{stats.users.total - stats.users.premium}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

interface RequestCardProps {
  request: PremiumRequest;
  showActions?: boolean;
  actionNote: string;
  setActionNote: (note: string) => void;
  onApprove: () => void;
  onReject: () => void;
  isProcessing: boolean;
}

function RequestCard({
  request,
  showActions = true,
  actionNote,
  setActionNote,
  onApprove,
  onReject,
  isProcessing,
}: RequestCardProps) {
  const statusColors = {
    pending: 'text-yellow-500 bg-yellow-900/30 border-yellow-500',
    approved: 'text-green-500 bg-green-900/30 border-green-500',
    rejected: 'text-red-500 bg-red-900/30 border-red-500',
  };

  const statusLabels = {
    pending: 'Ожидает',
    approved: 'Одобрено',
    rejected: 'Отклонено',
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex flex-col md:flex-row md:items-start gap-4">
        {/* Пользователь */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {request.user.avatar_url ? (
            <img
              src={request.user.avatar_url}
              alt={request.user.username}
              className="w-12 h-12 rounded-full"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center text-gray-400">
              ?
            </div>
          )}
          <div>
            <div className="text-white font-semibold">{request.user.username}</div>
            <div className="text-gray-400 text-sm">MMR: {request.user.mmr}</div>
          </div>
        </div>

        {/* Информация о запросе */}
        <div className="flex-grow">
          <div className="flex flex-wrap gap-4 text-sm mb-2">
            <div>
              <span className="text-gray-400">Телефон: </span>
              <span className="text-white font-mono">{request.phone_number}</span>
            </div>
            <div>
              <span className="text-gray-400">Сумма: </span>
              <span className="text-white">{request.amount} сомони</span>
            </div>
            <div>
              <span className="text-gray-400">Дата: </span>
              <span className="text-white">
                {new Date(request.created_at).toLocaleString('ru-RU')}
              </span>
            </div>
          </div>

          <span className={`inline-block px-3 py-1 rounded-full text-sm border ${statusColors[request.status]}`}>
            {statusLabels[request.status]}
          </span>

          {request.admin_note && (
            <div className="mt-2 text-sm text-gray-400">
              Заметка: {request.admin_note}
            </div>
          )}

          {request.processed_by && (
            <div className="mt-1 text-sm text-gray-500">
              Обработал: {request.processed_by} ({new Date(request.processed_at!).toLocaleString('ru-RU')})
            </div>
          )}
        </div>

        {/* Действия */}
        {showActions && request.status === 'pending' && (
          <div className="flex flex-col gap-2 min-w-[200px]">
            <input
              type="text"
              placeholder="Заметка (опционально)"
              value={actionNote}
              onChange={(e) => setActionNote(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
            />
            <div className="flex gap-2">
              <button
                onClick={onApprove}
                disabled={isProcessing}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-4 py-2 rounded transition-colors text-sm"
              >
                {isProcessing ? '...' : 'Одобрить'}
              </button>
              <button
                onClick={onReject}
                disabled={isProcessing}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white px-4 py-2 rounded transition-colors text-sm"
              >
                {isProcessing ? '...' : 'Отклонить'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
