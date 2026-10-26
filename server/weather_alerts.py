"""Location-scoped official NWS alerts, independently cached from forecasts."""
import copy
import threading
import time
from datetime import datetime, timezone
from urllib.parse import urlparse
from local_weather import LAT, LON, PAGE, read, timestamp

SOURCE = f"https://api.weather.gov/alerts/active?point={LAT},{LON}"
TTL = 60
MAX_STALE = 900
_cache = {}
_lock = threading.Lock()
SEVERITY = {"Extreme": 0, "Severe": 1, "Moderate": 2, "Minor": 3, "Unknown": 4}
URGENCY = {"Immediate": 0, "Expected": 1, "Future": 2, "Past": 3, "Unknown": 4}


def official_url(value):
    p = urlparse(str(value or ""))
    return str(value) if p.scheme == "https" and p.hostname == "api.weather.gov" else SOURCE


def optional_time(value):
    if not value:
        return None
    t = timestamp(value)
    if t.tzinfo is None:
        raise ValueError("Alert time has no time zone")
    return t


def parse_alerts(payload, now):
    if payload.get("type") != "FeatureCollection" or not isinstance(payload.get("features"), list):
        raise ValueError("NWS did not return a complete alert collection")
    if (payload.get("pagination") or {}).get("next"):
        raise ValueError("Alert response was paginated; do not claim complete coverage")
    superseded, candidates = set(), {}
    for feature in payload["features"]:
        p = feature.get("properties")
        if not isinstance(p, dict) or not p.get("status"):
            raise ValueError("Alert status could not be verified")
        if p["status"] != "Actual":
            continue
        message_type = p.get("messageType")
        if message_type not in {"Alert", "Update", "Cancel"}:
            raise ValueError("Unrecognized actual alert message type")
        for reference in p.get("references") or []:
            if isinstance(reference, dict):
                superseded.update(str(reference[k]) for k in ("identifier", "@id") if reference.get(k))
        if message_type == "Cancel":
            continue
        identity = p.get("id") or feature.get("id") or p.get("@id")
        if not identity or not p.get("event"):
            raise ValueError("An actual alert lacks its identifier or event")
        expires, ends = optional_time(p.get("expires")), optional_time(p.get("ends"))
        expiry = min(t for t in (expires, ends) if t is not None) if expires or ends else None
        if expiry and expiry <= now:
            continue
        sent = optional_time(p.get("sent"))
        if not sent:
            raise ValueError("Alert issuance time could not be verified")
        optional_time(p.get("onset"))
        optional_time(p.get("effective"))
        event = str(p["event"])
        alert = {
            "id": str(identity), "event": event, "headline": str(p.get("headline") or event),
            "severity": p.get("severity") if p.get("severity") in SEVERITY else "Unknown",
            "urgency": p.get("urgency") if p.get("urgency") in URGENCY else "Unknown",
            "certainty": str(p.get("certainty") or "Unknown"),
            "area": str(p.get("areaDesc") or "Area description not provided"),
            "sent": p["sent"], "effective": p.get("effective"), "onset": p.get("onset"),
            "expires": p.get("expires"), "ends": p.get("ends"),
            "valid_until": expiry.isoformat() if expiry else None,
            "sender": str(p.get("senderName") or "National Weather Service"),
            "description": str(p.get("description") or "No separate description supplied."),
            "instruction": str(p.get("instruction") or ""),
            "response": str(p.get("response") or "Not supplied"),
            "coastal": any(s in event.lower() for s in ("coastal flood", "storm surge", "tidal flood", "tsunami")),
            "source": official_url(p.get("@id") or feature.get("id") or p.get("id")),
            "message_type": message_type,
        }
        old = candidates.get(alert["id"])
        if not old or sent > timestamp(old["sent"]):
            candidates[alert["id"]] = alert
    alerts = [a for a in candidates.values() if a["id"] not in superseded and a["source"] not in superseded]
    return sorted(alerts, key=lambda a: (SEVERITY[a["severity"]], URGENCY[a["urgency"]], -timestamp(a["sent"]).timestamp()))


def snapshot(client):
    global _cache
    with _lock:
        if _cache and time.time() - _cache["at"] < TTL:
            result = copy.deepcopy(_cache["data"])
            result["alerts"] = [a for a in result["alerts"] if not a["valid_until"] or timestamp(a["valid_until"]) > datetime.now(timezone.utc)]
            return result
        try:
            payload = read(client, SOURCE)
            now = datetime.now(timezone.utc)
            data = {"status": "current", "alerts": parse_alerts(payload, now),
                    "location": "Hamilton Beach, Wareham, Massachusetts",
                    "latitude": LAT, "longitude": LON, "checked_at": now.isoformat(),
                    "source_updated_at": payload.get("updated"),
                    "source": SOURCE, "forecast_source": PAGE, "cache_seconds": TTL,
                    "scope": "NWS active-alert point query; county and forecast-zone results for the Hamilton Beach map reference. Read each alert's affected area; this is not a house-by-house impact assessment."}
            _cache = {"at": time.time(), "data": copy.deepcopy(data)}
            return data
        except Exception:
            if _cache and time.time() - _cache["at"] <= MAX_STALE:
                data = copy.deepcopy(_cache["data"])
                data["status"] = "stale"
                data["error"] = "The latest NWS check failed. These are unexpired last-known messages, not a verified current alert list."
                data["alerts"] = [a for a in data["alerts"] if not a["valid_until"] or timestamp(a["valid_until"]) > datetime.now(timezone.utc)]
                return data
            raise
