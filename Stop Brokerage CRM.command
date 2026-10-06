#!/bin/bash
pkill -f "app/server.py" && echo "Stopped." || echo "Not running."
sleep 1
