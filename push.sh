#!/bin/bash
# Usage: ./push.sh [commit message]
# If no message given, uses "edited"
cd "$(dirname "$0")"
MSG="${1:-edited}"
git add -A
git commit -m "$MSG"
git push origin main
