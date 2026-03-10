#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${API_BASE_URL:-}" || -z "${FRONTEND_URL:-}" ]]; then
  echo "Usage:"
  echo "  API_BASE_URL=https://api.example.com FRONTEND_URL=https://app.example.com $0"
  exit 1
fi

echo "Checking API health endpoint..."
curl -fsS "${API_BASE_URL%/}/health" >/dev/null
echo "API health check passed: ${API_BASE_URL%/}/health"

echo "Checking frontend URL..."
curl -fsS "${FRONTEND_URL%/}" >/dev/null
echo "Frontend URL reachable: ${FRONTEND_URL%/}"

echo "Checking CORS preflight from frontend origin..."
cors_headers="$(curl -i -sS -X OPTIONS "${API_BASE_URL%/}/auth/login" \
  -H "Origin: ${FRONTEND_URL%/}" \
  -H "Access-Control-Request-Method: POST")"

if [[ "${cors_headers}" != *"Access-Control-Allow-Origin: ${FRONTEND_URL%/}"* ]]; then
  echo "CORS validation failed: backend did not echo expected origin ${FRONTEND_URL%/}"
  exit 1
fi
echo "CORS check passed for ${FRONTEND_URL%/}"

echo "All cloud deployment checks passed."
