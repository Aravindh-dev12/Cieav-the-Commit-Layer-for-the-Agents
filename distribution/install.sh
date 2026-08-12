#!/bin/sh
set -eu

CHANNEL="${CIEAV_CHANNEL:-${LATCH_CHANNEL:-stable}}"
BASE_URL="${CIEAV_DOWNLOAD_BASE_URL:-${LATCH_DOWNLOAD_BASE_URL:-__CIEAV_DOWNLOAD_BASE_URL__}}"
NO_SERVICE="${CIEAV_NO_SERVICE:-${LATCH_NO_SERVICE:-0}}"

fail() { echo "CIEAV install failed: $*" >&2; exit 1; }
command -v curl >/dev/null 2>&1 || fail "curl is required"
command -v python3 >/dev/null 2>&1 || fail "python3 is required for manifest parsing during bootstrap"
command -v unzip >/dev/null 2>&1 || fail "unzip is required"

[ "$BASE_URL" != "__CIEAV_DOWNLOAD_BASE_URL__" ] || fail "installer was not rendered with an official download endpoint"
case "$BASE_URL" in https://*) ;; *) fail "download endpoint must use HTTPS" ;; esac
BASE_URL=${BASE_URL%/}

OS=$(uname -s)
case "$OS" in Darwin) OS_KEY=macos ;; Linux) OS_KEY=linux ;; *) fail "unsupported operating system: $OS" ;; esac
ARCH=$(uname -m)
case "$ARCH" in x86_64|amd64) ARCH_KEY=x64 ;; arm64|aarch64) ARCH_KEY=arm64 ;; *) fail "unsupported architecture: $ARCH" ;; esac
PLATFORM="$OS_KEY-$ARCH_KEY"

TMP=$(mktemp -d "${TMPDIR:-/tmp}/cieav-install.XXXXXX")
trap 'rm -rf "$TMP"' EXIT INT TERM
MANIFEST="$TMP/manifest.json"; ARCHIVE="$TMP/cieav-runtime.zip"; STAGE="$TMP/runtime"

printf '%s\n' "CIEAV · fetching release manifest"
curl -fL --proto '=https' --tlsv1.2 "$BASE_URL/$CHANNEL/manifest.json" -o "$MANIFEST"
META=$(python3 - "$MANIFEST" "$PLATFORM" <<'PY'
import json,sys
m=json.load(open(sys.argv[1],encoding='utf-8')); p=sys.argv[2]
if m.get('brand') not in (None,'CIEAV'): raise SystemExit('manifest brand mismatch')
if not m.get('version'): raise SystemExit('manifest missing version')
cloud=m.get('cloudUrl','')
if not cloud.startswith('https://'): raise SystemExit('manifest missing HTTPS cloudUrl')
a=m.get('artifacts',{}).get(p)
if not a or not a.get('url') or not a.get('sha256'): raise SystemExit(f'no valid artifact for {p}')
for x in (m['version'],cloud,a['url'],a['sha256']): print(x)
PY
) || fail "invalid release manifest"
VERSION=$(printf '%s\n' "$META"|sed -n '1p'); CLOUD_URL=$(printf '%s\n' "$META"|sed -n '2p'); ARTIFACT_PATH=$(printf '%s\n' "$META"|sed -n '3p'); EXPECTED=$(printf '%s\n' "$META"|sed -n '4p')
case "$ARTIFACT_PATH" in https://*) ARTIFACT_URL="$ARTIFACT_PATH" ;; *) ARTIFACT_URL="$BASE_URL/${ARTIFACT_PATH#/}" ;; esac
case "$ARTIFACT_URL" in https://*) ;; *) fail "artifact URL must use HTTPS" ;; esac

printf '%s\n' "CIEAV · downloading $VERSION for $PLATFORM"
curl -fL --proto '=https' --tlsv1.2 "$ARTIFACT_URL" -o "$ARCHIVE"
if command -v sha256sum >/dev/null 2>&1; then ACTUAL=$(sha256sum "$ARCHIVE"|awk '{print $1}'); elif command -v shasum >/dev/null 2>&1; then ACTUAL=$(shasum -a 256 "$ARCHIVE"|awk '{print $1}'); else fail "SHA-256 utility not found"; fi
[ "$ACTUAL" = "$EXPECTED" ] || fail "runtime checksum mismatch"
printf '%s\n' "CIEAV · checksum verified"

mkdir -p "$STAGE"; unzip -q "$ARCHIVE" -d "$STAGE"
PAYLOAD="$STAGE/cieav-runtime"
[ -d "$PAYLOAD" ] || { PAYLOAD="$STAGE/latch-runtime"; [ -d "$PAYLOAD" ] || fail "archive missing cieav-runtime/"; }
INSTALL_ROOT="$HOME/.local/share/cieav"; LEGACY_ROOT="$HOME/.local/share/latch"; BIN_ROOT="$HOME/.local/bin"
mkdir -p "$(dirname "$INSTALL_ROOT")" "$BIN_ROOT"
if [ -e "$INSTALL_ROOT" ]; then rm -rf "$INSTALL_ROOT.previous"; mv "$INSTALL_ROOT" "$INSTALL_ROOT.previous"; fi
mv "$PAYLOAD" "$INSTALL_ROOT"
RUNTIME_CIEAV="$INSTALL_ROOT/bin/cieav"
if [ ! -f "$RUNTIME_CIEAV" ] && [ -f "$INSTALL_ROOT/bin/latch" ]; then RUNTIME_CIEAV="$INSTALL_ROOT/bin/latch"; fi
RUNTIME_NODE="$INSTALL_ROOT/runtime/node"
[ -x "$RUNTIME_CIEAV" ] || chmod 0755 "$RUNTIME_CIEAV"; [ -x "$RUNTIME_NODE" ] || chmod 0755 "$RUNTIME_NODE"
cat > "$BIN_ROOT/cieav" <<EOF
#!/bin/sh
exec "$RUNTIME_CIEAV" "\$@"
EOF
chmod 0755 "$BIN_ROOT/cieav"
# Temporary command alias for users/scripts from before the rename.
cat > "$BIN_ROOT/latch" <<EOF
#!/bin/sh
exec "$RUNTIME_CIEAV" "\$@"
EOF
chmod 0755 "$BIN_ROOT/latch"

export PATH="$INSTALL_ROOT/runtime:$BIN_ROOT:$PATH"
export CIEAV_HOME="$INSTALL_ROOT"; export CIEAV_CLOUD_URL="$CLOUD_URL"; export CIEAV_VERSION="$VERSION"
export LATCH_HOME="$INSTALL_ROOT"; export LATCH_CLOUD_URL="$CLOUD_URL"; export LATCH_VERSION="$VERSION"

printf '%s\n' "CIEAV · running runtime self-check"; "$RUNTIME_CIEAV" doctor || fail "runtime self-check failed"
printf '%s\n' "CIEAV · enrolling with Cloud Intelligence"; "$RUNTIME_CIEAV" cloud enroll || fail "cloud enrollment failed"
printf '%s\n' "CIEAV · running cloud safety probe"; "$RUNTIME_CIEAV" cloud probe || fail "cloud safety probe failed"
if [ "$NO_SERVICE" != "1" ]; then printf '%s\n' "CIEAV · installing always-on Gateway"; "$RUNTIME_CIEAV" gateway install || fail "Gateway service installation failed"; fi

cat <<EOF

CIEAV installed successfully.
Version: $VERSION
Runtime: $INSTALL_ROOT
Privacy: durable user state remains local

Run: cieav gateway status
Run: cieav cloud status
Run: cieav test-lab
EOF
