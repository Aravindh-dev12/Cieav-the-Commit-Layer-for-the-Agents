#!/bin/sh
set -eu

CHANNEL="${CIEAV_CHANNEL:-${LATCH_CHANNEL:-stable}}"
BASE_URL="${CIEAV_DOWNLOAD_BASE_URL:-${LATCH_DOWNLOAD_BASE_URL:-__CIEAV_DOWNLOAD_BASE_URL__}}"
NO_SERVICE="${CIEAV_NO_SERVICE:-${LATCH_NO_SERVICE:-0}}"

fail() { echo "CIEAV install failed: $*" >&2; exit 1; }
command -v curl >/dev/null 2>&1 || fail "curl is required"
command -v unzip >/dev/null 2>&1 || fail "unzip is required"
command -v grep >/dev/null 2>&1 || fail "grep is required"
command -v sed >/dev/null 2>&1 || fail "sed is required"

[ "$BASE_URL" != "__CIEAV_DOWNLOAD_BASE_URL__" ] || fail "installer was not rendered with an official download endpoint"
BASE_URL=${BASE_URL%/}
case "$BASE_URL" in https://*/*) fail "download endpoint must be a clean HTTPS origin with no path" ;; https://*) ;; *) fail "download endpoint must use HTTPS" ;; esac
case "$BASE_URL" in *'?'*|*'#'*|*'@'*) fail "download endpoint must not contain credentials, query, or fragment" ;; esac
case "$CHANNEL" in *[!a-zA-Z0-9._-]*|'') fail "invalid release channel" ;; esac

fetch_https() {
  url=$1; out=$2
  # CIEAV bootstrap never follows redirects: all release files must be served
  # directly from the trusted CIEAV download origin the installer was rendered for.
  curl -fS --proto '=https' --proto-redir '=https' --max-redirs 0 --tlsv1.2 "$url" -o "$out"
}

OS=$(uname -s)
case "$OS" in Darwin) OS_KEY=macos ;; Linux) OS_KEY=linux ;; *) fail "unsupported operating system: $OS" ;; esac
ARCH=$(uname -m)
case "$ARCH" in x86_64|amd64) ARCH_KEY=x64 ;; arm64|aarch64) ARCH_KEY=arm64 ;; *) fail "unsupported architecture: $ARCH" ;; esac
PLATFORM="$OS_KEY-$ARCH_KEY"

TMP=$(mktemp -d "${TMPDIR:-/tmp}/cieav-install.XXXXXX")
INSTALL_ROOT="$HOME/.local/share/cieav"; BACKUP_ROOT="$INSTALL_ROOT.previous"; BIN_ROOT="$HOME/.local/bin"
SUCCESS=0; RUNTIME_REPLACED=0
cleanup() {
  rc=$?
  trap - EXIT HUP INT TERM
  if [ "$SUCCESS" -ne 1 ] && [ "$RUNTIME_REPLACED" -eq 1 ]; then
    echo "CIEAV · install failed; restoring previous runtime" >&2
    rm -rf "$INSTALL_ROOT"
    if [ -e "$BACKUP_ROOT" ]; then mv "$BACKUP_ROOT" "$INSTALL_ROOT"; fi
  fi
  rm -rf "$TMP"
  exit "$rc"
}
trap cleanup EXIT HUP INT TERM
BOOTSTRAP="$TMP/bootstrap.txt"; ARCHIVE="$TMP/cieav-runtime.zip"; STAGE="$TMP/runtime"

printf '%s\n' "CIEAV · fetching release metadata"
fetch_https "$BASE_URL/$CHANNEL/bootstrap-$PLATFORM.txt" "$BOOTSTRAP"

[ "$(grep -c '^BRAND=' "$BOOTSTRAP" || true)" -eq 1 ] || fail "invalid bootstrap brand field"
[ "$(grep -c '^VERSION=' "$BOOTSTRAP" || true)" -eq 1 ] || fail "invalid bootstrap version field"
[ "$(grep -c '^CLOUD_URL=' "$BOOTSTRAP" || true)" -eq 1 ] || fail "invalid bootstrap cloud field"
[ "$(grep -c '^ARTIFACT_PATH=' "$BOOTSTRAP" || true)" -eq 1 ] || fail "invalid bootstrap artifact field"
[ "$(grep -c '^SHA256=' "$BOOTSTRAP" || true)" -eq 1 ] || fail "invalid bootstrap checksum field"
BRAND=$(sed -n 's/^BRAND=//p' "$BOOTSTRAP" | tr -d '\r')
VERSION=$(sed -n 's/^VERSION=//p' "$BOOTSTRAP" | tr -d '\r')
CLOUD_URL=$(sed -n 's/^CLOUD_URL=//p' "$BOOTSTRAP" | tr -d '\r')
ARTIFACT_PATH=$(sed -n 's/^ARTIFACT_PATH=//p' "$BOOTSTRAP" | tr -d '\r')
EXPECTED=$(sed -n 's/^SHA256=//p' "$BOOTSTRAP" | tr -d '\r' | tr 'A-F' 'a-f')
[ "$BRAND" = "CIEAV" ] || fail "release metadata brand mismatch"
case "$VERSION" in *[!a-zA-Z0-9._-]*|'') fail "invalid release version" ;; esac
case "$CLOUD_URL" in https://*) ;; *) fail "Cloud Intelligence URL must use HTTPS" ;; esac
case "$ARTIFACT_PATH" in http://*|https://*|/*|*'..'*|*'?'*|*'#'*|*'\\'*|*[!a-zA-Z0-9._/-]*|'') fail "artifact path must be a safe relative path on the CIEAV download origin" ;; esac
case "$ARTIFACT_PATH" in "$CHANNEL"/*) ;; *) fail "artifact path must remain inside the selected release channel" ;; esac
ARTIFACT_URL="$BASE_URL/$ARTIFACT_PATH"
printf '%s' "$EXPECTED" | grep -Eq '^[0-9a-f]{64}$' || fail "invalid SHA-256 metadata"

printf '%s\n' "CIEAV · downloading $VERSION for $PLATFORM"
fetch_https "$ARTIFACT_URL" "$ARCHIVE"
if command -v sha256sum >/dev/null 2>&1; then ACTUAL=$(sha256sum "$ARCHIVE"|awk '{print $1}'); elif command -v shasum >/dev/null 2>&1; then ACTUAL=$(shasum -a 256 "$ARCHIVE"|awk '{print $1}'); else fail "SHA-256 utility not found"; fi
ACTUAL=$(printf '%s' "$ACTUAL" | tr 'A-F' 'a-f')
[ "$ACTUAL" = "$EXPECTED" ] || fail "runtime checksum mismatch"
printf '%s\n' "CIEAV · checksum verified"

mkdir -p "$STAGE"; unzip -q "$ARCHIVE" -d "$STAGE"
PAYLOAD="$STAGE/cieav-runtime"
[ -d "$PAYLOAD" ] || { PAYLOAD="$STAGE/latch-runtime"; [ -d "$PAYLOAD" ] || fail "archive missing cieav-runtime/"; }
mkdir -p "$(dirname "$INSTALL_ROOT")" "$BIN_ROOT"
rm -rf "$BACKUP_ROOT"
if [ -e "$INSTALL_ROOT" ]; then mv "$INSTALL_ROOT" "$BACKUP_ROOT"; fi
mv "$PAYLOAD" "$INSTALL_ROOT"; RUNTIME_REPLACED=1
RUNTIME_CIEAV="$INSTALL_ROOT/bin/cieav"
if [ ! -f "$RUNTIME_CIEAV" ] && [ -f "$INSTALL_ROOT/bin/latch" ]; then RUNTIME_CIEAV="$INSTALL_ROOT/bin/latch"; fi
RUNTIME_NODE="$INSTALL_ROOT/runtime/node"
[ -f "$RUNTIME_CIEAV" ] || fail "installed runtime does not contain the CIEAV executable"
[ -f "$RUNTIME_NODE" ] || fail "installed runtime does not contain the bundled Node runtime"
chmod 0755 "$RUNTIME_CIEAV" "$RUNTIME_NODE"
cat > "$BIN_ROOT/cieav" <<EOF
#!/bin/sh
exec "$RUNTIME_CIEAV" "\$@"
EOF
chmod 0755 "$BIN_ROOT/cieav"
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
SUCCESS=1

cat <<EOF

CIEAV installed successfully.
Version: $VERSION
Runtime: $INSTALL_ROOT
Privacy: durable user state remains local

Run: cieav gateway status
Run: cieav cloud status
Run: cieav test-lab
EOF
