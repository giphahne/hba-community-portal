"""Every name the backend uses must be defined or imported. Splitting the old single-file API into hba/routers left
several modules calling uid(), datetime and timezone without importing them, so 18 update routes failed only when used."""
from pathlib import Path

import pytest

pyflakes_api = pytest.importorskip("pyflakes.api", reason="pip install pyflakes")
from pyflakes import messages  # noqa: E402
from pyflakes.reporter import Reporter  # noqa: E402

SERVER = Path(__file__).resolve().parents[2] / "server"


class Collect(Reporter):
    def __init__(self):
        self.found = []

    def flake(self, message):
        if isinstance(message, (messages.UndefinedName, messages.UndefinedLocal, messages.UndefinedExport)):
            self.found.append(f"{Path(message.filename).relative_to(SERVER)}:{message.lineno} {message.message % message.message_args}")

    def unexpectedError(self, filename, msg):
        self.found.append(f"{filename}: {msg}")

    def syntaxError(self, filename, msg, lineno, offset, text):
        self.found.append(f"{filename}:{lineno} {msg}")


def test_no_undefined_names_in_backend():
    r = Collect()
    for f in sorted(SERVER.rglob("*.py")):
        if "private-app" in f.parts or "__pycache__" in f.parts:
            continue
        pyflakes_api.check(f.read_text(encoding="utf-8"), str(f), r)
    assert not r.found, "\n".join(r.found)
