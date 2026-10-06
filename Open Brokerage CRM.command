#!/bin/bash
# Double-click: starts the local server (if needed) and opens the CRM in your browser.
cd "$(dirname "$0")" || exit 1
PORT=8765; URL="http://127.0.0.1:$PORT"
PY=""
for c in /opt/homebrew/bin/python3 /usr/local/bin/python3 /Library/Frameworks/Python.framework/Versions/Current/bin/python3; do [ -x "$c" ] && PY="$c" && break; done
# Apple's /usr/bin/python3 only works once Xcode command line tools are installed.
[ -z "$PY" ] && xcode-select -p >/dev/null 2>&1 && PY=/usr/bin/python3
if [ -z "$PY" ]; then
  echo "Python 3 not found; opening in browser-only mode (data stays in this browser)."
  open app/index.html; exit 0
fi
if ! curl -s -o /dev/null "$URL/"; then
  nohup "$PY" app/server.py $PORT >/dev/null 2>&1 &
  for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -o /dev/null "$URL/" && break; sleep 0.3; done
fi
open "$URL"
osascript -e 'tell application "Terminal" to close (every window whose name contains "Open Brokerage CRM")' >/dev/null 2>&1 &
exit 0
