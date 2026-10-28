"""Web Push alerts to administrators' devices."""

import base64
import json
import os
import threading
import time
from datetime import datetime, timezone

from py_vapid import Vapid
from pywebpush import WebPushException, webpush

from hba.config import dev_secret, lock
from hba.supabase import rest

# ---- Administrator alerts (Web Push). HBA_VAPID_PRIVATE_KEY holds the VAPID private key (PEM, or the base64 form
# printed by tools/generate-secrets.py); keep it stable so devices stay subscribed. Subscriptions live in Supabase
# (hba_push_subscriptions); the server sends with the member's own token via the hba_push_targets() function.
def _new_vapid_pem():
    v = Vapid()
    v.generate_keys()
    return v.private_pem()
def _vapid():
    raw_key = dev_secret("HBA_VAPID_PRIVATE_KEY", "vapid.pem", _new_vapid_pem).decode()
    v = Vapid.from_pem(raw_key.replace("\\n", "\n").encode()) if raw_key.startswith("-----BEGIN") else Vapid.from_string(raw_key)
    from cryptography.hazmat.primitives import serialization
    raw = v.public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return v, base64.urlsafe_b64encode(raw).decode().rstrip("=")
VAPID, VAPID_PUBLIC = _vapid()
PUSH_SUBJECT = os.environ.get("HBA_PUSH_SUBJECT", "mailto:admin@example.org")
# Pending-account alerts repeat on every session check, so each alert key is sent once per process. After a
# restart one repeat is possible, which is harmless.
push_sent = {}

def notify_admin(token, kind, title, body, dedupe=None, url="/"):
    """Send a push alert to every administrator device. Runs in the background; failures never affect the request."""
    if dedupe:
        with lock:
            if dedupe in push_sent:
                return
            if len(push_sent) > 5000:
                push_sent.clear()
            push_sent[dedupe] = time.time()
    def run():
        try:
            targets = rest("rpc/hba_push_targets", token, "POST", {}) or []
        except Exception as e:  # noqa: BLE001
            print("push targets unavailable:", e)
            return
        payload = json.dumps({"kind": kind, "title": title, "body": body[:300], "url": url, "at": datetime.now(timezone.utc).isoformat()})
        for t in targets:
            try:
                webpush({"endpoint": t["endpoint"], "keys": {"p256dh": t["p256dh"], "auth": t["auth"]}}, data=payload,
                        vapid_private_key=VAPID, vapid_claims={"sub": PUSH_SUBJECT}, ttl=86400, timeout=15)
            except WebPushException as e:  # noqa: BLE001
                print("push failed:", getattr(e.response, "status_code", "?"), str(e)[:160])
            except Exception as e:  # noqa: BLE001
                print("push error:", str(e)[:160])
    threading.Thread(target=run, daemon=True).start()
