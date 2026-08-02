# Use Ubuntu 24.04 base
FROM ubuntu:24.04

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Enable i386 architecture and add multiverse (some 32-bit libs may come from multiverse)
RUN dpkg --add-architecture i386 \
 && apt-get update \
 && apt-get install -y --no-install-recommends software-properties-common \
 && add-apt-repository -y multiverse \
 && rm -rf /var/lib/apt/lists/*

# Install runtime deps (32-bit libs included) and utilities
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    libc6:i386 \
    lib32gcc-s1 \
    libstdc++6:i386 \
    zlib1g:i386 \
    p7zip-full \
    gosu \
 && rm -rf /var/lib/apt/lists/*

# Install SteamCMD via apt using the Ubuntu multiverse repository and i386 support.
# Pre-accept the Steam License Agreement so the non-interactive install does not fail.
RUN echo steam steam/question select "I AGREE" | debconf-set-selections \
 && echo steam steam/license note '' | debconf-set-selections \
 && apt-get update \
 && apt-get install -y --no-install-recommends steamcmd \
 && rm -rf /var/lib/apt/lists/* \
 && ln -sf /usr/games/steamcmd /usr/local/bin/steamcmd \
 && chmod +x /usr/games/steamcmd \
 && /usr/games/steamcmd +quit

# Install Node.js (v20 LTS) and keep image small
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
 && apt-get update \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

# Application setup
WORKDIR /app

COPY . .

RUN npm install --production

# Entrypoint script (kept from your repository)
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 3000 7777/udp 27015/udp
VOLUME [ "/data" ]

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["npm", "start"]