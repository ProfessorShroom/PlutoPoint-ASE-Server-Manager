FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# 1. Enable i386 architecture and multiverse repository first
RUN dpkg --add-architecture i386 && \
    apt-get update && \
    apt-get install -y software-properties-common && \
    add-apt-repository multiverse

# 2. Automatically accept Steam license agreement
RUN echo "steam steam/question select \"I AGREE\"" | debconf-set-selections && \
    echo "steam steam/license note ''" | debconf-set-selections

# 3. Install system prerequisites, gosu, and steamcmd safely in a separate layer
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    lib32gcc-s1 \
    p7zip-full \
    gosu \
    steamcmd \
    && rm -rf /var/lib/apt/lists/*

# 4. Install modern Node.js (v20 LTS)
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