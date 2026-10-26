import unittest
from datetime import datetime, timezone
from local_weather import speed_mph, temperature_f, gust_at, distance_miles


class WeatherTests(unittest.TestCase):
    def test_mph_units(self):
        self.assertEqual(speed_mph(16.09344, "wmoUnit:km_h-1"), 10)
        self.assertEqual(speed_mph(10, "wmoUnit:m_s-1"), 22.4)
        self.assertEqual(speed_mph(10, "wmoUnit:kn"), 11.5)
        self.assertEqual(speed_mph(0, "wmoUnit:km_h-1"), 0)

    def test_missing_is_not_zero(self):
        for value, unit in [(None, "wmoUnit:km_h-1"), (1, "unknown"), (-3, "wmoUnit:km_h-1")]:
            self.assertIsNone(speed_mph(value, unit))
        self.assertIsNone(temperature_f({"value": None, "unitCode": "wmoUnit:degC"}))
        self.assertEqual(temperature_f({"value": 0, "unitCode": "wmoUnit:degC"}), 32)

    def test_valid_gust_interval(self):
        field = {"uom": "wmoUnit:km_h-1", "values": [
            {"validTime": "2026-10-17T00:00:00+00:00/PT3H", "value": 16.09344},
            {"validTime": "2026-10-17T03:00:00+00:00/P1DT1H30M", "value": 32.18688}
        ]}
        self.assertEqual(gust_at(field, datetime(2026, 10, 17, 2, tzinfo=timezone.utc)), 10)
        self.assertEqual(gust_at(field, datetime(2026, 10, 17, 3, tzinfo=timezone.utc)), 20)
        self.assertIsNone(gust_at(field, datetime(2026, 10, 20, tzinfo=timezone.utc)))

    def test_distance(self):
        self.assertEqual(distance_miles([-70.7098, 41.7437]), 0)
        self.assertTrue(10 < distance_miles([-70.72806, 41.90861]) < 13)


if __name__ == "__main__":
    unittest.main()
