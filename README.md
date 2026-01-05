# Faceit.TJ - CS2 Matchmaking Platform

Платформа для матчмейкинга Counter-Strike 2 для игроков Таджикистана и Узбекистана.

## Функционал

- **Бесплатный Matchmaking 5v5** - автоматический поиск игры с балансировкой по MMR
- **Премиум кастомные лобби** - создание приватных лобби с выбором карты
- **Real-time обновления** - Socket.io для live статистики
- **Интеграция с CS2** - RCON управление серверами через Get5

## Технический стек

### Backend
- Node.js + Express + TypeScript
- PostgreSQL (база данных)
- Redis (очередь matchmaking)
- Socket.io (real-time)
- Passport Steam (аутентификация)

### Frontend
- Next.js 14 + TypeScript
- Tailwind CSS
- Zustand (state management)
- Socket.io Client

## Быстрый старт

### 1. Клонировать репозиторий

```bash
cd faceit.tj
```

### 2. Настроить переменные окружения

```bash
cp .env.example .env
```

Отредактируйте `.env` файл:
- `STEAM_API_KEY` - получите на https://steamcommunity.com/dev/apikey
- `JWT_SECRET` - сгенерируйте случайный ключ
- `GET5_API_KEY` - секретный ключ для Get5 webhook
- Добавьте ваши CS2 сервера (SERVER_1_*, SERVER_2_*, etc.)

### 3. Запустить через Docker Compose

```bash
docker-compose up -d
```

Это запустит:
- PostgreSQL на порту 5432
- Redis на порту 6379
- Backend на порту 3001
- Frontend на порту 3000

### 4. Открыть в браузере

- Frontend: http://localhost:3000
- Backend API: http://localhost:3001

## Разработка без Docker

### Backend

```bash
cd backend
npm install
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## API Endpoints

### Auth
- `GET /api/auth/steam` - Steam login redirect
- `GET /api/auth/steam/callback` - Steam callback
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user

### Matchmaking
- `POST /api/matchmaking/join` - Join queue
- `DELETE /api/matchmaking/leave` - Leave queue
- `GET /api/matchmaking/status` - Queue status

### Lobby (Premium)
- `POST /api/lobby/create` - Create lobby
- `GET /api/lobby/:code` - Get lobby info
- `POST /api/lobby/:code/join` - Join lobby
- `POST /api/lobby/:code/start` - Start match
- `DELETE /api/lobby/:code/cancel` - Cancel lobby

### Matches
- `GET /api/matches` - Active matches
- `GET /api/matches/:id` - Match details
- `GET /api/matches/:id/config` - Get5 config
- `GET /api/matches/history` - User history

### Webhook
- `POST /api/webhook/get5` - Get5 events

## Socket.io Events

### Client -> Server
- `join_queue` - Join matchmaking
- `leave_queue` - Leave matchmaking
- `join_lobby` - Join lobby room
- `leave_lobby` - Leave lobby room

### Server -> Client
- `queue_update` - Queue count update
- `match_found` - Match found
- `match_cancelled` - Match cancelled
- `lobby_player_joined` - Player joined lobby
- `lobby_player_left` - Player left lobby
- `lobby_started` - Lobby match started
- `lobby_cancelled` - Lobby cancelled
- `match_live_update` - Live score update

## Get5 Конфигурация

Настройте Get5 на ваших CS2 серверах для отправки событий:

```
get5_remote_log_url "http://your-api-url/api/webhook/get5"
get5_remote_log_header_key "X-Get5-Key"
get5_remote_log_header_value "your-get5-api-key"
```

## Структура проекта

```
faceit.tj/
├── backend/
│   ├── src/
│   │   ├── config/      # Database, Redis, Server configs
│   │   ├── routes/      # API routes
│   │   ├── services/    # Business logic
│   │   ├── models/      # Database models
│   │   ├── middleware/  # Auth, Premium middleware
│   │   ├── workers/     # Background workers
│   │   └── socket/      # Socket.io handlers
│   └── package.json
├── frontend/
│   ├── app/            # Next.js pages
│   ├── components/     # React components
│   ├── lib/            # API, Socket, Auth utilities
│   ├── hooks/          # Custom React hooks
│   └── package.json
├── docker-compose.yml
└── .env.example
```

## Лицензия

MIT
