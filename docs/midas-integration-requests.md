# Trade Show → Midas: what we need to be fully integrated

From the Trade Show app team. Context: Trade Show sandbox (CT 2600) runs
`EXPENSE_BACKEND=midas` + `MIDAS_MODE=live` against Midas at
`192.168.1.210:4000/api/v1` as app connection `trade_show`. Midas is our system of
record for expenses, categories, payment methods, and companies. We hold no local
copies of any of those lists any more.

Ordered by what blocks us. Items marked **Confirm** need an answer, not code.

---

## A. Blocking production cutover

### A1. A production app connection + API key

Today there is one connection, `trade_show`, and our sandbox uses it.
`GET /ext/health/vocabulary` reports `appName: trade_show`, `scoped: true`,
15 of 26 active categories visible.

We need to know:
- Should production Trade Show use a **separate** connection (e.g. `trade_show_prod`)
  or reuse `trade_show`?
- If separate: please create it and share the key, and tell us what category
  vocabulary scoping it gets. We assume the same 15, but confirm.
- Are `category_mappings` rows scoped per `sourceApp`? If so a new connection may need
  its own mappings seeded.

### A2. Environment isolation — decision needed

There is one Midas instance (CT 3120 `midas-app-prod`). Our sandbox is pointed at it
in live mode, so **every UAT expense we create lands in the same dataset production
will use.** We have already written into it (see A3).

We need one of:
1. A second Midas instance/database for non-production consumers, or
2. An agreed way to mark and later purge test data (e.g. we tag `sourceRefId` with a
   known prefix, you purge on request), or
3. Explicit acceptance that sandbox and production share one dataset.

We are not asking you to pick — we need to know which, because it determines whether
we can run write-path UAT at all before launch.

### A3. Cutover plan for existing Trade Show expenses

Our migration (`POST /ext/expenses/import`) keys on `sourceRefId` = the Trade Show
`expenses.id`. On 2026-08-03 we imported **375 expenses** from the sandbox database;
a re-run now reports `skipped: 375, imported: 0`, i.e. those `sourceRefId`s are
already claimed.

The sandbox database is (we believe) a copy of production, so **production's expense
IDs are the same UUIDs**. A production migration would therefore skip them and Midas
would keep the sandbox-era version of each row, including any UAT edits.

We need agreement on:
- Whether to **purge all `sourceApp = trade_show` expenses** and re-import cleanly at
  cutover, and who runs that.
- Whether import is safe to re-run against a purged set (we believe yes — it is
  idempotent on `sourceRefId`).
- A rough freeze window.

---

## B. Needed for feature parity

### B1. An aggregates endpoint — `GET /ext/expenses/summary`

`GET /ext/expenses` gives cursor paging at 200/request with no totals, counts, or
grouping. Two Trade Show features previously did this in SQL and now page the entire
set and fold it in memory. That is fine at 376 expenses (2 requests) and gets worse
linearly.

The groupings we actually need:

| Consumer | Grouping | Measures |
| --- | --- | --- |
| Dev dashboard summary | none (all) | count, `SUM(amount)`, count where `zohoExpenseId IS NOT NULL` |
| Dev dashboard summary | by `status` | count |
| Dev dashboard trends | by `DATE(createdAt)`, since a date | count, `SUM(amount)` |
| Dev dashboard categories | by `category`, since a date | count, `SUM(amount)` |
| Show summaries report | by `eventId` × `company` × `category`, excluding `rejected` | `SUM(amount)` |
| Quick actions | by `status`; plus count with no receipt; plus count where reimbursement is pending/approved | count |

A single endpoint taking `groupBy[]` + the existing filters (`sourceApp`, `status`,
`dateFrom`, `dateTo`, `eventIds`, `externalUserId`) and returning grouped rows with
`count` and `sumAmount` would cover all of it. We do not need it before launch, but
we would like it before expense volume grows past a few thousand.

### B2. Duplicate detection on Ext create/update

`apps/api/src/lib/duplicates.ts` exports `isLikelyDuplicate`, but it is not wired into
the `/ext/expenses` create path.

Trade Show used to run its own duplicate check against its local database. Now that
Midas owns expenses, that check is inactive — and reimplementing it in Trade Show
would mean fetching candidate expenses from Midas on every submission, which is both
slow and a duplicate of logic you already have.

Request: run your duplicate check on `POST /ext/expenses` (and ideally
`PATCH /ext/expenses/:id`) and return the result in the response, e.g.

```json
{
  "expense": { ... },
  "created": true,
  "warnings": [
    { "code": "POSSIBLE_DUPLICATE",
      "matches": [{ "id": "...", "merchant": "...", "amount": 42.00, "date": "2026-08-01" }] }
  ]
}
```

Non-blocking (we do not want the create rejected) — we just want to surface it to the
submitter. If you would rather own the whole flow and show it only in Midas, say so
and we will drop the feature on our side rather than half-build it.

---

## C. Would unblock later work

### C1. `updatedSince` filter on `GET /ext/expenses`

Nothing depends on this today — we deleted our unused delta-sync route. Any future
incremental sync or local read model would need it.

### C2. A webhook or change feed for expense updates

When an accountant changes an expense in Midas, Trade Show shows the old value until
something refetches. There is no notification mechanism today. Even a simple
"expense changed" webhook per `sourceApp` would let us invalidate rather than poll.

### C3. Deprecation timeline for `defaultZohoEntity`

`GET /ext/payment-methods` returns both `defaultCompany` and the deprecated
`defaultZohoEntity`. We read it through a single helper, so dropping the alias is a
one-line change on our side — we just need notice before it disappears.

---

## D. Confirmations (no code expected)

1. **Category vocabulary ownership.** We have deleted every hardcoded category list
   from Trade Show and send whatever the user picked, letting you resolve it (exact
   name → `category_mappings` → `Other` with a warning). Confirm that is what you
   want, and tell us the process for adding or retiring a category for `trade_show`.

2. **`Summitt Labs` / `zohoEnabled: false`.** We offer it for assignment because two
   active cards default to it. Confirm expenses assigned to a non-Zoho company are
   retained normally and simply never pushed — no error, no retry loop.

3. **Zoho ownership.** Confirm Midas owns *all* Zoho Books posting for
   `sourceApp = trade_show`, including retries and failure handling, and tell us where
   a user sees a failed push. Trade Show returns `409 MIDAS_OWNED` for any local
   review or push attempt.

4. **User provisioning.** `resolveExtUser` appears to auto-provision from
   `submitterEmail`. Confirm that is intended for Trade Show users, and whether we
   should switch to sending `submitterUsername` as the identity key instead of email.

5. **Request volume.** We see rate limiting only on `/api/v1/auth/login`, not on
   `/ext`. Confirm there is no Ext limit, and tell us an acceptable request rate —
   our aggregate consumers currently page at 200 records per request.

6. **Status vocabulary stability.** We map Trade Show `needs further review` ↔ Midas
   `awaiting_info`, and treat `zoho_sync_failed` as approved. Confirm those values are
   stable, and tell us before any are added or renamed.

7. **Receipt content endpoint.** Trade Show proxies receipt bytes through
   `GET /ext/expenses/:id/receipts/:receiptId/content`. Confirm that endpoint and its
   auth model are stable.

---

## For reference: what we already handle

So you do not build these for us:

- Categories, payment methods, and companies all come from your picklists. No local
  copies remain in Trade Show.
- We prefer `defaultCompany` over `defaultZohoEntity` behind one helper.
- We cache picklists for 60s server-side and in IndexedDB client-side, and block
  expense submission entirely rather than fall back to a guessed list.
- `Sameer Summitt Card OLD` (...3019) being deactivated flowed through correctly.
- We send `paymentMethodId` resolved from your catalog, not just a card string.
