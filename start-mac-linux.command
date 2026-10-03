#!/bin/bash
cd "$(dirname "$0")/backend"

if [ ! -d node_modules ]; then
  echo "Installing dependencies for the first time, please wait..."
  npm install
fi

( sleep 1.5 && command -v open >/dev/null 2>&1 && open http://localhost:4000/login.html ) &
( sleep 1.5 && command -v xdg-open >/dev/null 2>&1 && xdg-open http://localhost:4000/login.html ) &

echo "Starting AgriConnect... keep this terminal open while you use the app."
echo "Press Ctrl+C to stop the server."
node server.js
