#!/usr/bin/env sh
# Start the API next to the private-app folder. Python 3.11+.
cd "$(dirname "$0")"
pip install -r requirements.txt
exec uvicorn community-api:app --host 0.0.0.0 --port 3003
