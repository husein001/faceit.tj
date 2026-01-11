#!/bin/bash
# =====================================================
# MatchZy Installation Script for FaceitTJ
# Run this on the production server
# =====================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
VOLUME_NAME="cs2-shared"
METAMOD_VERSION="2.0.0-git1313"
CSS_VERSION="v287"
MATCHZY_VERSION="0.8.6"

# Webhook config - CHANGE THESE!
WEBHOOK_URL="${MATCHZY_WEBHOOK_URL:-https://api.faceit.tj/api/webhook/matchzy}"
API_KEY="${MATCHZY_API_KEY:-your-secure-webhook-secret}"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}MatchZy Installation Script${NC}"
echo -e "${GREEN}========================================${NC}"

# Check if running as root or with docker permissions
if ! docker ps > /dev/null 2>&1; then
    echo -e "${RED}Error: Cannot connect to Docker. Run with sudo or add user to docker group.${NC}"
    exit 1
fi

# Step 1: Stop servers
echo -e "\n${YELLOW}Step 1: Stopping CS2 servers...${NC}"
CONTAINERS=$(docker ps --filter "name=cs2-faceit" -q)
if [ -n "$CONTAINERS" ]; then
    docker stop $CONTAINERS
    echo -e "${GREEN}Servers stopped${NC}"
else
    echo -e "${YELLOW}No running CS2 servers found${NC}"
fi

# Step 2: Install plugins
echo -e "\n${YELLOW}Step 2: Installing MatchZy plugins...${NC}"

docker run --rm -v ${VOLUME_NAME}:/cs2 alpine sh -c "
set -e
apk add --no-cache wget unzip > /dev/null

cd /cs2/game/csgo

echo 'Installing Metamod ${METAMOD_VERSION}...'
mkdir -p addons/metamod
wget -q 'https://mms.alliedmods.net/mmsdrop/2.0/mmsource-${METAMOD_VERSION}-linux.tar.gz' -O /tmp/metamod.tar.gz
tar -xzf /tmp/metamod.tar.gz -C addons/metamod
rm /tmp/metamod.tar.gz

echo 'Installing CounterStrikeSharp ${CSS_VERSION}...'
wget -q 'https://github.com/roflmuffin/CounterStrikeSharp/releases/download/${CSS_VERSION}/counterstrikesharp-with-runtime-build-${CSS_VERSION}-linux.zip' -O /tmp/css.zip
unzip -o /tmp/css.zip -d . > /dev/null
rm /tmp/css.zip

echo 'Installing MatchZy ${MATCHZY_VERSION}...'
wget -q 'https://github.com/shobhit-pathak/MatchZy/releases/download/${MATCHZY_VERSION}/MatchZy-${MATCHZY_VERSION}.zip' -O /tmp/matchzy.zip
unzip -o /tmp/matchzy.zip -d . > /dev/null
rm /tmp/matchzy.zip

echo 'Updating gameinfo.gi...'
if ! grep -q 'csgo/addons/metamod' gameinfo.gi; then
    sed -i 's/Game_LowViolence/Game\t\t\t\tcsgo\/addons\/metamod\n\t\t\t\tGame_LowViolence/g' gameinfo.gi
    echo 'gameinfo.gi updated'
else
    echo 'gameinfo.gi already configured'
fi

echo 'Creating MatchZy config...'
mkdir -p cfg/MatchZy
cat > cfg/MatchZy/config.cfg << EOFCFG
// MatchZy Configuration for FaceitTJ
matchzy_remote_log_url \"${WEBHOOK_URL}\"
matchzy_remote_log_header_key \"x-matchzy-key\"
matchzy_remote_log_header_value \"${API_KEY}\"

matchzy_autostart_mode 1
matchzy_minimum_ready_required 2
matchzy_knife_enabled 1
matchzy_playout_enabled 0
matchzy_readyteam_mode 1
matchzy_ready_wait_time 300
matchzy_max_pauses 2
matchzy_pause_duration 30
matchzy_ot_enabled 1
matchzy_ot_max_rounds 6
matchzy_whitelist_enabled 1
matchzy_chat_prefix \"[FaceitTJ]\"
matchzy_chat_messages_enabled 1
EOFCFG

echo 'Plugins installed successfully!'
"

echo -e "${GREEN}Plugins installed${NC}"

# Step 3: Verify installation
echo -e "\n${YELLOW}Step 3: Verifying installation...${NC}"
docker run --rm -v ${VOLUME_NAME}:/cs2 alpine sh -c "
echo 'Checking Metamod...'
ls /cs2/game/csgo/addons/metamod/ | head -3

echo 'Checking CounterStrikeSharp...'
ls /cs2/game/csgo/addons/counterstrikesharp/plugins/ | head -3

echo 'Checking MatchZy...'
ls /cs2/game/csgo/addons/counterstrikesharp/plugins/MatchZy/ | head -3

echo 'Checking gameinfo.gi...'
grep -c 'csgo/addons/metamod' /cs2/game/csgo/gameinfo.gi && echo 'Metamod entry found in gameinfo.gi'
"

# Step 4: Start servers
echo -e "\n${YELLOW}Step 4: Starting CS2 servers...${NC}"
STOPPED_CONTAINERS=$(docker ps -a --filter "name=cs2-faceit" --filter "status=exited" -q)
if [ -n "$STOPPED_CONTAINERS" ]; then
    docker start $STOPPED_CONTAINERS
    echo -e "${GREEN}Servers started${NC}"
else
    echo -e "${YELLOW}No stopped CS2 servers to start${NC}"
fi

# Step 5: Show status
echo -e "\n${YELLOW}Step 5: Server status...${NC}"
docker ps --filter "name=cs2-faceit" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}Installation complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "\n${YELLOW}Next steps:${NC}"
echo -e "1. Update backend .env with:"
echo -e "   MATCHZY_WEBHOOK_URL=${WEBHOOK_URL}"
echo -e "   MATCHZY_API_KEY=${API_KEY}"
echo -e ""
echo -e "2. Restart backend:"
echo -e "   pm2 restart faceit-backend"
echo -e ""
echo -e "3. Check server logs:"
echo -e "   docker logs cs2-faceit-27015 2>&1 | grep -i matchzy"
echo -e ""
echo -e "4. Test by creating a lobby on the website"
