#!/bin/bash
# Double-click to open the Brokerage CRM in your default browser.
cd "$(dirname "$0")" && open app/index.html
osascript -e 'tell application "Terminal" to close (every window whose name contains "Open Brokerage CRM")' >/dev/null 2>&1 &
exit 0
