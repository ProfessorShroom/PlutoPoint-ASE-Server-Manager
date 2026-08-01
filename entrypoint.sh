#!/bin/bash
set -e

# 1. Catch user and group IDs from environment variables (default to 1000 if blank)
USER_ID=${PUID:-1000}
GROUP_ID=${PGID:-1000}

echo "Starting container with UID: $USER_ID and GID: $GROUP_ID"

# 2. Create a user/group dynamically if they don't already exist
if ! getent group appgroup > /dev/null 2>&1; then
    groupadd -g "$GROUP_ID" appgroup
fi

if ! getent passwd appuser > /dev/null 2>&1; then
    useradd -l -u "$USER_ID" -g appgroup -m -s /bin/bash appuser
fi

# 3. Fix ownership of your app/data directories so the new user can read/write them
# (Adjust /data and /backup to match your container's volume paths)
mkdir -p /data /backup /app
chown -R "$USER_ID:$GROUP_ID" /data /backup /app

# 4. Drop root privileges and execute the main container command using gosu
exec gosu appuser "$@"