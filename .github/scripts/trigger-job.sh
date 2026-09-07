#!/usr/bin/env bash
#
# trigger-job.sh — shared runner for the ADMIN-only scheduled-job endpoints.
#
# Every job in hrms-backend/jobs/index.js has a manual HTTP trigger, and they
# all need the same three things: a warm instance, a fresh access token, and a
# non-zero exit when the API says it failed. That is this script, so the
# workflow holds schedules and nothing else.
#
# Usage:  bash .github/scripts/trigger-job.sh <path> [json-body]
#   e.g.  bash .github/scripts/trigger-job.sh /attendance/close-day '{"date":"2026-09-07"}'
#
# Environment: API_URL, ADMIN_EMAIL, ADMIN_PASSWORD.

set -euo pipefail

ENDPOINT="${1:?endpoint path required, e.g. /attendance/close-day}"
BODY="${2-}"
[ -n "$BODY" ] || BODY='{}'

: "${API_URL:?HRMS_API_URL repository variable is not set}"
: "${ADMIN_EMAIL:?HRMS_ADMIN_EMAIL secret is not set}"
: "${ADMIN_PASSWORD:?HRMS_ADMIN_PASSWORD secret is not set}"

# A sleeping free instance takes ~50s to cold start, and the first request
# usually times out rather than waiting. Get it warm before the real call so a
# cold start cannot be mistaken for a job failure.
awake=0
for attempt in $(seq 1 10); do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 90 "$API_URL/health" || true)"
  if [ "$code" = "200" ]; then
    echo "service awake after $attempt attempt(s)"
    awake=1
    break
  fi
  echo "wake attempt $attempt: HTTP ${code:-no response} - retrying in 15s"
  sleep 15
done
if [ "$awake" -ne 1 ]; then
  echo "::error::backend did not become healthy"
  exit 1
fi

# Access tokens live 20 minutes (AT_EXPIRES_IN), so there is nothing long-lived
# worth storing - log in fresh on every run.
login="$(curl -sS --max-time 60 -X POST "$API_URL/auth/login" \
  -H 'Content-Type: application/json' \
  --data "$(jq -nc --arg e "$ADMIN_EMAIL" --arg p "$ADMIN_PASSWORD" '{email:$e,password:$p}')")"

token="$(printf '%s' "$login" | jq -r '.data.access_token // empty')"
if [ -z "$token" ]; then
  # PASSWORD_CHANGE_REQUIRED shows up here: verifyToken rejects an account
  # flagged mustChangePassword, and none of these endpoints are on
  # PASSWORD_GATE_ALLOW.
  echo "::error::login failed: $(printf '%s' "$login" | jq -r '.message // "no access_token in response"')"
  exit 1
fi
echo "::add-mask::$token"

echo "POST $ENDPOINT"
response="$(curl -sS --max-time 300 -X POST "$API_URL$ENDPOINT" \
  -H "Authorization: Bearer $token" \
  -H 'Content-Type: application/json' \
  --data "$BODY")"

if [ "$(printf '%s' "$response" | jq -r '.success // false')" != "true" ]; then
  echo "::error::$ENDPOINT failed: $(printf '%s' "$response" | jq -r '.message // "unknown error"')"
  printf '%s\n' "$response"
  exit 1
fi

printf '%s' "$response" | jq '.data'

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "### $ENDPOINT"
    echo
    echo '```json'
    printf '%s' "$response" | jq '.data'
    echo '```'
  } >> "$GITHUB_STEP_SUMMARY"
fi
