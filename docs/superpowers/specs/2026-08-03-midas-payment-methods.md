# Trade Show ↔ Midas payment methods

**Date:** 2026-08-03  
**Status:** Implemented on Trade Show BFF (`feature/midas-expense-bff`, sandbox CT 2600)  
**Related:** Midas Ext `GET /api/v1/ext/payment-methods` (scope `expenses:read`)

## Ownership

**Midas is the system of record for payment methods** going forward.

| Concern | Owner |
|---|---|
| Card catalog CRUD | Midas UI (`/payment-methods`) |
| Ext list for Trade Show | `GET /ext/payment-methods` |
| Mapping `cardUsed` → `paymentMethodId` on write | Trade Show BFF |
| UI card dropdown labels | Trade Show may still use local `app_settings.cardOptions` (interim) |

### Interim sync

If Trade Show admins still edit `cardOptions`, ops must re-run Midas sync so Ext catalog stays aligned:

```bash
# on Midas API container (CT 3120)
docker exec -w /app/apps/api midas-api-1 npx tsx src/scripts/sync-trade-show-payment-methods.ts
```

Trade Show does **not** write payment methods to Midas.

## Trade Show write behavior

On every Ext create / update / import:

1. Resolve `paymentMethodId` from Ext catalog (60s TTL cache; one force-refresh on miss).
2. Send `paymentMethodId` when matched.
3. Still send human-readable `cardUsed` (stored by Midas in `sourceContext.cardUsed`).
4. On **create**, if `zohoEntity` is blank, fill from payment method `defaultZohoEntity`.

Matching order:

1. Explicit `paymentMethodId` (if client already sent it)
2. Unique `lastFour` from parsed `cardUsed` (e.g. `Haute PNC (...3490)`)
3. `label` + `lastFour` when lastFour is ambiguous
4. Unique exact `label` (case-insensitive) — fails for duplicate labels like three `Nirvana PNC` rows

UI stays string-based (`cardUsed`); **backend maps on every Ext write**. No new Ext scope.

## Catalog snapshot (12 cards synced from TS prod)

| Label | Last 4 | Entity |
|---|---|---|
| Personal (Need reimbursement) | 0000 | — |
| Haute PNC | 3490 | Haute Brands |
| Boomin PNC | 7458 | Boomin Brands |
| Boomin Capital One | 9330 | Boomin Brands |
| Nirvana PNC | 7210 | Nirvana Kulture |
| Sameer Summitt Card OLD | 3019 | Summitt Labs |
| Nirvana PNC | 4171 | Nirvana Kulture |
| Brett Summitt Card | 1039 | Summitt Labs |
| Nirvana ACH | 8689 | Nirvana Kulture |
| Sameer Summitt card | 1096 | Summitt Labs |
| Nirvana PNC | 7466 | Nirvana Kulture |
| Haute Amex | 1002 | Haute Brands |

## Code map

- `backend/src/services/midas/paymentMethodMap.ts` — parse / match / cache
- `MidasClient.listPaymentMethods()` + `MockMidasClient`
- `MidasExpenseStore` create/update
- `migrateExpensesToMidas.ts` import batches

## Optional follow-ups

- BFF `GET /api/expenses/payment-methods` proxy if UI should drop local `cardOptions` SoR
- Ext upsert API (Midas) if TS must keep editing cards without ops re-sync
