"""The member app loads each tool on first use (private-app/lazy.js). These checks keep the bundle list, index.html and
the start-up map summary in step with the files they describe."""
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
APP = REPO / "private-app"
INDEX = (APP / "index.html").read_text(encoding="utf-8")


def bundles():
    src = (APP / "lazy.js").read_text(encoding="utf-8")
    block = src[src.index("const BUNDLES={"):src.index("const pending=")]
    out = {}
    for name, body in re.findall(r"'?([\w-]+)'?:\{((?:needs|css|js|opens):[^}]*)\}", block):
        out[name] = {key: re.findall(r"'([^']+)'", value)
                     for key, value in re.findall(r"(needs|css|js|opens):\[([^\]]*)\]", body)}
    return out


def test_bundles_parse():
    found = bundles()
    assert {"parcel-details", "property", "maptools", "budget", "community-tools"} <= set(found)


def test_bundle_files_exist_and_are_not_loaded_up_front():
    eager = set(re.findall(r'<script src="([^"]+)"', INDEX)) | set(re.findall(r'<link rel="stylesheet" href="([^"]+)"', INDEX))
    placeholders = set(re.findall(r'<template data-lazy-css="([^"]+)"></template>', INDEX))
    for name, b in bundles().items():
        for f in b.get("js", []) + b.get("css", []):
            assert (APP / f).is_file(), f"{name}: {f} is missing"
            assert f not in eager, f"{name}: {f} is lazy but index.html still loads it at start-up"
        for f in b.get("css", []):
            assert f in placeholders, f"{name}: {f} needs a <template data-lazy-css> where its <link> used to be"


def test_bundle_dependencies_exist():
    found = bundles()
    for name, b in found.items():
        for dep in b.get("needs", []):
            assert dep in found, f"{name} needs unknown bundle {dep}"


def test_each_open_function_is_defined_by_its_bundle():
    for name, b in bundles().items():
        code = "".join((APP / f).read_text(encoding="utf-8") for f in b.get("js", []))
        for fn in b.get("opens", []):
            assert re.search(r"window\." + fn + r"\s*=", code), f"{name}: no file in the bundle defines window.{fn}"


def test_start_up_files_exist():
    for f in re.findall(r'<script src="([^":]+)"', INDEX) + re.findall(r'<link rel="stylesheet" href="([^":]+)"', INDEX):
        assert (APP / f).is_file(), f


def test_map_summary_matches_the_research_data():
    result = subprocess.run([sys.executable, str(REPO / "tools" / "split-map-data.py"), "--check"])
    assert result.returncode == 0, "private-app/map-summary.js is out of date: run python tools/split-map-data.py"
