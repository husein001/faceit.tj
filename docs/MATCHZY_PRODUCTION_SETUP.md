# Установка MatchZy на существующие серверы (Production)

У вас уже работают серверы на портах 27015, 27016, 27017 с shared volume `cs2-shared`.
Эта инструкция поможет установить MatchZy БЕЗ переустановки серверов.

## Шаг 1: Остановить все серверы

```bash
# Остановить все CS2 контейнеры
docker stop cs2-faceit-27015 cs2-faceit-27016 cs2-faceit-27017

# Или остановить все сразу
docker ps --filter "name=cs2-faceit" -q | xargs docker stop
```

## Шаг 2: Установить плагины в shared volume

```bash
# Создать временный контейнер для установки плагинов
docker run -it --rm \
  -v cs2-shared:/cs2 \
  --name matchzy-installer \
  alpine sh
```

В контейнере выполнить:

```bash
# Установить необходимые пакеты
apk add wget unzip

# Перейти в директорию CS2
cd /cs2/game/csgo

# 1. Установить Metamod
mkdir -p addons/metamod
wget -q "https://mms.alliedmods.net/mmsdrop/2.0/mmsource-2.0.0-git1313-linux.tar.gz" -O /tmp/metamod.tar.gz
tar -xzf /tmp/metamod.tar.gz -C addons/metamod
rm /tmp/metamod.tar.gz

# 2. Установить CounterStrikeSharp
wget -q "https://github.com/roflmuffin/CounterStrikeSharp/releases/download/v287/counterstrikesharp-with-runtime-build-v287-linux.zip" -O /tmp/css.zip
unzip -o /tmp/css.zip -d .
rm /tmp/css.zip

# 3. Установить MatchZy
wget -q "https://github.com/shobhit-pathak/MatchZy/releases/download/0.8.6/MatchZy-0.8.6.zip" -O /tmp/matchzy.zip
unzip -o /tmp/matchzy.zip -d .
rm /tmp/matchzy.zip

# 4. Добавить Metamod в gameinfo.gi (ВАЖНО!)
# Проверить что строка уже не добавлена
grep -q "csgo/addons/metamod" gameinfo.gi || \
  sed -i 's/Game_LowViolence/Game\t\t\t\tcsgo\/addons\/metamod\n\t\t\t\tGame_LowViolence/g' gameinfo.gi

# 5. Проверить установку
ls -la addons/
ls -la addons/counterstrikesharp/plugins/

# Выйти из контейнера
exit
```

## Шаг 3: Создать конфиг MatchZy

```bash
# Создать директорию конфига
docker run --rm -v cs2-shared:/cs2 alpine mkdir -p /cs2/game/csgo/cfg/MatchZy

# Создать конфиг файл
docker run --rm -v cs2-shared:/cs2 alpine sh -c 'cat > /cs2/game/csgo/cfg/MatchZy/config.cfg << "EOF"
// MatchZy Configuration for FaceitTJ

// Webhook URL - ВАЖНО: укажите ваш API URL
matchzy_remote_log_url "https://api.faceit.tj/api/webhook/matchzy"
matchzy_remote_log_header_key "x-matchzy-key"
matchzy_remote_log_header_value "YOUR_MATCHZY_API_KEY"

// Match settings
matchzy_autostart_mode 1
matchzy_minimum_ready_required 2
matchzy_knife_enabled 1
matchzy_playout_enabled 0

// Ready system
matchzy_readyteam_mode 1
matchzy_ready_wait_time 300

// Pause settings
matchzy_max_pauses 2
matchzy_pause_duration 30

// Overtime
matchzy_ot_enabled 1
matchzy_ot_max_rounds 6

// Whitelist
matchzy_whitelist_enabled 1

// Chat
matchzy_chat_prefix "[FaceitTJ]"
matchzy_chat_messages_enabled 1
EOF'
```

## Шаг 4: Обновить .env на бэкенде

Добавьте в `/var/www/faceit.tj/.env`:

```env
# MatchZy Webhook
MATCHZY_WEBHOOK_URL=https://api.faceit.tj/api/webhook/matchzy
MATCHZY_API_KEY=your-secure-webhook-secret
```

**ВАЖНО:** `MATCHZY_API_KEY` должен совпадать с `matchzy_remote_log_header_value` в конфиге сервера!

## Шаг 5: Запустить серверы обратно

```bash
# Запустить все серверы
docker start cs2-faceit-27015 cs2-faceit-27016 cs2-faceit-27017

# Или запустить все сразу
docker ps -a --filter "name=cs2-faceit" -q | xargs docker start

# Проверить что запустились
docker ps --filter "name=cs2-faceit"
```

## Шаг 6: Проверить что MatchZy загрузился

```bash
# Посмотреть логи сервера
docker logs cs2-faceit-27015 2>&1 | grep -i "matchzy\|counterstrikesharp\|metamod"

# Должно быть что-то типа:
# [CounterStrikeSharp] Loading plugin 'MatchZy'
# [MatchZy] Plugin loaded successfully
```

## Шаг 7: Перезапустить бэкенд

```bash
cd /var/www/faceit.tj
pm2 restart faceit-backend
# или
docker-compose restart backend
```

## Шаг 8: Тест

1. Создайте лобби на сайте
2. Запустите матч
3. Проверьте логи бэкенда на получение webhook событий:
```bash
pm2 logs faceit-backend | grep -i matchzy
```

---

## Команды для диагностики

### Проверить установленные плагины:
```bash
docker run --rm -v cs2-shared:/cs2 alpine ls -la /cs2/game/csgo/addons/
docker run --rm -v cs2-shared:/cs2 alpine ls -la /cs2/game/csgo/addons/counterstrikesharp/plugins/
```

### Проверить gameinfo.gi:
```bash
docker run --rm -v cs2-shared:/cs2 alpine cat /cs2/game/csgo/gameinfo.gi | grep -A2 -B2 metamod
```

### Подключиться к RCON и проверить плагины:
```bash
# Через админку на сайте или напрямую:
# В консоли сервера выполнить:
# css_plugins list
# matchzy_status
```

### Логи конкретного сервера:
```bash
docker logs -f cs2-faceit-27015 2>&1 | grep -i "matchzy\|error\|warn"
```

---

## Откат (если что-то пошло не так)

Если MatchZy не работает, можно откатить:

```bash
# Остановить серверы
docker stop cs2-faceit-27015 cs2-faceit-27016 cs2-faceit-27017

# Удалить плагины
docker run --rm -v cs2-shared:/cs2 alpine sh -c "rm -rf /cs2/game/csgo/addons/counterstrikesharp /cs2/game/csgo/addons/metamod"

# Восстановить gameinfo.gi (если нужно)
docker run --rm -v cs2-shared:/cs2 alpine sh -c "sed -i '/csgo\/addons\/metamod/d' /cs2/game/csgo/gameinfo.gi"

# Запустить обратно
docker start cs2-faceit-27015 cs2-faceit-27016 cs2-faceit-27017
```

---

## Версии (на момент написания)

- Metamod: 2.0.0-git1313
- CounterStrikeSharp: v287
- MatchZy: 0.8.6

Проверяйте актуальные версии:
- https://www.sourcemm.net/downloads.php?branch=master
- https://github.com/roflmuffin/CounterStrikeSharp/releases
- https://github.com/shobhit-pathak/MatchZy/releases
