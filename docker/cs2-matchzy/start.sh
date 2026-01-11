#!/bin/bash

# CS2 Server Start Script with MatchZy

cd /home/steam/cs2-dedicated

# Build command line arguments
ARGS="-dedicated"
ARGS="$ARGS -console"
ARGS="$ARGS -usercon"
ARGS="$ARGS -port ${CS2_PORT:-27015}"
ARGS="$ARGS -maxplayers ${CS2_MAXPLAYERS:-10}"
ARGS="$ARGS +game_type ${CS2_GAMETYPE:-0}"
ARGS="$ARGS +game_mode ${CS2_GAMEMODE:-1}"
ARGS="$ARGS +map ${CS2_STARTMAP:-de_dust2}"
ARGS="$ARGS -tickrate ${CS2_TICKRATE:-128}"
ARGS="$ARGS +sv_lan 0"

# Add GSLT token if provided
if [ -n "$SRCDS_TOKEN" ]; then
    ARGS="$ARGS +sv_setsteamaccount $SRCDS_TOKEN"
fi

# Add RCON password if provided
if [ -n "$CS2_RCONPW" ]; then
    ARGS="$ARGS +rcon_password $CS2_RCONPW"
fi

# Add server password if provided
if [ -n "$CS2_PW" ]; then
    ARGS="$ARGS +sv_password $CS2_PW"
fi

# Additional args
if [ -n "$CS2_ADDITIONAL_ARGS" ]; then
    ARGS="$ARGS $CS2_ADDITIONAL_ARGS"
fi

echo "Starting CS2 Server with MatchZy..."
echo "Arguments: $ARGS"

# Start the server
exec ./game/bin/linuxsteamrt64/cs2 $ARGS
