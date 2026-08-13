#!/bin/sh
set -eu

CHANNEL="${CIEAV_CHANNEL:-${LATCH_CHANNEL:-stable}}"
BASE_URL="${CIEAV_DOWNLOAD_BASE_URL:-${LATCH_DOWNLOAD_BASE_URL:-__CIEAV_DOWNLOAD_BASE_URL__}}"
NO_SERVICE="${CIEAV_NO_SERVICE:-${LATCH_NO_SERVICE:-0}}"
PINNED_CLOUD_URL="__CIEAV_CLOUD_URL__"
PINNED_RELEASE_VERSION="__CIEAV_RELEASE_VERSION__"
PINNED_WINDOWS_SIGNER="__CIEAV_WINDOWS_SIGNER_THUMBPRINT__"
PINNED_MACOS_SIGNER="__CIEAV_MACOS_SIGNING_IDENTITY__"
PINNED_RELEASE_KEY_ID="__CIEAV_RELEASE_KEY_ID__"
PINNED_RELEASE_RSA_MODULUS_B64="__CIEAV_RELEASE_RSA_MODULUS_B64__"
PINNED_RELEASE_RSA_EXPONENT_B64="__CIEAV_RELEASE_RSA_EXPONENT_B64__"
PINNED_RELEASE_PUBLIC_KEY_PEM_B64="__CIEAV_RELEASE_PUBLIC_KEY_PEM_B64__"

fail() { echo "CIEAV install failed: $*" >&2; exit 1; }
for cmd in curl unzip grep sed openssl; do command -v "$cmd" >/dev/null 2>&1 || fail "$cmd is required"; done

[ "$BASE_URL" != "__CIEAV_DOWNLOAD_BASE_URL__" ] || fail "installer was not rendered with an official download endpoint"
[ "$PINNED_CLOUD_URL" != "__CIEAV_CLOUD_URL__" ] || fail "installer has no pinned Cloud endpoint"
[ "$PINNED_RELEASE_VERSION" != "__CIEAV_RELEASE_VERSION__" ] || fail "installer has no pinned release version"
[ "$PINNED_RELEASE_KEY_ID" != "__CIEAV_RELEASE_KEY_ID__" ] || fail "installer has no pinned release verification key"
[ "$PINNED_RELEASE_PUBLIC_KEY_PEM_B64" != "__CIEAV_RELEASE_PUBLIC_KEY_PEM_B64__" ] || fail "installer has no pinned release public key"
[ "$PINNED_RELEASE_RSA_MODULUS_B64" != "__CIEAV_RELEASE_RSA_MODULUS_B64__" ] || fail "installer has no pinned RSA modulus"
[ "$PINNED_RELEASE_RSA_EXPONENT_B64" != "__CIEAV_RELEASE_RSA_EXPONENT_B64__" ] || fail "installer has no pinned RSA exponent"
BASE_URL=${BASE_URL%/}; PINNED_CLOUD_URL=${PINNED_CLOUD_URL%/}
case "$BASE_URL" in https://*/*) fail "download endpoint must be a clean HTTPS origin with no path" ;; https://*) ;; *) fail "download endpoint must use HTTPS" ;; esac
case "$BASE_URL" in *'?'*|*'#'*|*'@'*) fail "download endpoint must not contain credentials, query, or fragment" ;; esac
case "$PINNED_CLOUD_URL" in https://*/*) fail "pinned Cloud endpoint must be a clean HTTPS origin with no path" ;; https://*) ;; *) fail "pinned Cloud endpoint must use HTTPS" ;; esac
case "$PINNED_CLOUD_URL" in *'?'*|*'#'*|*'@'*) fail "pinned Cloud endpoint must not contain credentials, query, or fragment" ;; esac
case "$PINNED_RELEASE_VERSION" in *[!a-zA-Z0-9._-]*|'') fail "invalid pinned release version" ;; esac
printf '%s' "$PINNED_RELEASE_KEY_ID" | grep -Eq '^[0-9a-f]{64}$' || fail "invalid pinned release verification key ID"
case "$CHANNEL" in *[!a-zA-Z0-9._-]*|'') fail "invalid release channel" ;; esac

fetch_https() { url=$1; out=$2; curl -fS --proto '=https' --proto-redir '=https' --max-redirs 0 --tlsv1.2 "$url" -o "$out"; }
sha256_file() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1"|awk '{print $1}'; elif command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1"|awk '{print $1}'; else openssl dgst -sha256 "$1"|awk '{print $NF}'; fi; }
json_string_field() { field=$1; file=$2; [ "$(grep -c "^[[:space:]]*\"$field\"[[:space:]]*:" "$file" || true)" -eq 1 ] || fail "invalid signed-envelope field: $field"; sed -n "s/^[[:space:]]*\"$field\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\"[,]*[[:space:]]*$/\1/p" "$file"; }
json_number_field() { field=$1; file=$2; [ "$(grep -c "^[[:space:]]*\"$field\"[[:space:]]*:" "$file" || true)" -eq 1 ] || fail "invalid signed-envelope field: $field"; sed -n "s/^[[:space:]]*\"$field\"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\)[,]*[[:space:]]*$/\1/p" "$file"; }

OS=$(uname -s); case "$OS" in Darwin) OS_KEY=macos ;; Linux) OS_KEY=linux ;; *) fail "unsupported operating system: $OS" ;; esac
ARCH=$(uname -m); case "$ARCH" in x86_64|amd64) ARCH_KEY=x64 ;; arm64|aarch64) ARCH_KEY=arm64 ;; *) fail "unsupported architecture: $ARCH" ;; esac
PLATFORM="$OS_KEY-$ARCH_KEY"

TMP=$(mktemp -d "${TMPDIR:-/tmp}/cieav-install.XXXXXX")
INSTALL_ROOT="$HOME/.local/share/cieav"; BACKUP_ROOT="$INSTALL_ROOT.previous"; BIN_ROOT="$HOME/.local/bin"
SUCCESS=0; RUNTIME_REPLACED=0
cleanup() { rc=$?; trap - EXIT HUP INT TERM; if [ "$SUCCESS" -ne 1 ] && [ "$RUNTIME_REPLACED" -eq 1 ]; then echo "CIEAV · install failed; restoring previous runtime" >&2; rm -rf "$INSTALL_ROOT"; if [ -e "$BACKUP_ROOT" ]; then mv "$BACKUP_ROOT" "$INSTALL_ROOT"; fi; fi; rm -rf "$TMP"; exit "$rc"; }
trap cleanup EXIT HUP INT TERM
BOOTSTRAP="$TMP/bootstrap.txt"; SIGNATURE_ENV="$TMP/bootstrap.sig.json"; SIGNATURE_BIN="$TMP/bootstrap.sig"; RELEASE_PUBLIC_KEY="$TMP/release-public-key.pem"; ARCHIVE="$TMP/cieav-runtime.zip"; STAGE="$TMP/runtime"

printf '%s\n' "CIEAV · fetching signed release metadata"
fetch_https "$BASE_URL/$CHANNEL/bootstrap-$PLATFORM.txt" "$BOOTSTRAP"
fetch_https "$BASE_URL/$CHANNEL/signatures/bootstrap-$PLATFORM.txt.sig.json" "$SIGNATURE_ENV"
SIG_SCHEMA=$(json_number_field schemaVersion "$SIGNATURE_ENV"); SIG_PRODUCT=$(json_string_field product "$SIGNATURE_ENV"); SIG_ALGORITHM=$(json_string_field algorithm "$SIGNATURE_ENV"); SIG_KEY_ID=$(json_string_field keyId "$SIGNATURE_ENV"); SIG_FILE=$(json_string_field file "$SIGNATURE_ENV"); SIG_SHA=$(json_string_field sha256 "$SIGNATURE_ENV"); SIG_B64=$(json_string_field signature "$SIGNATURE_ENV")
[ "$SIG_SCHEMA" = "2" ] || fail "release metadata signature schema mismatch"; [ "$SIG_PRODUCT" = "CIEAV" ] || fail "release metadata signature product mismatch"; [ "$SIG_ALGORITHM" = "RSA-SHA256" ] || fail "release metadata signature algorithm mismatch"; [ "$SIG_KEY_ID" = "$PINNED_RELEASE_KEY_ID" ] || fail "release metadata signature key does not match the pinned trust root"; [ "$SIG_FILE" = "bootstrap-$PLATFORM.txt" ] || fail "release metadata signature file binding mismatch"
ACTUAL_BOOTSTRAP_SHA=$(sha256_file "$BOOTSTRAP" | tr 'A-F' 'a-f'); [ "$ACTUAL_BOOTSTRAP_SHA" = "$SIG_SHA" ] || fail "release metadata digest does not match its signed envelope"
printf '%s' "$PINNED_RELEASE_PUBLIC_KEY_PEM_B64" | openssl base64 -d -A -out "$RELEASE_PUBLIC_KEY" 2>/dev/null || fail "pinned release public key is invalid"
printf '%s' "$SIG_B64" | openssl base64 -d -A -out "$SIGNATURE_BIN" 2>/dev/null || fail "release metadata signature encoding is invalid"
openssl pkey -pubin -in "$RELEASE_PUBLIC_KEY" -pubcheck -noout >/dev/null 2>&1 || fail "pinned release public key failed validation"
openssl dgst -sha256 -verify "$RELEASE_PUBLIC_KEY" -signature "$SIGNATURE_BIN" "$BOOTSTRAP" >/dev/null 2>&1 || fail "release metadata RSA signature verification failed"
printf '%s\n' "CIEAV · release metadata signature verified"

[ "$(grep -c '^BRAND=' "$BOOTSTRAP" || true)" -eq 1 ] || fail "invalid bootstrap brand field"
[ "$(grep -c '^VERSION=' "$BOOTSTRAP" || true)" -eq 1 ] || fail "invalid bootstrap version field"
[ "$(grep -c '^CLOUD_URL=' "$BOOTSTRAP" || true)" -eq 1 ] || fail "invalid bootstrap cloud field"
[ "$(grep -c '^ARTIFACT_PATH=' "$BOOTSTRAP" || true)" -eq 1 ] || fail "invalid bootstrap artifact field"
[ "$(grep -c '^SHA256=' "$BOOTSTRAP" || true)" -eq 1 ] || fail "invalid bootstrap checksum field"
BRAND=$(sed -n 's/^BRAND=//p' "$BOOTSTRAP" | tr -d '\r'); VERSION=$(sed -n 's/^VERSION=//p' "$BOOTSTRAP" | tr -d '\r'); CLOUD_URL=$(sed -n 's/^CLOUD_URL=//p' "$BOOTSTRAP" | tr -d '\r'); CLOUD_URL=${CLOUD_URL%/}; ARTIFACT_PATH=$(sed -n 's/^ARTIFACT_PATH=//p' "$BOOTSTRAP" | tr -d '\r'); EXPECTED=$(sed -n 's/^SHA256=//p' "$BOOTSTRAP" | tr -d '\r' | tr 'A-F' 'a-f')
[ "$BRAND" = "CIEAV" ] || fail "release metadata brand mismatch"; case "$VERSION" in *[!a-zA-Z0-9._-]*|'') fail "invalid release version" ;; esac; [ "$VERSION" = "$PINNED_RELEASE_VERSION" ] || fail "release metadata version does not match the installer-pinned release"
case "$CLOUD_URL" in https://*/*) fail "Cloud Intelligence URL must be a clean HTTPS origin with no path" ;; https://*) ;; *) fail "Cloud Intelligence URL must use HTTPS" ;; esac; case "$CLOUD_URL" in *'?'*|*'#'*|*'@'*) fail "Cloud Intelligence URL must not contain credentials, query, or fragment" ;; esac; [ "$CLOUD_URL" = "$PINNED_CLOUD_URL" ] || fail "release metadata Cloud endpoint does not match the installer-pinned endpoint"
case "$ARTIFACT_PATH" in http://*|https://*|/*|*'..'*|*'?'*|*'#'*|*'\\'*|*[!a-zA-Z0-9._/-]*|'') fail "artifact path must be a safe relative path on the CIEAV download origin" ;; esac; case "$ARTIFACT_PATH" in "$CHANNEL"/*) ;; *) fail "artifact path must remain inside the selected release channel" ;; esac
ARTIFACT_URL="$BASE_URL/$ARTIFACT_PATH"; printf '%s' "$EXPECTED" | grep -Eq '^[0-9a-f]{64}$' || fail "invalid SHA-256 metadata"

printf '%s\n' "CIEAV · downloading $VERSION for $PLATFORM"; fetch_https "$ARTIFACT_URL" "$ARCHIVE"; ACTUAL=$(sha256_file "$ARCHIVE" | tr 'A-F' 'a-f'); [ "$ACTUAL" = "$EXPECTED" ] || fail "runtime checksum mismatch"; printf '%s\n' "CIEAV · checksum verified"
mkdir -p "$STAGE"; unzip -q "$ARCHIVE" -d "$STAGE"; PAYLOAD="$STAGE/cieav-runtime"; [ -d "$PAYLOAD" ] || { PAYLOAD="$STAGE/latch-runtime"; [ -d "$PAYLOAD" ] || fail "archive missing cieav-runtime/"; }
RUNTIME_STAGED="$PAYLOAD/bin/cieav"; [ -f "$RUNTIME_STAGED" ] || { RUNTIME_STAGED="$PAYLOAD/bin/latch"; [ -f "$RUNTIME_STAGED" ] || fail "archive missing CIEAV executable"; }
if [ "$OS_KEY" = "macos" ]; then [ "$PINNED_MACOS_SIGNER" != "__CIEAV_MACOS_SIGNING_IDENTITY__" ] || fail "installer has no pinned macOS signer"; /usr/bin/codesign --verify --strict --verbose=2 "$RUNTIME_STAGED" >/dev/null 2>&1 || fail "CIEAV executable failed macOS code-signature verification"; SIGN_DETAIL=$(/usr/bin/codesign -dv --verbose=4 "$RUNTIME_STAGED" 2>&1 || true); printf '%s\n' "$SIGN_DETAIL" | grep -F "Authority=$PINNED_MACOS_SIGNER" >/dev/null || fail "CIEAV executable signer does not match the pinned Developer ID"; printf '%s\n' "CIEAV · macOS Developer ID verified"; fi
mkdir -p "$(dirname "$INSTALL_ROOT")" "$BIN_ROOT"; rm -rf "$BACKUP_ROOT"; if [ -e "$INSTALL_ROOT" ]; then mv "$INSTALL_ROOT" "$BACKUP_ROOT"; fi; mv "$PAYLOAD" "$INSTALL_ROOT"; RUNTIME_REPLACED=1
RUNTIME_CIEAV="$INSTALL_ROOT/bin/cieav"; if [ ! -f "$RUNTIME_CIEAV" ] && [ -f "$INSTALL_ROOT/bin/latch" ]; then RUNTIME_CIEAV="$INSTALL_ROOT/bin/latch"; fi; RUNTIME_NODE="$INSTALL_ROOT/runtime/node"; [ -f "$RUNTIME_CIEAV" ] || fail "installed runtime does not contain the CIEAV executable"; [ -f "$RUNTIME_NODE" ] || fail "installed runtime does not contain the bundled Node runtime"; chmod 0755 "$RUNTIME_CIEAV" "$RUNTIME_NODE"
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
export PATH="$INSTALL_ROOT/runtime:$BIN_ROOT:$PATH"; export CIEAV_HOME="$INSTALL_ROOT" CIEAV_CLOUD_URL="$PINNED_CLOUD_URL" CIEAV_VERSION="$PINNED_RELEASE_VERSION" LATCH_HOME="$INSTALL_ROOT" LATCH_CLOUD_URL="$PINNED_CLOUD_URL" LATCH_VERSION="$PINNED_RELEASE_VERSION"
printf '%s\n' "CIEAV · running runtime self-check"; "$RUNTIME_CIEAV" doctor || fail "runtime self-check failed"; printf '%s\n' "CIEAV · enrolling with Cloud Intelligence"; "$RUNTIME_CIEAV" cloud enroll || fail "cloud enrollment failed"; printf '%s\n' "CIEAV · running cloud safety probe"; "$RUNTIME_CIEAV" cloud probe || fail "cloud safety probe failed"; if [ "$NO_SERVICE" != "1" ]; then printf '%s\n' "CIEAV · installing always-on Gateway"; "$RUNTIME_CIEAV" gateway install || fail "Gateway service installation failed"; fi; SUCCESS=1
cat <<EOF

CIEAV installed successfully.
Version: $PINNED_RELEASE_VERSION
Runtime: $INSTALL_ROOT
Privacy: durable user state remains local

Run: cieav gateway status
Run: cieav cloud status
Run: cieav test-lab
EOF
