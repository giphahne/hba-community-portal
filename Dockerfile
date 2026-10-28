# HBA community portal: one container serves the sign-in page (/), the member app (/app/) and the API (/api/).
# All state lives in Supabase and in environment variables (see server/.env.example), so the container can be
# restarted or moved at any time. Record scans: unzip hba-portal-record-scans.zip into private-app/ before
# building and they are included; without them the research cards show "image not available".
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=3003 HBA_REQUIRE_SECRETS=1

# tesseract reads scanned PDF pages during document intake
RUN apt-get update \
 && apt-get install -y --no-install-recommends tesseract-ocr \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /srv/server
COPY server/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY site/ /srv/site/
COPY private-app/ /srv/private-app/
COPY server/ /srv/server/

RUN useradd --system --uid 10001 --home-dir /srv hba
USER hba

EXPOSE 3003
HEALTHCHECK --interval=60s --timeout=5s --start-period=20s \
  CMD python -c "import os,urllib.request;urllib.request.urlopen('http://127.0.0.1:'+os.environ['PORT']+'/api/health',timeout=4)"
# --proxy-headers: the host's HTTPS proxy reports the real scheme and client address
CMD ["sh", "-c", "exec uvicorn community-api:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
