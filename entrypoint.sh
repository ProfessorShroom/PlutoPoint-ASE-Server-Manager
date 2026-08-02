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

# Fix ownership of your app/data directories so the new user can read/write them
# (Adjust /data and /backup to match your container's volume paths)
mkdir -p /data /backup /app
chown -R "$USER_ID:$GROUP_ID" /data /backup /app

# Ensure SteamCMD is writable and executable for the runtime user
if [ -d /opt/steamcmd ]; then
  chown -R "$USER_ID:$GROUP_ID" /opt/steamcmd
fi
if [ -f /opt/steamcmd/steamcmd.sh ]; then chmod +x /opt/steamcmd/steamcmd.sh; fi
if [ -f /opt/steamcmd/linux32/steamcmd ]; then chmod +x /opt/steamcmd/linux32/steamcmd; fi
if [ -f /opt/steamcmd/linux64/steamcmd ]; then chmod +x /opt/steamcmd/linux64/steamcmd; fi

# Fix ARK's SteamCMD dependency for automanagedmods
echo "Creating SteamCMD symlink for ARK automanagedmods..."

# Create the parent directory structure
mkdir -p /data/Engine/Binaries/ThirdParty/SteamCMD

# Erase the 'Linux' folder if ARK previously generated it
rm -rf /data/Engine/Binaries/ThirdParty/SteamCMD/Linux

# Create the symlink exactly where ARK expects it
ln -s /opt/steamcmd /data/Engine/Binaries/ThirdParty/SteamCMD/Linux

# Fix permissions for the newly created path
chown -R "$USER_ID:$GROUP_ID" /data/Engine/Binaries/ThirdParty/SteamCMD

# Drop root privileges and execute the main container command using gosu
exec gosu "$USER_NAME" "$@"