'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { premiumApi } from '@/lib/api';
import { getSteamLoginUrl } from '@/lib/auth';
import Header from '@/components/layout/Header';

interface PremiumInfo {
  price: number;
  currency: string;
  duration: string;
  phone: string;
  features: string[];
}

interface PremiumStatus {
  isPremium: boolean;
  premiumUntil: string | null;
  hasPendingRequest: boolean;
  pendingRequest: {
    id: string;
    phoneNumber: string;
    amount: number;
    createdAt: string;
  } | null;
}

export default function PremiumPage() {
  const router = useRouter();
  const { user, token, isLoading: authLoading } = useAuth();
  const [premiumInfo, setPremiumInfo] = useState<PremiumInfo | null>(null);
  const [premiumStatus, setPremiumStatus] = useState<PremiumStatus | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadPremiumInfo();
  }, []);

  useEffect(() => {
    if (token) {
      loadPremiumStatus();
    }
  }, [token]);

  async function loadPremiumInfo() {
    try {
      const info = await premiumApi.getInfo();
      setPremiumInfo(info);
    } catch (err) {
      console.error('Ошибка загрузки информации:', err);
    }
  }

  async function loadPremiumStatus() {
    if (!token) return;
    try {
      const status = await premiumApi.getStatus(token);
      setPremiumStatus(status);
    } catch (err) {
      console.error('Ошибка загрузки статуса:', err);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) {
      setError('Необходимо войти в систему');
      return;
    }

    if (!phoneNumber || phoneNumber.length < 9) {
      setError('Укажите корректный номер телефона');
      return;
    }

    setIsSubmitting(true);
    setError('');
    setSuccess('');

    try {
      await premiumApi.sendRequest(token, phoneNumber);
      setSuccess('Запрос отправлен! Ожидайте подтверждения после проверки оплаты.');
      setPhoneNumber('');
      await loadPremiumStatus();
    } catch (err: any) {
      setError(err.message || 'Не удалось отправить запрос');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-900">
        <Header />
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-white text-xl">Загрузка...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <Header />

      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-white mb-8 text-center">
          Premium подписка
        </h1>

        <div className="max-w-2xl mx-auto">
          {/* Информация о премиуме */}
          <div className="bg-gray-800 rounded-lg p-6 mb-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-orange-500">Premium</h2>
              {premiumInfo && (
                <div className="text-right">
                  <div className="text-3xl font-bold text-white">
                    {premiumInfo.price} {premiumInfo.currency}
                  </div>
                  <div className="text-gray-400">за {premiumInfo.duration}</div>
                </div>
              )}
            </div>

            {premiumInfo && (
              <div className="space-y-3 mb-6">
                <h3 className="text-lg font-semibold text-white mb-3">Преимущества:</h3>
                {premiumInfo.features.map((feature, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-gray-300">{feature}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Текущий статус */}
          {premiumStatus?.isPremium && (
            <div className="bg-green-900/30 border border-green-500 rounded-lg p-6 mb-8">
              <div className="flex items-center gap-3 mb-2">
                <svg className="w-6 h-6 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <h3 className="text-xl font-bold text-green-500">У вас активная подписка!</h3>
              </div>
              <p className="text-gray-300">
                Действует до: {new Date(premiumStatus.premiumUntil!).toLocaleDateString('ru-RU', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                })}
              </p>
            </div>
          )}

          {/* Ожидающий запрос */}
          {premiumStatus?.hasPendingRequest && premiumStatus.pendingRequest && (
            <div className="bg-yellow-900/30 border border-yellow-500 rounded-lg p-6 mb-8">
              <div className="flex items-center gap-3 mb-2">
                <svg className="w-6 h-6 text-yellow-500 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                </svg>
                <h3 className="text-xl font-bold text-yellow-500">Запрос на рассмотрении</h3>
              </div>
              <p className="text-gray-300 mb-2">
                Ваш запрос на активацию подписки ожидает проверки оплаты.
              </p>
              <p className="text-gray-400 text-sm">
                Номер телефона: {premiumStatus.pendingRequest.phoneNumber}
              </p>
              <p className="text-gray-400 text-sm">
                Дата запроса: {new Date(premiumStatus.pendingRequest.createdAt).toLocaleString('ru-RU')}
              </p>
            </div>
          )}

          {/* Форма покупки */}
          {!user ? (
            <div className="bg-gray-800 rounded-lg p-6 text-center">
              <p className="text-gray-300 mb-4">Для покупки подписки необходимо войти в систему</p>
              <a
                href={getSteamLoginUrl()}
                className="inline-flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white px-6 py-3 rounded-lg transition-colors"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3l-.5 3H13v6.95c5.05-.5 9-4.76 9-9.95 0-5.52-4.48-10-10-10z"/>
                </svg>
                Войти через Steam
              </a>
            </div>
          ) : !premiumStatus?.isPremium && !premiumStatus?.hasPendingRequest ? (
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-xl font-bold text-white mb-4">Оформить подписку</h3>

              <div className="bg-gray-700/50 rounded-lg p-4 mb-6">
                <h4 className="text-lg font-semibold text-white mb-2">Инструкция:</h4>
                <ol className="list-decimal list-inside text-gray-300 space-y-2">
                  <li>Переведите {premiumInfo?.price} {premiumInfo?.currency} на номер: <span className="text-orange-400 font-mono">{premiumInfo?.phone}</span></li>
                  <li>Укажите ваш номер телефона (с которого была оплата)</li>
                  <li>Нажмите "Отправить запрос"</li>
                  <li>Дождитесь подтверждения от модератора</li>
                </ol>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="phone" className="block text-gray-300 mb-2">
                    Номер телефона (с которого оплачивали)
                  </label>
                  <input
                    type="tel"
                    id="phone"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="+992 XXX XXX XXX"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:border-orange-500"
                    required
                  />
                </div>

                {error && (
                  <div className="bg-red-900/30 border border-red-500 text-red-400 px-4 py-3 rounded-lg">
                    {error}
                  </div>
                )}

                {success && (
                  <div className="bg-green-900/30 border border-green-500 text-green-400 px-4 py-3 rounded-lg">
                    {success}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition-colors"
                >
                  {isSubmitting ? 'Отправка...' : 'Отправить запрос'}
                </button>
              </form>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
