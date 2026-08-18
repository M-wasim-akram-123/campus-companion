# E2E_FAILURES.md

## ROLE-FIN-01 — Inter finance paying BS student (scope check)

- Module: Roles
- Expected: Permission/scope deny (not validation error)
- Actual: ALLOWED
- Status: FAIL
- Severity: High
- Notes: WARNING: payment allowed — finance scope may be UI-only
- Steps: Login as e2e.fin.inter@test.local → RPC record_fee_payment on BS student installment
- Root cause: `record_fee_payment` / fee RLS does not enforce Inter vs BS program_type isolation; `finance-scope.ts` is app-layer only
- Recommended fix: Enforce program_type checks inside `record_fee_payment` (and related finance RPCs) so Intermediate finance roles cannot allocate payments to BS students and vice versa
