import sys, pathlib; sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "server"))
from bank_reconciliation import analyze
base={"id":"r1","bank_account_id":"a","transaction_date":"2026-01-01","direction":"expense",
      "amount":"100.00","reference":"123","voided":False,"cleared":False}
late={"id":"t1","account_id":"a","posted_date":"2026-10-01","amount":"-100.00","reference":"123"}
match={"register_id":"r1","transaction_id":"t1"}
a=analyze([base],[late],[match],"2026-09-30","a","500","400")
assert a["outstanding_payments"]=="100.00" and a["difference"]=="0.00"
assert a["outstanding"][0]["age_band"]=="90+ days"
a=analyze([base],[late],[match],"2026-10-02","a")
assert a["outstanding_payments"]=="0" and a["difference"] is None
bank={**late,"posted_date":"2026-09-01"}
a=analyze([base],[bank,{**bank,"id":"t2"}],[],"2026-09-30","a")
assert all(c["ambiguous"] for c in a["candidates"])
a=analyze([{**base,"reference":""}],[bank],[],"2026-09-30","a")
assert not a["candidates"]
a=analyze([{**base,"bank_account_id":None},{**base,"id":"r2","bank_account_id":"b"}],[bank],[],"2026-09-30","a")
assert not a["outstanding"] and a["unassigned_register_count"]==1
a=analyze([{**base,"voided":True}],[bank],[],"2026-09-30","a")
assert not a["outstanding"]
print("Six reconciliation scenarios passed: cutoff, aging, ambiguity, no amount-only inference, account scope and voids.")
