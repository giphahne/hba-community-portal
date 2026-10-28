"""Calls to Supabase Auth, PostgREST and Storage, always with the caller's own token."""

import re
from contextvars import ContextVar

import httpx
from fastapi import HTTPException

from hba.config import KEY, URL

client = httpx.Client(timeout=35)
resident_view=ContextVar("hba_resident_view",default=False)

# Postgres constraint errors (unique 23505, check 23514, foreign key 23503, not null 23502) arrive as raw text such as
# 'new row for relation "hba_events" violates check constraint ...'. Readers see a plain sentence instead. Messages the
# database functions raise themselves (RAISE EXCEPTION, code P0001) and every other error pass through unchanged.
# Names below come from supabase/schema.sql; constraints not listed fall back to the column or code wording.
CONSTRAINT_MESSAGES = {
    # UNIQUE constraints and unique indexes
    "hba_ballots_vote_id_unit_key_key": "A ballot has already been recorded for this property.",
    "hba_ballots_receipt_code_key": "The ballot receipt could not be created. Try again.",
    "hba_bank_matches_register_id_key": "That register entry is already matched to a bank transaction.",
    "hba_bank_matches_transaction_id_key": "That bank transaction is already matched to a register entry.",
    "hba_bank_transactions_account_id_fingerprint_key": "That bank transaction has already been imported.",
    "hba_document_suggestions_document_id_item_key_key": "That suggestion has already been saved.",
    "hba_dues_receipts_register_id_household_uid_dues_year_key": "This payment is already credited to that household for that year.",
    "hba_member_households_pkey": "That property is already linked to this account.",
    "hba_officeholders_position_key": "Someone already holds that position. Remove them first.",
    "hba_one_officeholder_per_property": "Someone from that property already holds an office.",
    "hba_one_selected_bid": "Another bid is already selected for this request.",
    "hba_one_annual_supper": "That yearly event is already on the calendar for this year.",
    "hba_payer_households_bank_account_id_fingerprint_key": "This payer is already linked to a household.",
    "hba_push_subscriptions_endpoint_key": "Notifications are already turned on for this device.",
    "hba_volunteer_signups_task_id_member_id_key": "You are already signed up for this task.",
    "hba_vote_proxies_vote_id_household_uid_key": "A proxy has already been recorded for this household in this vote.",
    "hba_vote_roll_vote_id_unit_key_key": "This property is already on the voting list for this vote.",
    # CHECK constraints with a rule that the column name alone does not explain
    "rain_date_requires_later_date": "The rain date must be after the event date.",
    "rain_switch_requires_date": "Enter a rain date before moving the event to it.",
    "report_not_future": "The payment date cannot be in the future.",
    "venmo_verified_recipient": "To turn on Venmo, enter the account name and a Venmo handle (letters, numbers, - or _).",
    "advisory_official_source": "The source link must be an official mass.gov or wareham.ma.us page.",
    "hba_bank_imports_check": "The statement end date must be on or after its start date.",
    "hba_photos_one_parent": "A photo must belong to exactly one item.",
    "hba_bank_transactions_amount_check": "The amount cannot be zero.",
    "hba_check_register_amount_check": "Enter an amount greater than zero.",
    "hba_bids_amount_check": "Enter a bid amount greater than zero.",
    "hba_volunteer_tasks_capacity_check": "The number of volunteers needed must be between 1 and 500.",
}
# Column names whose CHECK is a fixed list of choices rather than a length or range.
CHOICE_COLUMNS = {"state", "status", "category", "kind", "audience", "action", "basis", "direction", "source", "role",
                  "decision_type", "recorded_outcome", "tax_basis", "issue_precision", "payment_kind", "payment_method",
                  "fund", "currency", "majority_rule", "outcome", "confidence"}
FIELD_NAMES = {"body": "message", "series_title": "event series name", "last_four": "last four digits",
               "sort_order": "order number", "display_name": "name", "where_text": "location"}
CODE_MESSAGES = {
    "23505": "This has already been saved, so it was not added again. Refresh the page to see it.",
    "23514": "Something in the form is not allowed. Check your entries and try again.",
    "23503": "Something this refers to is no longer there. Refresh the page and try again.",
    "23502": "A required entry is missing. Fill in every required field and try again.",
}

def _field(column):
    return FIELD_NAMES.get(column, column.replace("_", " "))

def plain_db_error(d):
    """A reader-facing sentence for a PostgREST constraint error, or None to keep the original message."""
    code, msg = str(d.get("code") or ""), str(d.get("message") or "")
    if code not in CODE_MESSAGES:
        return None
    name = re.search(r'constraint "([^"]+)"', msg)
    name = name.group(1) if name else ""
    if name in CONSTRAINT_MESSAGES:
        return CONSTRAINT_MESSAGES[name]
    table = re.search(r'(?:relation|table) "([^"]+)"', msg)
    column = name[len(table.group(1)) + 1:-len("_check")] if code == "23514" and table and name.startswith(table.group(1) + "_") and name.endswith("_check") else ""
    if column and column in CHOICE_COLUMNS:
        return f"That {_field(column)} is not one of the allowed choices. Refresh the page and try again."
    if column and column != "id":
        return f"Check the {_field(column)}. It may be empty, too long, or outside the allowed range."
    if code == "23505" and re.search(r"_(file_path|original_path|photo_path)_key$", name):
        return "A file with that name is already stored. Rename the file and try again."
    if code == "23503" and "still referenced" in str(d.get("details") or ""):
        return "This cannot be removed because other records still use it."
    if code == "23502":
        column = re.search(r'column "([^"]+)"', msg)
        if column:
            return f"The {_field(column.group(1))} is required. Fill it in and try again."
    return CODE_MESSAGES[code]

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
        raise HTTPException(400 if r.status_code < 500 else 503, (plain_db_error(d) if isinstance(d, dict) else None) or str(msg)[:280])
    return r

def rest(table, token, method="GET", data=None, query="", representation=False):
    r = sb(method, "/rest/v1/" + table + ("?" + query if query else ""), token,
           json=data, headers={"Prefer": "return=representation" if representation else "return=minimal"})
    return r.json() if r.content else None
