"""Site content the administrator edits inside the app, stored as JSON in public hba_settings rows.

Each kind of content has a model that checks every field before it is saved; members read it back through the
settings in /api/community. Add new editable content here: a model, a settings key and a PUT route.
"""

import json
import re
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, ValidationError, model_validator

from hba.sessions import require
from hba.supabase import sb

router = APIRouter()

TIME = r"^([01]\d|2[0-3]):[0-5]\d$"


def save_content(token, member, key, value):
    text = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if len(text) > 100_000:
        raise HTTPException(400, "That is too much text to save at once.")
    sb("POST", "/rest/v1/hba_settings?on_conflict=key", token,
       json={"key": key, "value": text, "updated_by": member["id"]},
       headers={"Prefer": "resolution=merge-duplicates,return=minimal"})
    return value


# ---- Summer events: the usual yearly pattern behind the Summer events sheet ------------------------------
class SummerLegacy(BaseModel):
    """An older name and date for the same event up to a given year (e.g. Kids' Day before Summer Kickoff)."""
    until: int = Field(ge=2000, le=2100)
    title: str = Field(min_length=1, max_length=120)
    when: str = Field(default="", max_length=300)
    details: str = Field(default="", max_length=2000)
    month: int = Field(ge=1, le=12)
    weekday: int = Field(ge=0, le=6)
    ordinal: int = Field(ge=-1, le=5)


class SummerEvent(BaseModel):
    key: str = Field(pattern=r"^[a-z0-9-]{1,40}$")
    title: str = Field(min_length=1, max_length=120)
    rule: Literal["nth", "fixed", "tide", "tbd"]
    month: int | None = Field(default=None, ge=1, le=12)
    weekday: int | None = Field(default=None, ge=0, le=6)
    ordinal: int | None = Field(default=None, ge=-1, le=5)
    day: int | None = Field(default=None, ge=1, le=31)
    rain_offset_days: int | None = Field(default=None, ge=1, le=60)
    time: str | None = Field(default=None, pattern=TIME)
    end: str | None = Field(default=None, pattern=TIME)
    location: str = Field(default="", max_length=200)
    details: str = Field(default="", max_length=2000)
    when_note: str = Field(default="", max_length=300)
    icon: str = Field(default="star", pattern=r"^[a-z]{1,20}$")
    legacy: SummerLegacy | None = None

    @model_validator(mode="after")
    def rule_fields(self):
        if self.rule == "nth" and (self.month is None or self.weekday is None or not self.ordinal):
            raise ValueError(f"{self.title}: choose the week, the day and the month.")
        if self.rule == "fixed" and (self.month is None or self.day is None):
            raise ValueError(f"{self.title}: choose the month and the day.")
        if self.end and not self.time:
            raise ValueError(f"{self.title}: an end time needs a start time.")
        return self


class SummerEvents(BaseModel):
    events: list[SummerEvent] = Field(max_length=40)

    @model_validator(mode="after")
    def unique_keys(self):
        keys = [e.key for e in self.events]
        if len(keys) != len(set(keys)):
            raise ValueError("Two events share the same key.")
        return self


def checked(model, data):
    """Validate, answering with one plain sentence (the editor shows it) instead of FastAPI's error list."""
    try:
        return model.model_validate(data)
    except ValidationError as e:
        err = e.errors()[0]
        where = " → ".join(str(p) for p in err["loc"] if not isinstance(p, int))
        raise HTTPException(400, err["msg"].removeprefix("Value error, ") + (f" ({where})" if where and "Value error" not in err["msg"] else ""))


@router.put("/api/content/summer-events")
def save_summer_events(data: dict, req: Request):
    token, member = require(req, ("admin",))
    body = checked(SummerEvents, data)
    events = [e.model_dump(exclude_none=True) for e in body.events]
    for e in events:  # tidy text the sheet prints
        for field in ("title", "location", "details", "when_note"):
            if field in e:
                e[field] = re.sub(r"\s+", " ", e[field]).strip()
    return {"events": save_content(token, member, "public_summer_rules", events)}
