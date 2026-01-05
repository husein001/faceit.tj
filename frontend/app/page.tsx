'use client';

import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { getSteamLoginUrl } from '@/lib/auth';

export default function HomePage() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="relative">
      {/* Background Elements */}
      <div className="fixed inset-0 z-[-1] bg-background-dark">
        <div className="absolute top-[-20%] left-[20%] w-[60%] h-[500px] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[400px] rounded-full bg-background-secondary blur-[100px]" />
      </div>

      {/* Hero Section */}
      <section className="relative flex items-center justify-center min-h-[85vh] w-full overflow-hidden">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-b from-background-dark/80 via-background-dark/60 to-background-dark z-10" />
          <div className="w-full h-full bg-cover bg-center bg-no-repeat transform scale-105 opacity-30"
               style={{ backgroundImage: "url('https://images.unsplash.com/photo-1542751371-adc38448a05e?w=1920')" }} />
        </div>

        <div className="relative z-20 container mx-auto px-4 flex flex-col items-center text-center gap-8 max-w-4xl">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm animate-pulse">
            <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.8)]" />
            <span className="text-xs font-semibold text-green-400 tracking-wide uppercase">
              Серверы онлайн
            </span>
          </div>

          <h1 className="text-5xl md:text-7xl font-black leading-tight tracking-tight uppercase drop-shadow-2xl">
            <span className="block text-white">Доминируй</span>
            <span className="text-gradient">в Центральной Азии</span>
          </h1>

          <p className="text-lg md:text-xl text-gray-300 font-light max-w-2xl leading-relaxed">
            Платформа рейтингового матчмейкинга для{' '}
            <span className="text-primary font-semibold">Таджикистана</span> и{' '}
            <span className="text-primary font-semibold">Узбекистана</span>.
            Низкий пинг, честная конкуренция и мгновенные награды.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 w-full justify-center mt-4">
            {isAuthenticated ? (
              <Link
                href="/play"
                className="group relative flex items-center justify-center gap-3 px-8 py-4 bg-primary text-background-dark text-lg font-black uppercase tracking-wider rounded-lg shadow-neon hover:shadow-neon-hover transform hover:-translate-y-1 transition-all duration-300 w-full sm:w-auto overflow-hidden"
              >
                <span className="material-symbols-outlined font-bold">play_arrow</span>
                <span>НАЙТИ МАТЧ</span>
              </Link>
            ) : (
              <a
                href={getSteamLoginUrl()}
                className="group relative flex items-center justify-center gap-3 px-8 py-4 bg-primary text-background-dark text-lg font-black uppercase tracking-wider rounded-lg shadow-neon hover:shadow-neon-hover transform hover:-translate-y-1 transition-all duration-300 w-full sm:w-auto overflow-hidden"
              >
                <span className="material-symbols-outlined font-bold">login</span>
                <span>ВОЙТИ ЧЕРЕЗ STEAM</span>
              </a>
            )}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="relative z-30 -mt-20 pb-20 px-4">
        <div className="container mx-auto max-w-5xl">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 glass-panel rounded-2xl p-6 md:p-8 shadow-2xl">
            <div className="flex flex-col items-center justify-center gap-1 border-b md:border-b-0 md:border-r border-white/10 pb-4 md:pb-0 md:pr-4">
              <div className="text-gray-400 text-sm font-medium uppercase tracking-wider">Игроков онлайн</div>
              <div className="text-4xl font-black text-white flex items-center gap-2">
                --<span className="text-primary text-2xl">+</span>
              </div>
            </div>
            <div className="flex flex-col items-center justify-center gap-1 border-b md:border-b-0 md:border-r border-white/10 pb-4 md:pb-0 md:px-4">
              <div className="text-gray-400 text-sm font-medium uppercase tracking-wider">Матчей сегодня</div>
              <div className="text-4xl font-black text-white flex items-center gap-2">
                --<span className="text-primary text-2xl">+</span>
              </div>
            </div>
            <div className="flex flex-col items-center justify-center gap-1 pt-4 md:pt-0 md:pl-4">
              <div className="text-gray-400 text-sm font-medium uppercase tracking-wider">Всего игроков</div>
              <div className="text-4xl font-black text-white flex items-center gap-2">
                --<span className="text-primary text-2xl">+</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 relative bg-background-dark">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="flex flex-col gap-4 mb-16 text-center">
            <h2 className="text-3xl md:text-4xl font-black text-white uppercase tracking-tight">
              Как это <span className="text-primary">работает</span>
            </h2>
            <p className="text-gray-400 max-w-2xl mx-auto">
              Начни путь к вершине рейтинга за три простых шага.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Step 1 */}
            <div className="glass-panel glass-panel-hover rounded-xl p-8 flex flex-col gap-6 group transition-all duration-300">
              <div className="w-14 h-14 rounded-lg bg-background-secondary flex items-center justify-center border border-white/10 group-hover:border-primary/50 group-hover:shadow-[0_0_15px_rgba(0,217,255,0.3)] transition-all">
                <span className="material-symbols-outlined text-3xl text-primary">login</span>
              </div>
              <div>
                <div className="text-primary font-bold text-sm mb-2 uppercase tracking-wider opacity-70">Шаг 01</div>
                <h3 className="text-xl font-bold text-white mb-2">Войди через Steam</h3>
                <p className="text-gray-400 text-sm leading-relaxed">
                  Безопасная авторизация через официальный Steam API.
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="glass-panel glass-panel-hover rounded-xl p-8 flex flex-col gap-6 group transition-all duration-300">
              <div className="w-14 h-14 rounded-lg bg-background-secondary flex items-center justify-center border border-white/10 group-hover:border-primary/50 group-hover:shadow-[0_0_15px_rgba(0,217,255,0.3)] transition-all">
                <span className="material-symbols-outlined text-3xl text-primary">search</span>
              </div>
              <div>
                <div className="text-primary font-bold text-sm mb-2 uppercase tracking-wider opacity-70">Шаг 02</div>
                <h3 className="text-xl font-bold text-white mb-2">Найди матч</h3>
                <p className="text-gray-400 text-sm leading-relaxed">
                  Встань в очередь и играй с игроками своего уровня.
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="glass-panel glass-panel-hover rounded-xl p-8 flex flex-col gap-6 group transition-all duration-300">
              <div className="w-14 h-14 rounded-lg bg-background-secondary flex items-center justify-center border border-white/10 group-hover:border-primary/50 group-hover:shadow-[0_0_15px_rgba(0,217,255,0.3)] transition-all">
                <span className="material-symbols-outlined text-3xl text-primary">trophy</span>
              </div>
              <div>
                <div className="text-primary font-bold text-sm mb-2 uppercase tracking-wider opacity-70">Шаг 03</div>
                <h3 className="text-xl font-bold text-white mb-2">Побеждай и расти</h3>
                <p className="text-gray-400 text-sm leading-relaxed">
                  Выигрывай матчи, повышай MMR и поднимайся в рейтинге.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Premium Section */}
      <section className="py-20 bg-background-secondary relative overflow-hidden">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-primary/5 to-transparent" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-primary/10 rounded-full blur-[80px]" />

        <div className="container mx-auto px-4 max-w-6xl relative z-10">
          <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
            <div className="w-full lg:w-1/2 flex flex-col gap-6">
              <h2 className="text-3xl md:text-5xl font-black text-white uppercase leading-none">
                Открой <span className="text-primary">Premium</span> статус
              </h2>
              <p className="text-gray-300 text-lg leading-relaxed">
                Создавай кастомные лобби, приглашай друзей и играй по своим правилам.
                Premium пользователи получают эксклюзивный доступ к дополнительным функциям.
              </p>
              <ul className="flex flex-col gap-4 mt-2">
                <li className="flex items-center gap-4 text-gray-200">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/20 text-primary">
                    <span className="material-symbols-outlined text-sm font-bold">check</span>
                  </span>
                  <span className="font-medium">Создание кастомных лобби</span>
                </li>
                <li className="flex items-center gap-4 text-gray-200">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/20 text-primary">
                    <span className="material-symbols-outlined text-sm font-bold">check</span>
                  </span>
                  <span className="font-medium">Выбор карты</span>
                </li>
                <li className="flex items-center gap-4 text-gray-200">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/20 text-primary">
                    <span className="material-symbols-outlined text-sm font-bold">check</span>
                  </span>
                  <span className="font-medium">Приглашение друзей по ссылке</span>
                </li>
                <li className="flex items-center gap-4 text-gray-200">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/20 text-primary">
                    <span className="material-symbols-outlined text-sm font-bold">check</span>
                  </span>
                  <span className="font-medium">Приоритетный доступ к серверам</span>
                </li>
              </ul>
              <div className="pt-6">
                <Link
                  href="/premium"
                  className="inline-block px-8 py-3 bg-transparent border border-primary text-primary hover:bg-primary hover:text-background-dark font-bold uppercase tracking-wider rounded transition-all duration-300 shadow-[0_0_10px_rgba(0,217,255,0.1)] hover:shadow-[0_0_20px_rgba(0,217,255,0.4)]"
                >
                  Подробнее
                </Link>
              </div>
            </div>
            <div className="w-full lg:w-1/2">
              <div className="relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
                <div className="absolute inset-0 bg-primary/20 mix-blend-overlay z-10" />
                <div className="w-full aspect-video bg-gradient-to-br from-background-secondary to-background-dark flex items-center justify-center">
                  <span className="material-symbols-outlined text-8xl text-primary/50">workspace_premium</span>
                </div>
                <div className="absolute bottom-6 right-6 bg-background-dark/90 backdrop-blur border border-primary text-primary px-4 py-2 rounded font-bold text-sm z-20 shadow-neon">
                  ТОЛЬКО PREMIUM
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 relative">
        <div className="container mx-auto px-4 text-center max-w-3xl relative z-10">
          <h2 className="text-4xl md:text-5xl font-black text-white mb-6 uppercase">Готов к соревнованиям?</h2>
          <p className="text-gray-400 mb-10 text-lg">
            Присоединяйся к игрокам Центральной Азии и докажи свой скилл уже сегодня.
          </p>
          <Link
            href="/play"
            className="inline-flex items-center justify-center gap-2 px-10 py-5 bg-primary text-background-dark text-xl font-black uppercase tracking-wider rounded-lg shadow-neon hover:shadow-neon-hover transform hover:-translate-y-1 transition-all duration-300"
          >
            Начать играть
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#05081a] border-t border-white/5 py-12 text-sm">
        <div className="container mx-auto px-4 max-w-7xl">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-gray-600">
            <p>Faceit.TJ - Платформа матчмейкинга CS2</p>
            <p>Не аффилирован с Valve Corporation.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
