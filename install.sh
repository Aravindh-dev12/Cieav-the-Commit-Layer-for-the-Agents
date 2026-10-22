#!/usr/bin/env bash
# CIEAV One-Line Linux / macOS Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/Aravindh-dev12/cieav-agent-workforce/main/install.sh | bash

set -e

echo -e "\033[1;36m============================================================"
echo -e "   CIEAV: THE COMMIT LAYER FOR THE INTERNET & AGENTS        "
echo -e "   One-Line Native Linux / macOS Installer                  "
echo -e "============================================================\033[0m"

INSTALL_DIR="$HOME/.cieav"
REPO_URL="https://github.com/Aravindh-dev12/cieav-agent-workforce.git"

if ! command -v python3 &> /dev/null; then
    echo -e "\033[1;31m[ERROR] Python 3.10+ is required. Please install python3.\033[0m"
    exit 1
fi

if ! command -v git &> /dev/null; then
    echo -e "\033[1;31m[ERROR] Git is required. Please install git.\033[0m"
    exit 1
fi

echo -e "\033[1;33m[1/4] Cloning/Updating CIEAV into $INSTALL_DIR...\033[0m"
if [ -d "$INSTALL_DIR" ]; then
    cd "$INSTALL_DIR"
    git pull origin main
else
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

echo -e "\033[1;33m[2/4] Installing Python dependencies...\033[0m"
python3 -m pip install --quiet -r requirements.txt

echo -e "\033[1;33m[3/4] Creating global 'cieav' executable...\033[0m"
cat << 'EOF' > "$INSTALL_DIR/cieav"
#!/usr/bin/env bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
PYTHONPATH="$DIR:$DIR/python:$PYTHONPATH" python3 -m cieav_platform "$@"
EOF
chmod +x "$INSTALL_DIR/cieav"

if [ -w "/usr/local/bin" ]; then
    ln -sf "$INSTALL_DIR/cieav" /usr/local/bin/cieav
    echo -e "  \033[1;32mLinked to /usr/local/bin/cieav\033[0m"
else
    mkdir -p "$HOME/.local/bin"
    ln -sf "$INSTALL_DIR/cieav" "$HOME/.local/bin/cieav"
    echo -e "  \033[1;32mLinked to $HOME/.local/bin/cieav\033[0m"
fi

echo -e "\033[1;33m[4/4] Verifying CIEAV...\033[0m"
"$INSTALL_DIR/cieav" /status

echo -e "\n\033[1;32m============================================================"
echo -e "   ✅ CIEAV INSTALLED SUCCESSFULLY!                         "
echo -e "============================================================\033[0m"
echo -e "You can now run 'cieav' from any terminal:\n"
echo -e "  cieav                                            # Launch interactive NLP terminal"
echo -e "  cieav \"find jobs based on my resume and apply\"   # Alma computer control agent"
echo -e "  cieav /status                                    # Verify Ed25519 hash chain"
echo -e "  cieav /receipts                                  # View immutable receipts"
echo -e "  cieav /undo                                      # Atomic two-phase rollback"
echo -e "\033[1;32m============================================================\033[0m\n"
