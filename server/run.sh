#!/usr/bin/env sh
# Run the portal without Docker (Python 3.11+). Serves the sign-in page, the member app and the API on one port.
# Settings come from server/.env.community (copy .env.example) or the environment.
cd "$(dirname "$0")"
pip install -r requirements.txt
exec uvicorn community-api:app --host 0.0.0.0 --port "${PORT:-3003}" --proxy-headers
