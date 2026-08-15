#!/bin/zsh

set -u

readonly APP_URL="http://127.0.0.1:8080/"
readonly LAUNCHER_DIR="${0:A:h}"
readonly APP_DIR="${LAUNCHER_DIR}/showdivisionraces"

pause_after_error() {
  echo
  read -r "?Press Return to close this window..."
}

if [[ ! -d "${APP_DIR}" ]]; then
  echo "Could not find the showdivisionraces folder next to this launcher."
  pause_after_error
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is not installed or is not available in your PATH."
  echo "Install Node.js, then try the launcher again."
  pause_after_error
  exit 1
fi

# If the development server is already running, simply open it.
if curl --silent --fail --max-time 2 "${APP_URL}" >/dev/null 2>&1; then
  open "${APP_URL}"
  exit 0
fi

cd "${APP_DIR}" || {
  echo "Could not open ${APP_DIR}."
  pause_after_error
  exit 1
}

if [[ ! -d node_modules ]]; then
  echo "Installing project dependencies for the first launch..."
  if ! npm install; then
    echo "The dependency installation failed."
    pause_after_error
    exit 1
  fi
fi

echo "Starting MLB Division Race Charts..."
echo "The page will open automatically at ${APP_URL}"
echo "Keep this window open while using the site. Press Control-C to stop it."
echo

# Wait until the server is ready before opening the browser.
(
  for attempt in {1..60}; do
    if curl --silent --fail --max-time 1 "${APP_URL}" >/dev/null 2>&1; then
      open "${APP_URL}"
      exit 0
    fi
    sleep 0.5
  done

  echo "The server did not become ready within 30 seconds."
) &

exec npm start
