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

# Ensure permissions on home directory .steam path
chown -R "$USER_ID:$GROUP_ID" "$USER_HOME/.steam"

# Ensure Steam workshop content is owned/readable by the runtime user
if [ -d "$USER_HOME/Steam" ]; then
    chown -R "$USER_ID:$GROUP_ID" "$USER_HOME/Steam"
fi

# Link workshop mods into any configured server locations if the workshop content exists.
# This handles fresh installs where the server directories may not exist yet.
WORKSHOP_DIR="$USER_HOME/Steam/steamapps/workshop/content/346110"

if [ -d "$WORKSHOP_DIR" ]; then
    if [ -f /data/servers.json ]; then
        python3 - <<'PY' >/tmp/servers_paths.txt
import json, os
p='/data/servers.json'
if os.path.exists(p):
    with open(p) as fh:
        data=json.load(fh)
    for s in data:
        if s.get('path'):
            print(s['path'])
PY
        while IFS= read -r SERVER_ROOT; do
            [ -n "$SERVER_ROOT" ] || continue
            SERVER_MODS_DIR="$SERVER_ROOT/ShooterGame/Content/Mods"
            mkdir -p "$SERVER_MODS_DIR"
            chown -R "$USER_ID:$GROUP_ID" "$SERVER_ROOT"
            for mod_dir in "$WORKSHOP_DIR"/*; do
                [ -d "$mod_dir" ] || continue
                mod_name=$(basename "$mod_dir")
                target_path="$SERVER_MODS_DIR/$mod_name"
                if [ -e "$target_path" ] || [ -L "$target_path" ]; then
                    rm -rf "$target_path"
                fi
                ln -s "$mod_dir" "$target_path"
            done
            for mod_file in "$WORKSHOP_DIR"/*.mod; do
                [ -f "$mod_file" ] || continue
                mod_file_name=$(basename "$mod_file")
                target_path="$SERVER_MODS_DIR/$mod_file_name"
                if [ -e "$target_path" ] || [ -L "$target_path" ]; then
                    rm -f "$target_path"
                fi
                ln -s "$mod_file" "$target_path"
            done
        done < /tmp/servers_paths.txt
        rm -f /tmp/servers_paths.txt
    fi
fi

# Drop root privileges and execute the main container command using gosu
exec gosu "$USER_NAME" "$@"