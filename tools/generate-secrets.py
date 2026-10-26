"""Print the secret environment variables the backend needs, ready to paste into the host's settings.

    python tools/generate-secrets.py                      # new keys
    python tools/generate-secrets.py --from-dir PATH      # reuse an existing community-private-data folder

Reusing the old folder (session.key, vapid.pem) keeps payer fingerprints matching and keeps administrators'
devices subscribed to alerts. New keys are fine for a fresh install. Treat the output as a password.
"""
import argparse
import base64
from pathlib import Path

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import serialization
from py_vapid import Vapid

parser = argparse.ArgumentParser()
parser.add_argument("--from-dir", type=Path, help="existing community-private-data folder to convert")
args = parser.parse_args()

if args.from_dir:
    session_key = (args.from_dir / "session.key").read_bytes().strip().decode()
    vapid = Vapid.from_file(str(args.from_dir / "vapid.pem"))
else:
    session_key = Fernet.generate_key().decode()
    vapid = Vapid()
    vapid.generate_keys()

Fernet(session_key.encode())  # fails loudly if the old file is not a Fernet key
der = vapid.private_key.private_bytes(serialization.Encoding.DER, serialization.PrivateFormat.PKCS8,
                                      serialization.NoEncryption())
print("HBA_SESSION_KEY=" + session_key)
print("HBA_VAPID_PRIVATE_KEY=" + base64.urlsafe_b64encode(der).decode().rstrip("="))
