# Trade Show → Midas: reply to v0.44.1

Thanks — all six landed cleanly. Trade Show sandbox is on **v2.15.0** with your new
contract adopted. Below: the number you asked for (it does not say what the test
assumed), one bug that was ours, and what we changed.

---

## A3 — the import count you asked us to read, and why it misleads

We ran the dry-run. Two separate numbers, and the important one is not the one the
test produces.

**Sandbox dry-run:** `created: 1, skipped: 374, failed: 0` out of 375 local rows.

**Production, measured directly (read-only):**

| | count |
| --- | --- |
| Total expenses | 377 |
| Created since 2026-08-03 | **0** |
| Updated since 2026-08-03 | **3** |

So by the test you proposed — re-run the import, read the imported count — production
would report **`created: 0`**, which reads as "nothing is stale, proceed". It is wrong.
**3 production expenses have changed since the import**, and the importer reports
existing `sourceRefId`s as `skipped` without updating them. Those 3 would stay at their
2026-08-03 values in Midas and nothing in the output would say so.

`created` counts rows Midas has never seen. It cannot detect a row that exists but has
drifted, which is the entire failure mode we are trying to catch.

**So yes, please add upsert mode** — not because the created count is large, but because
the created count is structurally incapable of finding this. If you would rather not,
the alternative is a purge of `sourceApp = trade_show` plus a clean re-import at
cutover, which we are equally happy with — but "re-run and read the count" is not a
safe check on its own.

One more thing that matters for planning: **the three stores disagree.** Production has
377, sandbox has 375, Midas has 376 for `trade_show`. Sandbox is not a faithful copy of
production, so please do not use the sandbox dry-run's `created: 1` to size the real
cutover.

---

## The "undefined" companies were ours — root cause found and fixed

Not a Midas bug and not bad data entry. Our upload helper did:

```js
formData.append(key, String(value));
```

`String(undefined)` is the seven-character string `"undefined"`. Our submit path passes
`zoho_entity: expenseData.zohoEntity || undefined` when no entity is selected, so any
expense submitted **with a receipt** and no company sent the literal text `"undefined"`
as the company name.

It affected every optional field on that path, not only the company — description and
location could have been written the same way. Fixed at the source: undefined and null
are now omitted from the form entirely (`false` and `0` still send). We also reject
`"undefined"`/`"null"`/`"nan"` as company names server-side before the write leaves us,
since your 400 UNKNOWN_COMPANY now turns that into a lost submission rather than a bad
row.

Thank you for catching it and for repairing the rows — we verified the current page of
`trade_show` expenses is clean.

---

## D2 — noted, and the correction matters

Understood that non-Zoho companies were genuinely pushable, that it was 70 rather than
the 13 approved, and that 69 mirrored transaction rows were involved. That is a
materially bigger finding than the confirmation we asked for, and we appreciate you
treating it as a bug rather than answering the narrow question. We will assign to
Summitt Labs freely.

---

## What we changed on our side

- **`submitterUsername` now sent alongside `submitterEmail` on every create.** Never
  username alone.
- **`warnings[]` consumed** from POST and PATCH and carried through our API response as
  `midasWarnings`. Purely additive on our side too — absent warnings change nothing.
- **Our duplicate detection stays deleted** on the Midas path. It remains for
  `EXPENSE_BACKEND=local` only, which production still runs, and goes away entirely at
  cutover. We will not reimplement it.
- **Request rate:** bulk paging now spaces requests 125ms apart (~8/s). The expense list
  path instead uses your max page size of 200 to halve round trips, since throttling
  there would add latency a user feels.
- Confirmed we never send `cancelled` to `/ext` — it is not in our status map.

---

## Two things on us that we are tracking

1. **The `admin` account rename.** Understood that sending both fields converts a silent
   misattribution into a 409 SUBMITTER_AMBIGUOUS, and that this stops the wrong
   attribution without giving that submitter a working identity. That rename is ours to
   do before cutover; it is now the top item on our cutover checklist.

2. **Salesguru / sahil / seri** are handled by the change above — we send both fields
   for every user, not just those three.

---

## Still open from our side

- **`GET /ext/expenses/summary`** — no rush before launch, but it is what lets us stop
  folding aggregates in memory.
- **Change webhook** — you asked when polling actually hurts. Honest answer: not yet.
  Our expense list is a single request per page load at current volume. We will tell you
  when that changes rather than have you build it speculatively.
- **`updatedSince`** — same, nothing depends on it today.

Noted on `defaultZohoEntity` (weeks of notice) and on `cancelled` existing in the
database but not being accepted by `/ext`. Both understood.
