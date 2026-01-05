'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get('token');
    const errorParam = searchParams.get('error');

    if (errorParam) {
      setError('Authentication failed. Please try again.');
      return;
    }

    if (!token) {
      setError('No authentication token received.');
      return;
    }

    login(token)
      .then(() => {
        router.push('/play');
      })
      .catch((err) => {
        setError(err.message || 'Failed to authenticate');
      });
  }, [searchParams, login, router]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="glass-panel rounded-xl p-8 max-w-md text-center">
          <span className="material-symbols-outlined text-6xl text-danger mb-4">error</span>
          <h1 className="text-2xl font-bold text-white mb-4">Authentication Error</h1>
          <p className="text-gray-400 mb-6">{error}</p>
          <a
            href="/"
            className="inline-block px-6 py-3 bg-primary text-background-dark font-bold rounded-lg hover:shadow-neon transition-all"
          >
            Go Home
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="glass-panel rounded-xl p-8 max-w-md text-center">
        <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-white mb-2">Authenticating...</h1>
        <p className="text-gray-400">Please wait while we log you in.</p>
      </div>
    </div>
  );
}
