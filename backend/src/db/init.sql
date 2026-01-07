-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    steam_id VARCHAR(20) UNIQUE NOT NULL,
    username VARCHAR(50) NOT NULL,
    avatar_url TEXT,
    mmr INTEGER DEFAULT 1000,
    is_premium BOOLEAN DEFAULT false,
    premium_until TIMESTAMP,
    active_lobby_id UUID,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Premium subscription requests (запросы на покупку премиума)
CREATE TABLE IF NOT EXISTS premium_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    phone_number VARCHAR(20) NOT NULL,
    amount DECIMAL(10,2) DEFAULT 10.00,
    status VARCHAR(20) DEFAULT 'pending',  -- pending, approved, rejected
    admin_note TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    processed_at TIMESTAMP,
    processed_by VARCHAR(50)
);

CREATE INDEX IF NOT EXISTS idx_premium_requests_status ON premium_requests(status);
CREATE INDEX IF NOT EXISTS idx_premium_requests_user ON premium_requests(user_id);

-- Servers table
CREATE TABLE IF NOT EXISTS servers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL,
    ip VARCHAR(45) NOT NULL,
    internal_ip VARCHAR(45),  -- Docker IP для RCON подключения
    port INTEGER NOT NULL,
    rcon_password VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT 'IDLE',
    current_match_id UUID,
    reserved_until TIMESTAMP,
    last_heartbeat TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Matches table
CREATE TABLE IF NOT EXISTS matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    server_id UUID REFERENCES servers(id),
    match_type VARCHAR(20) NOT NULL,
    status VARCHAR(20) DEFAULT 'waiting',
    map VARCHAR(50),
    team1_score INTEGER DEFAULT 0,
    team2_score INTEGER DEFAULT 0,
    created_by UUID REFERENCES users(id),
    lobby_code VARCHAR(10),
    lobby_expires_at TIMESTAMP,
    reserved_until TIMESTAMP,
    started_at TIMESTAMP,
    ended_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Match players table
CREATE TABLE IF NOT EXISTS match_players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    team INTEGER NOT NULL CHECK (team IN (1, 2)),
    kills INTEGER DEFAULT 0,
    deaths INTEGER DEFAULT 0,
    assists INTEGER DEFAULT 0,
    connected BOOLEAN DEFAULT false,
    connected_at TIMESTAMP
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_steam_id ON users(steam_id);
CREATE INDEX IF NOT EXISTS idx_servers_status ON servers(status);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_lobby_code ON matches(lobby_code);
CREATE INDEX IF NOT EXISTS idx_match_players_match_id ON match_players(match_id);
CREATE INDEX IF NOT EXISTS idx_match_players_user_id ON match_players(user_id);

-- Add foreign key constraint for active_lobby_id after matches table exists
ALTER TABLE users
DROP CONSTRAINT IF EXISTS fk_active_lobby;

ALTER TABLE users
ADD CONSTRAINT fk_active_lobby
FOREIGN KEY (active_lobby_id) REFERENCES matches(id) ON DELETE SET NULL;
