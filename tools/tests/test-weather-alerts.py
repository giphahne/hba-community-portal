import copy
import time
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch
import weather_alerts as w


class AlertTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime.now(timezone.utc)

    def feature(self, identity="test-alert", **changes):
        p = {"id": identity, "@id": "https://api.weather.gov/alerts/" + identity,
             "status": "Actual", "messageType": "Alert",
             "event": "Coastal Flood Advisory", "severity": "Minor", "urgency": "Expected",
             "sent": (self.now - timedelta(minutes=10)).isoformat(),
             "expires": (self.now + timedelta(hours=2)).isoformat(),
             "ends": (self.now + timedelta(hours=1)).isoformat(),
             "areaDesc": "Southern Plymouth County", "instruction": "Follow official instructions."}
        p.update(changes)
        return {"id": p["@id"], "type": "Feature", "properties": p}

    def collection(self, *features):
        return {"type": "FeatureCollection", "features": list(features), "pagination": None}

    def test_severity_and_coastal_group(self):
        result = w.parse_alerts(self.collection(self.feature(), self.feature("tornado", event="Tornado Warning", severity="Extreme", urgency="Immediate")), self.now)
        self.assertEqual(result[0]["event"], "Tornado Warning")
        self.assertTrue(result[1]["coastal"])
        self.assertFalse(result[0]["coastal"])

    def test_future_onset_kept(self):
        a = self.feature(onset=(self.now + timedelta(hours=5)).isoformat(), event="Coastal Flood Watch")
        self.assertEqual(len(w.parse_alerts(self.collection(a), self.now)), 1)

    def test_expiry_and_event_end(self):
        expired = self.feature(expires=self.now.isoformat())
        ended = self.feature("ended", ends=(self.now - timedelta(seconds=1)).isoformat())
        self.assertEqual(w.parse_alerts(self.collection(expired, ended), self.now), [])

    def test_not_actual(self):
        self.assertEqual(w.parse_alerts(self.collection(self.feature(status="Test"), self.feature("e", status="Exercise")), self.now), [])

    def test_update_replaces_reference(self):
        update = self.feature("new", messageType="Update", references=[{"identifier": "old"}])
        result = w.parse_alerts(self.collection(self.feature("old"), update), self.now)
        self.assertEqual([a["id"] for a in result], ["new"])

    def test_cancel_suppresses_old(self):
        cancel = self.feature("cancel", messageType="Cancel", references=[{"identifier": "old"}])
        self.assertEqual(w.parse_alerts(self.collection(self.feature("old"), cancel), self.now), [])

    def test_duplicate_and_link_safety(self):
        result = w.parse_alerts(self.collection(self.feature(), self.feature(**{"@id": "javascript:alert(1)"})), self.now)
        self.assertEqual(len(result), 1)
        self.assertTrue(result[0]["source"].startswith("https://api.weather.gov/"))

    def test_incomplete_feed_raises(self):
        for p in [{}, {"type": "FeatureCollection"}, {**self.collection(), "pagination": {"next": "https://api.weather.gov/alerts?cursor=next"}},
                  self.collection(self.feature(status=None))]:
            with self.assertRaises(ValueError):
                w.parse_alerts(p, self.now)

    def test_missing_time_disclosed(self):
        result = w.parse_alerts(self.collection(self.feature(expires=None, ends=None)), self.now)
        self.assertIsNone(result[0]["valid_until"])
        with self.assertRaises(ValueError):
            w.parse_alerts(self.collection(self.feature(sent=None)), self.now)

    def test_failed_feed_is_not_empty_success(self):
        with patch.object(w, "_cache", {}), patch.object(w, "read", side_effect=RuntimeError("offline")):
            with self.assertRaises(RuntimeError):
                w.snapshot(None)

    def test_stale_fallback_and_expiry(self):
        data = {"status": "current", "alerts": w.parse_alerts(self.collection(self.feature()), self.now),
                "checked_at": self.now.isoformat()}
        cache = {"at": time.time() - 120, "data": copy.deepcopy(data)}
        with patch.object(w, "_cache", cache), patch.object(w, "read", side_effect=RuntimeError("offline")):
            result = w.snapshot(None)
            self.assertEqual(result["status"], "stale")
            self.assertEqual(len(result["alerts"]), 1)
        data["alerts"][0]["valid_until"] = (self.now - timedelta(seconds=1)).isoformat()
        with patch.object(w, "_cache", {"at": time.time() - 120, "data": data}), patch.object(w, "read", side_effect=RuntimeError("offline")):
            self.assertEqual(w.snapshot(None)["alerts"], [])

    def test_empty_success_and_cache(self):
        with patch.object(w, "_cache", {}), patch.object(w, "read", return_value=self.collection()) as read:
            self.assertEqual(w.snapshot(None)["status"], "current")
            self.assertEqual(w.snapshot(None)["alerts"], [])
            self.assertEqual(read.call_count, 1)


if __name__ == "__main__":
    unittest.main()
