"""Read-only NWS conditions and point forecast. No member data is sent upstream."""
import math
import re
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

LAT, LON = 41.7437, -70.7098
POINT = f"https://api.weather.gov/points/{LAT},{LON}"
PAGE = f"https://forecast.weather.gov/MapClick.php?lat={LAT}&lon={LON}"
HEADERS = {"User-Agent": "HBACommunityWeather/1.0 (Hamilton Beach Association, Wareham)",
           "Accept": "application/geo+json"}
_cache = {}
_point_cache = {}


def timestamp(value):
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


def speed_mph(value, unit):
    if value is None:
        return None
    factors = {"wmoUnit:km_h-1": 1 / 1.609344, "wmoUnit:m_s-1": 2.2369362921,
               "wmoUnit:mi_h-1": 1, "wmoUnit:kn": 1.150779448}
    factor = factors.get(unit)
    if factor is None or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
        return None
    return round(value * factor, 1)


def temperature_f(q):
    v = q.get("value")
    if not isinstance(v, (int, float)) or not math.isfinite(v):
        return None
    if q.get("unitCode") == "wmoUnit:degC":
        return round(v * 9 / 5 + 32, 1)
    return round(v, 1) if q.get("unitCode") == "wmoUnit:degF" else None


def gust_at(field, at):
    for item in field.get("values", []):
        try:
            start, duration = item["validTime"].split("/")
            m = re.fullmatch(r"P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?", duration)
            if not m:
                continue
            days, hours, minutes, seconds = [float(x or 0) for x in m.groups()]
            begin = timestamp(start)
            if begin <= at < begin + timedelta(days=days, hours=hours, minutes=minutes, seconds=seconds):
                return speed_mph(item.get("value"), field.get("uom"))
        except (ValueError, KeyError, TypeError):
            continue
    return None


def distance_miles(coordinates):
    lon, lat = coordinates[:2]
    a, b = math.radians(lat - LAT), math.radians(lon - LON)
    v = math.sin(a / 2) ** 2 + math.cos(math.radians(LAT)) * math.cos(math.radians(lat)) * math.sin(b / 2) ** 2
    return round(3958.7613 * 2 * math.asin(min(1, math.sqrt(v))), 1)


def read(client, url):
    # Follow only official HTTPS endpoints, including URLs returned in NWS responses.
    if urlparse(url).scheme != "https" or urlparse(url).hostname != "api.weather.gov":
        raise ValueError("Unexpected weather endpoint")
    response = client.get(url, headers=HEADERS, timeout=8)
    response.raise_for_status()
    return response.json()


def snapshot(client):
    global _cache, _point_cache
    if _cache and time.time() - _cache["at"] < 600:
        return _cache["data"]
    now = datetime.now(timezone.utc)
    if not _point_cache or time.time() - _point_cache["at"] > 86400:
        _point_cache = {"at": time.time(), "properties": read(client, POINT)["properties"]}
    point = _point_cache["properties"]
    hourly, grid, observation, warnings = {}, {}, None, []
    forecast_url = point["forecastHourly"]
    try:
        hourly = read(client, forecast_url)["properties"]
    except Exception:
        warnings.append("Hourly forecast is unavailable; no replacement values have been invented.")
    try:
        grid = read(client, point["forecastGridData"])["properties"]
    except Exception:
        warnings.append("Forecast gust data is unavailable. Missing gusts do not mean calm conditions.")
    try:
        station = read(client, point["observationStations"])["features"][0]
        station_url = station["id"]
        p = read(client, station_url + "/observations/latest")["properties"]
        observed = timestamp(p["timestamp"])
        if observed > now + timedelta(minutes=10):
            raise ValueError("Future observation")
        qspeed, qgust = p.get("windSpeed") or {}, p.get("windGust") or {}
        degrees = (p.get("windDirection") or {}).get("value")
        observation = {
            "station": station_url.rsplit("/", 1)[-1],
            "name": station["properties"]["name"], "observed_at": p["timestamp"],
            "distance_miles": distance_miles(station["geometry"]["coordinates"]),
            "description": p.get("textDescription") or "Description not supplied",
            "temperature_f": temperature_f(p.get("temperature") or {}),
            "wind_mph": speed_mph(qspeed.get("value"), qspeed.get("unitCode")),
            "gust_mph": speed_mph(qgust.get("value"), qgust.get("unitCode")),
            "wind_degrees": degrees if isinstance(degrees, (float, int)) and 0 <= degrees <= 360 else None,
            "stale": (now - observed).total_seconds() > 7200,
            "source": station_url + "/observations/latest"
        }
    except Exception:
        warnings.append("Nearby station observations are unavailable; the point forecast is not a live beach reading.")
    periods = []
    for p in hourly.get("periods", []):
        try:
            if timestamp(p["endTime"]) <= now:
                continue
            # Support NWS temperature QuantitativeValue as well as the documented older field.
            temp = p.get("temperature")
            if isinstance(temp, dict):
                temp = temperature_f(temp)
            elif p.get("temperatureUnit") == "C" and isinstance(temp, (int, float)):
                temp = round(temp * 9 / 5 + 32, 1)
            elif p.get("temperatureUnit") != "F":
                temp = None
            wind = p.get("windSpeed")
            if isinstance(wind, dict):
                value = speed_mph(wind.get("value"), wind.get("unitCode"))
                wind = f"{value:g} mph" if value is not None else "Not supplied"
            periods.append({"start": p["startTime"], "end": p["endTime"],
                            "temperature_f": temp, "description": p.get("shortForecast") or "Not supplied",
                            "wind": wind or "Not supplied", "direction": p.get("windDirection") or "Not supplied",
                            "gust_mph": gust_at(grid.get("windGust", {}), timestamp(p["startTime"])),
                            "rain_probability": (p.get("probabilityOfPrecipitation") or {}).get("value"),
                            "is_daytime": p.get("isDaytime") if isinstance(p.get("isDaytime"), bool) else None})
        except (ValueError, KeyError, TypeError):
            continue
    if not periods and not observation:
        raise ValueError("Weather data is unavailable")
    update = hourly.get("updateTime") or hourly.get("generatedAt")
    def old(value):
        try:
            return not value or (now - timestamp(value)).total_seconds() > 21600
        except (ValueError, TypeError):
            return True
    stale = old(update)
    if grid and old(grid.get("updateTime")):
        warnings.append("The gust forecast grid update is older than six hours or has no valid update time; check the official forecast.")
    data = {"location": "Hamilton Beach, Wareham, Massachusetts", "latitude": LAT, "longitude": LON,
            "time_zone": "America/New_York", "retrieved_at": now.isoformat(),
            "forecast_updated_at": update, "forecast_stale": stale, "hourly": periods,
            "observation": observation, "warnings": warnings,
            "forecast_source": forecast_url, "source": PAGE,
            "grid_source": point["forecastGridData"],
            "gust_updated_at": grid.get("updateTime")}
    _cache = {"at": time.time(), "data": data}
    return data
