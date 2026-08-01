FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# Automatically accept Steam license agreement to prevent prompts from failing the build
RUN echo "steam steam/question select \"I AGREE\"" | debconf-set-selections && \
    echo "steam steam/license note ''" | debconf-set-selections

# Install prerequisites, gosu, enable i386 architecture for SteamCMD, and install packages
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    software-properties-common \
    lib32gcc-s1 \
    p7zip-full \
    gosu \
    && dpkg --add-architecture i386 \
    && add-apt-repository multiverse \
    && apt-get update && apt-get install -y \
    steamcmd \
    && rm -rf /var/lib/apt/lists/*

# Install modern Node.js (v20 LTS)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package.json
COPY server.js server.js
COPY public/ public/

RUN npm install

# Copy and setup the entrypoint script
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 3000 7777/udp 27015/udp

VOLUME [ "/data" ]

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["npm", "start"]