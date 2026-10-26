"""Calls to Supabase Auth, PostgREST and Storage, always with the caller's own token."""

from contextvars import ContextVar

import httpx
from fastapi import HTTPException

from hba.config import KEY, URL

client = httpx.Client(timeout=35)
resident_view=ContextVar("hba_resident_view",default=False)

def sb(method, path, token=None, **kwargs):
    # Anonymous calls send only the apikey header (Supabase treats that as the anon role); a bearer token is added
    # only for a signed-in user's JWT. Hosted copies receive the key through a credential proxy that rewrites apikey.
    headers = {"apikey": KEY, **({"Authorization": "Bearer " + token} if token and token != KEY else {}), **kwargs.pop("headers", {})}
    if resident_view.get():headers["X-HBA-View"]="resident"
    try:
        r = client.request(method, URL + path, headers=headers, **kwargs)
    except httpx.HTTPError:
        raise HTTPException(503, "The HBA storage service is unavailable. Try again.")
    if r.is_error:
        try:
            d = r.json()
        except ValueError:
            d = {}
        msg = d.get("msg") or d.get("message") or d.get("error_description") or "Storage request failed"
        if "Revision conflict" in msg:
            raise HTTPException(409, "Status changed elsewhere. Refresh and retry.")
        if r.status_code in {401, 403} or "row-level security" in msg:
            raise HTTPException(403, "This account does not have permission for that action.")
        raise HTTPException(400 if r.status_code < 500 else 503, str(msg)[:280])
    return r

def rest(table, token, method="GET", data=None, query="", representation=False):
    r = sb(method, "/rest/v1/" + table + ("?" + query if query else ""), token,
           json=data, headers={"Prefer": "return=representation" if representation else "return=minimal"})
    return r.json() if r.content else None
