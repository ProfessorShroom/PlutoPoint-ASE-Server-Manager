#!/bin/bash
set -e

# 1. Catch user and group IDs from environment variables (default to 1000 if blank)
USER_ID=${PUID:-1000}
GROUP_ID=${PGID:-1000}

echo "Starting container with UID: $USER_ID and GID: $GROUP_ID"

# 2. Create a user/group dynamically if they don't already exist
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

# 3. Fix ownership of your app/data directories so the new user can read/write them
# (Adjust /data and /backup to match your container's volume paths)
mkdir -p /data /backup /app
chown -R "$USER_ID:$GROUP_ID" /data /backup /app

# 4. Drop root privileges and execute the main container command using gosu
exec gosu "$USER_NAME" "$@"