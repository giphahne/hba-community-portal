"""Deterministic reconciliation helpers; never initiates a financial transaction."""
from datetime import date
from decimal import Decimal
import re

def cents(value):
    return Decimal(str(value)).quantize(Decimal("0.01"))

def analyze(register, transactions, matches, as_of, account_id, statement=None, books=None):
    """Scope to account/end date; uncertain/missing data never becomes a clean audit."""
    end = date.fromisoformat(as_of)
    rows = [r for r in register if r.get("bank_account_id") == account_id
            and r["transaction_date"] <= as_of and not r["voided"]]
    bank = [b for b in transactions if b["account_id"] == account_id and b["posted_date"] <= as_of]
    bank_ids = {b["id"] for b in bank}
    # A match after the statement date cannot clear an earlier-period check.
    matched = {m["register_id"] for m in matches if m["transaction_id"] in bank_ids}
    matched_bank = {m["transaction_id"] for m in matches}
    outstanding = []
    candidates = []
    def reference(x):
        # Only normalized nonempty exact references; no guessed payee matching.
        return re.sub(r"[\s#-]+", "", x or "").lower()
    for r in rows:
        if r["id"] in matched:
            continue
        days = (end-date.fromisoformat(r["transaction_date"])).days
        outstanding.append({**r, "age_days": days,
                            "age_band": "90+ days" if days>90 else "61–90 days" if days>60 else "31–60 days" if days>30 else "0–30 days",
                            "evidence_status": "Manually marked cleared, no matched bank evidence" if r["cleared"] else "No matched bank evidence"})
        signed = cents(r["amount"])*(1 if r["direction"]=="income" else -1)
        refs = [b for b in bank if b["id"] not in matched_bank
                and cents(b["amount"]) == signed
                and b["posted_date"] >= r["transaction_date"]
                and reference(r["reference"]) and reference(r["reference"]) == reference(b["reference"])]
        for b in refs:
            candidates.append({"register_id": r["id"], "transaction_id": b["id"],
                               "reason": "Same signed amount, account and normalized reference",
                               "ambiguous": len(refs)>1})
    counts = {}
    for c in candidates:
        counts[c["transaction_id"]] = counts.get(c["transaction_id"],0)+1
    for c in candidates:
        c["ambiguous"] = c["ambiguous"] or counts[c["transaction_id"]]>1
    outgoing = sum((cents(r["amount"]) for r in outstanding if r["direction"]=="expense"), Decimal(0))
    incoming = sum((cents(r["amount"]) for r in outstanding if r["direction"]=="income"), Decimal(0))
    adjusted = cents(statement)+incoming-outgoing if statement is not None else None
    difference = adjusted-cents(books) if adjusted is not None and books is not None else None
    return {"as_of": as_of, "outstanding": outstanding, "candidates": candidates,
            "unmatched_bank": [b for b in bank if b["id"] not in matched_bank],
            "unassigned_register_count": sum(not r.get("bank_account_id") and not r["voided"]
                                             and r["transaction_date"]<=as_of for r in register),
            "outstanding_payments": str(outgoing), "deposits_in_transit": str(incoming),
            "adjusted_bank": str(adjusted) if adjusted is not None else None,
            "difference": str(difference) if difference is not None else None,
            "status": "Review required; not an independent audit or bank confirmation"}
