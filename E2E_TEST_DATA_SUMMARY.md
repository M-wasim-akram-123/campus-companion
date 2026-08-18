# E2E_TEST_DATA_SUMMARY.md

## Inter (target)

| Program | Sections | Students target |
| --- | ---: | ---: |
| FSc Pre-Medical | 2 | 20 |
| FSc Pre-Engineering | 2 | 20 |
| ICOM | 2 | 20 |
| ICS | 2 | 20 |
| FA-IT | 2 | 20 |

**Actual Inter E2E students:** 100

## BS (target)

| Program | Semesters | Students/Semester | Total target |
| --- | ---: | ---: | ---: |
| BS IT | 2 | 20 | 40 |
| BS CS | 2 | 20 | 40 |
| BS SE | 2 | 20 | 40 |
| BS AI | 2 | 20 | 40 |
| BBA | 2 | 20 | 40 |

**Actual BS E2E students:** 200

## Staff logins

All under `*@test.local` with password `1234` — see script STAFF list (admission, finance inter/bs, teachers, etc.)

## Password note

Application Settings → Users API rejects passwords shorter than 8 characters. Supabase Auth rejects updates shorter than 6. E2E users were created via **Auth Admin API** with password `1234`.
