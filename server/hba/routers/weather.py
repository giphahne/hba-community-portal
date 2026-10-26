"""Weather, NWS alerts, bulletin, official beach status and tides."""

import json
import re
import time
from datetime import date, datetime, timedelta, timezone

import httpx
import local_weather
import weather_alerts
from fastapi import APIRouter, HTTPException, Request

from hba import supabase
from hba.config import KEY
from hba.sessions import require
from hba.supabase import rest

router = APIRouter()

_tide_cache={}

@router.get("/api/weather-alerts")
def active_weather_alerts():
    try:
        return weather_alerts.snapshot(supabase.client)
    except Exception:
        raise HTTPException(503, "NWS alerts are unavailable. Current alert status could not be verified; check the official NWS forecast and local emergency notices.")

@router.get("/api/weather")
def weather_report():
    try:
        return local_weather.snapshot(supabase.client)
    except Exception:
        raise HTTPException(503, "Local NWS weather is unavailable. Use the official Hamilton Beach forecast; no current conditions are assumed.")

@router.get("/api/bulletin")
def public_bulletin(req: Request):
    token,_=require(req)
    rows=rest("hba_public_advisories",KEY,query="select=category,location,status,note,source_url,checked_at,valid_until&order=checked_at.desc&limit=30")
    settings={r["key"]:r["value"] for r in rest("hba_settings",token,query="select=key,value&key=like.public_*")}
    return {"advisories":rows,"settings":settings,"retrieved_at":datetime.now(timezone.utc).isoformat()}

# ---- Official beach status: DPH beach water quality (Tableau public dashboard) and DMF shellfish classification/notices ----
_beach_status_cache = {}
_DPH_TOKEN_URL = "https://publicdashboardtoken.mass.gov/tokens/requestpublicaccess?connectedapp=DPH-BCEH-BDD-BD"
_DPH_HOST = "https://tableaudashboards.eohhs.mass.gov"
_DPH_VIEWS = {"map": "bb384ed5-0871-40c3-9539-cb4a9402fcf4", "results": "28ae6973-7dfc-4208-9ca9-5705396b4ed4",
              "closures": "a124523d-1744-4983-8ce7-e4b8eb7efda6"}
_DSGA_URL = "https://arcgisserver.digital.mass.gov/arcgisserver/rest/services/AGOL/DSGA/FeatureServer/0/query"
_DMF_NOTICES_URL = "https://www.mass.gov/lists/emergency-shellfish-closure-and-opening-notices"

def _csv_rows(text):
    import csv, io
    return list(csv.DictReader(io.StringIO(text)))

def _dph_beach():
    """Hamilton Beach rows from DPH's public dashboard. Uses the state's public-access token endpoint (the same one the
    mass.gov page uses to embed the dashboard) and Tableau's view-data export. Returns None on any failure."""
    tok = supabase.client.get(_DPH_TOKEN_URL, timeout=20).json().get("token")
    if not tok:
        return None
    sess = supabase.client.post(_DPH_HOST + "/api/3.21/auth/signin", json={"credentials": {"jwt": tok, "site": {"contentUrl": "eohhspublic"}}},
                       headers={"Accept": "application/json"}, timeout=30).json()["credentials"]
    h = {"X-Tableau-Auth": sess["token"]}
    base = f"{_DPH_HOST}/api/3.21/sites/{sess['site']['id']}/views/"
    try:
        status = [r for r in _csv_rows(supabase.client.get(base + _DPH_VIEWS["map"] + "/data", params={"vf_Town": "Wareham"}, headers=h, timeout=60).text)
                  if r.get("Beach Name", "").strip().lower() == "hamilton beach"]
        samples = _csv_rows(supabase.client.get(base + _DPH_VIEWS["results"] + "/data", params={"vf_Name": "Hamilton Beach"}, headers=h, timeout=60).text)
        closures = [r for r in _csv_rows(supabase.client.get(base + _DPH_VIEWS["closures"] + "/data", headers=h, timeout=60).text)
                    if "hamilton" in json.dumps(r).lower() and "wareham" in json.dumps(r).lower()]
    finally:
        try:
            supabase.client.post(_DPH_HOST + "/api/3.21/auth/signout", headers=h, timeout=15)
        except httpx.HTTPError:
            pass
    def when(r):
        try:
            return datetime.strptime(r["Date"], "%m/%d/%Y %I:%M:%S %p")
        except (KeyError, ValueError):
            return datetime.min
    samples = sorted([r for r in samples if r.get("Date")], key=when, reverse=True)
    out = []
    for r in samples[:8]:
        try:
            val = float(r.get("Results (CFU/100 ml)") or "")
        except ValueError:
            continue
        gm = r.get("GeoMean (CFU/100 ml)") or ""
        out.append({"sampled_at": when(r).isoformat(), "indicator": r.get("Indicator", ""), "result_cfu": val,
                    "geomean_cfu": float(gm) if gm else None, "exceeds_single_sample": val > 104})
    return {"status": (status[0].get("Beach Status") if status else None), "samples": out, "closures": closures,
            "single_sample_limit_cfu": 104, "geomean_limit_cfu": 35, "indicator": "Enterococci"}

def _dmf_classification():
    params = {"geometry": json.dumps({"xmin": -70.73, "ymin": 41.73, "xmax": -70.70, "ymax": 41.76, "spatialReference": {"wkid": 4326}}),
              "geometryType": "esriGeometryEnvelope", "inSR": 4326, "spatialRel": "esriSpatialRelIntersects",
              "outFields": "NAME,GROWING_AR,AREA_DESC,CLASS,CONDITION,BEGIN_DATE,ACRES", "returnGeometry": "false", "f": "json"}
    feats = supabase.client.get(_DSGA_URL, params=params, timeout=40).json().get("features", [])
    rows = []
    for f in feats:
        a = f["attributes"]
        rows.append({"area": a.get("NAME"), "growing_area": a.get("GROWING_AR"), "name": a.get("AREA_DESC"), "classification": a.get("CLASS"),
                     "condition": a.get("CONDITION"), "since": datetime.fromtimestamp(a["BEGIN_DATE"] / 1000, timezone.utc).date().isoformat() if a.get("BEGIN_DATE") else None,
                     "acres": round(a.get("ACRES") or 0, 1)})
    order = {"BB36.11": 0, "BB36.8": 1, "BB36.0": 2}
    rows.sort(key=lambda r: (order.get(r["area"], 9), r["area"] or ""))
    return rows

def _codes_in(title):
    """Growing-area codes named in a DMF notice title, expanding ranges such as BB33-BB36 or BB1 - BB58."""
    codes = set()
    for m in re.finditer(r"\b([A-Z]{1,4})(\d{1,2})(?:\s*[-–]\s*(?:([A-Z]{1,4}))?(\d{1,2}))?", title):
        pre, a, pre2, b = m.group(1), int(m.group(2)), m.group(3), m.group(4)
        if b and (pre2 in (None, pre)):
            for n in range(min(a, int(b)), max(a, int(b)) + 1):
                codes.add(f"{pre}{n}")
        else:
            codes.add(f"{pre}{a}")
    return codes

def _dmf_notices():
    r = supabase.client.get(_DMF_NOTICES_URL, headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
                                               "Accept": "text/html,application/xhtml+xml"}, timeout=40)
    r.raise_for_status()
    html = r.text
    out = []
    for m in re.finditer(r'<a[^>]+href="([^"]+)"[^>]*>\s*(\d{1,2}/\d{1,2}/\d{2,4})\s*:?\s*([^<]{10,220})</a>', html):
        href, when, title = m.group(1), m.group(2), re.sub(r"\s+", " ", m.group(3)).strip()
        try:
            mm, dd, yy = [int(x) for x in when.split("/")]
            d = date(yy + 2000 if yy < 100 else yy, mm, dd)
        except ValueError:
            continue
        low = title.lower()
        codes = _codes_in(title)
        relevant = "BB36" in codes or "wareham" in low or "statewide" in low or ("all shellfish" in low and "statewide" in low)
        out.append({"date": d.isoformat(), "title": title, "url": href if href.startswith("http") else "https://www.mass.gov" + href,
                    "relevant": relevant, "kind": "opening" if re.search(r"open|rescind", low) else ("closure" if "clos" in low else "notice")})
    out.sort(key=lambda r: r["date"], reverse=True)
    return out

@router.get("/api/beach-status")
def beach_status(req: Request):
    """Official swimming and shellfish information for Hamilton Beach, cached one hour. Each part fails independently."""
    require(req)
    c = _beach_status_cache.get("data")
    if c and time.time() - c["cached_at"] < 3600:
        return c["data"]
    out = {"retrieved_at": datetime.now(timezone.utc).isoformat(), "beach": None, "beach_error": "", "classification": [], "classification_error": "",
           "notices": [], "notices_error": "",
           "sources": {"dph": "https://www.mass.gov/info-details/interactive-beach-water-quality-dashboard",
                       "dsga": "https://www.mass.gov/info-details/massgis-data-designated-shellfish-growing-areas",
                       "notices": _DMF_NOTICES_URL, "wareham": "https://www.wareham.gov/261/Shellfish-Map-and-Information"}}
    try:
        out["beach"] = _dph_beach()
        if out["beach"] is None:
            out["beach_error"] = "DPH dashboard access token not issued."
    except Exception as e:  # network, token or format changes
        out["beach_error"] = "DPH dashboard not reached: " + type(e).__name__
    try:
        out["classification"] = _dmf_classification()
    except Exception as e:
        out["classification_error"] = "DMF classification service not reached: " + type(e).__name__
    try:
        out["notices"] = _dmf_notices()[:40]
    except Exception as e:
        out["notices_error"] = "DMF notice list not readable from this server (mass.gov blocks automated readers): " + type(e).__name__
    if not out["notices"] and not out["notices_error"]:
        out["notices_error"] = "DMF notice list returned no entries to this server; open the official list."
    if out["beach"] or out["classification"] or out["notices"]:
        _beach_status_cache["data"] = {"cached_at": time.time(), "data": out}
    return out

@router.get("/api/tides")
def tide_predictions():
    from zoneinfo import ZoneInfo
    today=datetime.now(ZoneInfo("America/New_York")).date()
    cached=_tide_cache.get(str(today))
    if cached and time.time()-cached["cached_at"]<21600:
        return cached["data"]
    params={"product":"predictions","application":"HBACommunity","begin_date":today.strftime("%Y%m%d"),
            "end_date":(today+timedelta(days=6)).strftime("%Y%m%d"),"datum":"MLLW","station":"8447368",
            "time_zone":"lst_ldt","units":"english","interval":"hilo","format":"json"}
    try:
        r=supabase.client.get("https://api.tidesandcurrents.noaa.gov/api/prod/datagetter",params=params)
        r.raise_for_status()
        rows=r.json()["predictions"]
        if not rows:raise ValueError("Empty predictions")
    except (httpx.HTTPError,ValueError,KeyError):
        raise HTTPException(503,"NOAA predictions are unavailable. Use the official Great Hill tide page.")
    data={"station":"8447368","name":"Great Hill","time_zone":"America/New_York","datum":"MLLW","units":"feet",
          "predictions":rows,"retrieved_at":datetime.now(timezone.utc).isoformat(),
          "source":"https://tidesandcurrents.noaa.gov/noaatidepredictions.html?id=8447368"}
    _tide_cache.clear()
    _tide_cache[str(today)]={"cached_at":time.time(),"data":data}
    return data

_summer_tide_cache={}
@router.get("/api/summer/tides")
def summer_tides(req: Request, year: int):
    """High/low predictions for July and August of one year (Great Hill), used to pick the Kids' Fishing Derby
    Saturday: the board wants 11 AM to fall about half way through an outgoing tide."""
    require(req)
    if year<2000 or year>2100:
        raise HTTPException(400,"Choose a year between 2000 and 2100.")
    cached=_summer_tide_cache.get(year)
    if cached and time.time()-cached["cached_at"]<7*86400:
        return cached["data"]
    params={"product":"predictions","application":"HBACommunity","begin_date":f"{year}0701","end_date":f"{year}0831","datum":"MLLW","station":"8447368",
            "time_zone":"lst_ldt","units":"english","interval":"hilo","format":"json"}
    try:
        r=supabase.client.get("https://api.tidesandcurrents.noaa.gov/api/prod/datagetter",params=params)
        r.raise_for_status()
        rows=r.json()["predictions"]
        if not rows:raise ValueError("Empty predictions")
    except (httpx.HTTPError,ValueError,KeyError):
        raise HTTPException(503,"NOAA predictions are unavailable right now. Try again later or use the official Great Hill tide page.")
    saturdays=[]
    by_day={}
    for p in rows:
        by_day.setdefault(p["t"][:10],[]).append(p)
    for day,items in by_day.items():
        d=datetime.strptime(day,"%Y-%m-%d").date()
        if d.weekday()!=5: continue
        tides=[{"type":p["type"],"time":p["t"][11:16],"height":round(float(p["v"]),1)} for p in items]
        # Find a morning high followed by a low: the midpoint is "mid tide going out".
        best=None
        for i in range(len(tides)-1):
            if tides[i]["type"]=="H" and tides[i+1]["type"]=="L":
                h=datetime.strptime(tides[i]["time"],"%H:%M"); l=datetime.strptime(tides[i+1]["time"],"%H:%M")
                mid=h+(l-h)/2
                diff=abs((mid-datetime.strptime("11:00","%H:%M")).total_seconds())/60
                if best is None or diff<best["minutes_from_eleven"]:
                    best={"high":tides[i]["time"],"low":tides[i+1]["time"],"mid_ebb":mid.strftime("%H:%M"),"minutes_from_eleven":round(diff)}
        saturdays.append({"date":day,"tides":tides,"ebb":best})
    data={"station":"8447368","name":"Great Hill","year":year,"saturdays":saturdays,"retrieved_at":datetime.now(timezone.utc).isoformat(),
          "source":"https://tidesandcurrents.noaa.gov/noaatidepredictions.html?id=8447368"}
    _summer_tide_cache[year]={"cached_at":time.time(),"data":data}
    return data
