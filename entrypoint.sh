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

# Always ensure the Steam workshop content root exists on startup.
WORKSHOP_DIR="$USER_HOME/Steam/steamapps/workshop/content/346110"
echo "[entrypoint] workshop root: $WORKSHOP_DIR"
mkdir -p "$WORKSHOP_DIR"
chown -R "$USER_ID:$GROUP_ID" "$USER_HOME/Steam"

echo "[entrypoint] runtime user home: $USER_HOME"

# Reconcile workshop mods into each configured server's mods directory.
# If no servers exist yet, create the expected fallback folder so the path is ready.
mkdir -p /data
if [ -f /data/servers.json ]; then
    echo "[entrypoint] found servers.json"
    python3 - <<'PY' >/tmp/server_paths.txt
import json, os
p='/data/servers.json'
if os.path.exists(p):
    with open(p) as fh:
        data=json.load(fh)
    for server in data:
        path = server.get('path')
        if path:
            print(path)
PY

    while IFS= read -r SERVER_ROOT; do
        [ -n "$SERVER_ROOT" ] || continue
        echo "[entrypoint] processing server root: $SERVER_ROOT"
        SERVER_MODS_DIR="$SERVER_ROOT/ShooterGame/Content/Mods"
        mkdir -p "$SERVER_MODS_DIR"
        chown -R "$USER_ID:$GROUP_ID" "$SERVER_ROOT"
        echo "[entrypoint] mods dir: $SERVER_MODS_DIR"

        if [ -d "$WORKSHOP_DIR" ]; then
            echo "[entrypoint] workshop dir exists: $WORKSHOP_DIR"
            for mod_dir in "$WORKSHOP_DIR"/*; do
                [ -d "$mod_dir" ] || continue
                mod_name=$(basename "$mod_dir")
                target_path="$SERVER_MODS_DIR/$mod_name"
                echo "[entrypoint] copying mod dir $mod_name -> $target_path"
                rm -rf "$target_path"
                mkdir -p "$target_path"
                cp -a "$mod_dir/." "$target_path/"
            done

            for mod_file in "$WORKSHOP_DIR"/*.mod; do
                [ -f "$mod_file" ] || continue
                mod_file_name=$(basename "$mod_file")
                target_path="$SERVER_MODS_DIR/$mod_file_name"
                echo "[entrypoint] copying mod file $mod_file_name -> $target_path"
                rm -f "$target_path"
                cp -a "$mod_file" "$target_path"
            done

            for existing_entry in "$SERVER_MODS_DIR"/*; do
                [ -e "$existing_entry" ] || continue
                entry_name=$(basename "$existing_entry")
                if [[ "$entry_name" =~ ^[0-9]+(\.mod)?$ ]]; then
                    if [ ! -e "$WORKSHOP_DIR/$entry_name" ] && [ ! -e "$WORKSHOP_DIR/${entry_name%.mod}.mod" ]; then
                        echo "[entrypoint] removing stale mod entry $entry_name"
                        rm -rf "$existing_entry"
                    fi
                fi
            done
        fi
    done < /tmp/server_paths.txt
    rm -f /tmp/server_paths.txt
else
    mkdir -p /data/servers
    mkdir -p /data/servers/ShooterGame/Content/Mods
fi

# Drop root privileges and execute the main container command using gosu
exec gosu "$USER_NAME" "$@"