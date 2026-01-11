# CS2 Server with MatchZy for FaceitTJ

Docker setup for CS2 game servers with MatchZy plugin for competitive match management.

## Requirements

- Docker & Docker Compose
- Steam Game Server Login Token (GSLT)
- At least 4GB RAM per server

## Quick Start

1. Create a `.env` file:
```bash
cp .env.example .env
```

2. Edit `.env` with your values:
```env
GSLT_TOKEN=your_gslt_token_here
GSLT_TOKEN_2=your_second_gslt_token
RCON_PASSWORD=your_secure_rcon_password
```

3. Create the network (if not exists):
```bash
docker network create faceit_network
```

4. Build and start:
```bash
docker-compose up -d --build
```

## Getting GSLT Token

1. Go to https://steamcommunity.com/dev/managegameservers
2. Create a new token for App ID 730 (CS2)
3. You need one token per server

## Configuration

### MatchZy Config
Edit `configs/matchzy_config.cfg` for plugin settings.

Key settings:
- `matchzy_remote_log_url` - Webhook URL for match events
- `matchzy_knife_enabled` - Enable knife round for side selection
- `matchzy_minimum_ready_required` - Players needed to start

### Server Config
Edit `configs/server.cfg` for general server settings.

## Webhook Events

MatchZy sends these events to your webhook:
- `match_start` / `series_start` - Match begins
- `round_start` / `round_end` - Round lifecycle
- `player_connect` / `player_disconnect` - Player events
- `player_death` - Kill events (for kill feed)
- `match_end` / `series_end` - Match completion
- `knife_start` / `knife_won` - Knife round events

## Commands

### Start servers
```bash
docker-compose up -d
```

### Stop servers
```bash
docker-compose down
```

### View logs
```bash
docker-compose logs -f cs2-server-1
```

### Rebuild with latest MatchZy
```bash
docker-compose build --no-cache
docker-compose up -d
```

### Connect to server console
```bash
docker exec -it cs2-faceit-27015 tmux attach
```

## Adding More Servers

Copy the service block in `docker-compose.yml` and update:
- Service name (cs2-server-3, etc.)
- Container name
- Port mappings (27017, 27117, etc.)
- GSLT token environment variable

## Troubleshooting

### Server not starting
Check logs: `docker-compose logs cs2-server-1`

### MatchZy not loading
Verify Metamod is installed: Check for `addons/metamod` in game directory

### Webhook not receiving events
1. Verify `matchzy_remote_log_url` is set correctly in match config
2. Check server can reach your API (network issues)
3. Check API logs for incoming requests

## Ports

| Port | Protocol | Purpose |
|------|----------|---------|
| 27015 | TCP/UDP | Game server |
| 27020 | UDP | GOTV (Source TV) |

## Resources

- [MatchZy Documentation](https://shobhit-pathak.github.io/MatchZy/)
- [CounterStrikeSharp](https://github.com/roflmuffin/CounterStrikeSharp)
- [Metamod:Source](https://www.sourcemm.net/)
