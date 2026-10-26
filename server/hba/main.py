"""Assembles the app: routers in their original order, the feature modules, and the public sign-in site last
(its catch-all route must come after every /api/ and /app/ route)."""

import document_intake
import engagement
import voting

from hba.config import ENGAGE, KEY, VALID, homes
from hba.push import notify_admin
from hba.routers import (auth, bids, community, content, finance, governance, inbox, newsletters, payments, research,
                         static, volunteers, weather)
from hba.routers.finance import finance_editor
from hba.sessions import board, rate, require, uid
from hba.supabase import rest, sb
from hba.web import app

app.include_router(static.app_router)
for area in (auth, community, inbox, newsletters, volunteers, finance, research, governance, payments, weather, bids,
             content):
    app.include_router(area.router)
document_intake.register(app, {"rest": rest, "sb": sb, "board": board, "finance_editor": finance_editor,
                               "uid": uid, "rate": rate, "VALID": VALID})
voting.setup(app, rest=rest, sb=sb, require=require, board=board, homes=homes, rate=rate, anon_key=KEY)
ENGAGE.update(engagement.setup(app, rest=rest, require=require, board=board, notify_admin=notify_admin, uid=uid))
app.include_router(static.router)
