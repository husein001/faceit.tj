# CS2 Server with MatchZy Plugin
# Based on cm2network/cs2 image

FROM cm2network/cs2:latest

# Install required packages
USER root
RUN apt-get update && apt-get install -y \
    wget \
    unzip \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /home/steam/cs2-dedicated

# Download and install Metamod
ARG METAMOD_VERSION=2.0.0-git1313
RUN mkdir -p game/csgo/addons/metamod && \
    wget -q "https://mms.alliedmods.net/mmsdrop/2.0/mmsource-${METAMOD_VERSION}-linux.tar.gz" -O /tmp/metamod.tar.gz && \
    tar -xzf /tmp/metamod.tar.gz -C game/csgo/addons/metamod && \
    rm /tmp/metamod.tar.gz

# Download and install CounterStrikeSharp
ARG CSS_VERSION=v287
RUN wget -q "https://github.com/roflmuffin/CounterStrikeSharp/releases/download/${CSS_VERSION}/counterstrikesharp-with-runtime-build-${CSS_VERSION}-linux.zip" -O /tmp/css.zip && \
    unzip -o /tmp/css.zip -d game/csgo/ && \
    rm /tmp/css.zip

# Download and install MatchZy
ARG MATCHZY_VERSION=0.8.6
RUN wget -q "https://github.com/shobhit-pathak/MatchZy/releases/download/${MATCHZY_VERSION}/MatchZy-${MATCHZY_VERSION}.zip" -O /tmp/matchzy.zip && \
    unzip -o /tmp/matchzy.zip -d game/csgo/ && \
    rm /tmp/matchzy.zip

# Create gameinfo.gi modification for Metamod loading
RUN echo '' >> game/csgo/gameinfo.gi.bak && \
    sed -i 's/Game_LowViolence/Game	csgo\/addons\/metamod\n\t\t\t\tGame_LowViolence/g' game/csgo/gameinfo.gi || true

# Copy custom configs
COPY configs/server.cfg game/csgo/cfg/server.cfg
COPY configs/matchzy_config.cfg game/csgo/cfg/MatchZy/config.cfg

# Set permissions
RUN chown -R steam:steam /home/steam/cs2-dedicated

# Switch back to steam user
USER steam

# Environment variables
ENV SRCDS_TOKEN=""
ENV CS2_RCONPW=""
ENV CS2_PW=""
ENV CS2_PORT=27015
ENV CS2_MAXPLAYERS=10
ENV CS2_GAMETYPE=0
ENV CS2_GAMEMODE=1
ENV CS2_STARTMAP=de_dust2
ENV CS2_TICKRATE=128

# Expose ports
EXPOSE 27015/tcp
EXPOSE 27015/udp
EXPOSE 27020/udp

# Start script
COPY --chown=steam:steam start.sh /home/steam/start.sh
RUN chmod +x /home/steam/start.sh

ENTRYPOINT ["/home/steam/start.sh"]
