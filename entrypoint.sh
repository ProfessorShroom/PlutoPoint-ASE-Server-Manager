#!/bin/bash
set -e

# Catch user and group IDs from environment variables (default to 1000 if blank)
USER_ID=${PUID:-1000}
GROUP_ID=${PGID:-1000}

echo "Starting container with UID: $USER_ID and GID: $GROUP_ID"

# Create a user/group dynamically if they don't already exist
if getent group "$GROUP_ID" > /dev/null 2>&1; then
    GROUP_NAME=$(getent group "$GROUP_ID" | cut -d: -f1)
else
    GROUP_NAME=appgroup
    groupadd -g "$GROUP_ID" "$GROUP_NAME"
fi

if getent passwd "$USER_ID" > /dev/null 2>&1; then
    USER_NAME=$(getent passwd "$USER_ID" | cut -d: -f1)
elif getent passwd appuser > /dev/null 2>&1; then
    USER_NAME=appuser
else
    USER_NAME=appuser
    useradd -l -u "$USER_ID" -g "$GROUP_NAME" -m -s /bin/bash "$USER_NAME"
fi

if ! id -u "$USER_NAME" > /dev/null 2>&1; then
    echo "Unable to resolve a valid user for UID $USER_ID" >&2
    exit 1
fi

# Fix Steam 64-bit SDK location for ARK
USER_HOME=$(getent passwd "$USER_NAME" | cut -d: -f6)
mkdir -p "$USER_HOME/.steam/sdk64"

if [ -f /opt/steamcmd/linux64/steamclient.so ]; then
    ln -sf /opt/steamcmd/linux64/steamclient.so "$USER_HOME/.steam/sdk64/steamclient.so"
fi

# Ensure permissions on home directory .steam path
chown -R "$USER_ID:$GROUP_ID" "$USER_HOME/.steam"

# Fix ownership of your app/data directories so the new user can read/write them
mkdir -p /data /backup /app
chown -R "$USER_ID:$GROUP_ID" /data /backup /app

# Ensure SteamCMD is writable and executable for the runtime user
if [ -d /opt/steamcmd ]; then
  chown -R "$USER_ID:$GROUP_ID" /opt/steamcmd
fi
if [ -f /opt/steamcmd/steamcmd.sh ]; then chmod +x /opt/steamcmd/steamcmd.sh; fi
if [ -f /opt/steamcmd/linux32/steamcmd ]; then chmod +x /opt/steamcmd/linux32/steamcmd; fi
if [ -f /opt/steamcmd/linux64/steamcmd ]; then chmod +x /opt/steamcmd/linux64/steamcmd; fi

# Drop root privileges and execute the main container command using gosu
exec gosu "$USER_NAME" "$@"