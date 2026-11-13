#!/bin/sh
# pi-session-setup — install the ~/bin/pi-session wrapper.
#
# The wrapper is SELF-LOCATING: SDK path and pi-etc checkout are derived
# at runtime (glob over ~/.pi/agent/git/*/, bun-global fallback, env
# override). Machine facts live in the local wrapper, never in docs.
# Re-run after clone/update if the wrapper is missing.
set -eu

for p in "$HOME/.bun/install/global/node_modules/@earendil-works/pi-coding-agent" \
         /usr/local/lib/node_modules/@earendil-works/pi-coding-agent \
         "$(npm root -g 2>/dev/null)/@earendil-works/pi-coding-agent"; do
  [ -d "$p" ] && sdk="$p" && break
done
[ -d "${sdk:-}" ] || sdk='${PI_SDK_PATH}'

mkdir -p "$HOME/bin"
cat > "$HOME/bin/pi-session" <<EOF
#!/bin/sh
# pi-session — structural session inspector (pi-etc tools/pi-session.ts).
# Semantic door = pi-recall; this is the structural/timeline door.
for p in "\$PI_SDK_PATH" "$sdk"; do
  [ -d "\$p" ] && export PI_SDK_PATH="\$p" && break
done
[ -d "\${PI_SDK_PATH:-}" ] || { echo "pi-session: pi SDK not found — set PI_SDK_PATH" >&2; exit 1; }
TOOL=\$(ls "\$HOME"/.pi/agent/git/*/pi-etc/tools/pi-session.ts 2>/dev/null | head -1)
[ -f "\$TOOL" ] || TOOL="\$HOME/projects/pi-etc/tools/pi-session.ts"
[ -f "\$TOOL" ] || { echo "pi-session: tool not found — run pi update --extensions or clone pi-etc" >&2; exit 1; }
exec bun "\$TOOL" "\$@"
EOF
chmod +x "$HOME/bin/pi-session"
echo "installed: $HOME/bin/pi-session"
