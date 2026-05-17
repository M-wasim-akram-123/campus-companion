# College ERP – MVP Build Plan

Building on **React + TanStack Start + Lovable Cloud** (Postgres + Auth + Storage + Server Functions). Same features as your Angular spec — just on a stack that runs here.

Since this is a very large system, I'll ship it in **3 phases**. Each phase ends with a working, usable app you can test.

---

## Phase 1 – Foundation (this turn)

**Auth & Roles**
- Email/password + Google login
- 6 roles: `super_admin`, `admission_officer`, `finance_officer`, `receptionist`, `teacher`, `student`
- Roles stored in a separate `user_roles` table (security best practice)
- Role-based route guards + permission helper (`hasRole`)
- Profiles table auto-created on signup

**Inquiry Management**
- Inquiry form (name, phone, email, program, notes, photo upload)
- Status workflow: New → Follow-up → Interested → Converted / Lost
- List + filter + search
- Convert inquiry → admission

**Admission Management**
- Student admission form (linked from inquiry or standalone)
- Program (Intermediate / BS), session, class, section assignment
- Generates a student record with roll number

**Student Profile**
- View / edit student details, picture, guardian info
- List view with filters (program, class, section, status)

**Dashboard shell**
- Sidebar navigation, role-aware menu, top bar, light/dark, responsive

---

## Phase 2 – Fees & Vouchers (next turn)

- Fee structures per program/class
- Fee assignment to students
- Voucher generation (monthly / on-demand) with PDF download
- Voucher status: Generated → Sent → Paid → Cancelled

## Phase 3 – Payments & Finance (turn after)

- Manual payment entry + scanned voucher upload
- Payment statuses: Paid / Partial / Pending / Overdue
- Finance dashboard: monthly revenue, est. yearly revenue, outstanding dues
- Activity log table for audit trail
- Revenue reports (export CSV)

---

## Technical mapping vs your original spec

| You asked for | We're using (equivalent) |
|---|---|
| Angular frontend | React + TanStack Start (SSR-capable, same SPA feel) |
| Node.js + Express backend | TanStack server functions (`createServerFn`) — same Node-style server logic |
| PostgreSQL | Postgres (via Lovable Cloud) — same DB |
| Prisma ORM | Supabase JS client + SQL migrations — same type-safe queries |
| JWT auth | Cloud Auth issues JWTs under the hood |
| REST APIs | Server functions + `/api/*` server routes (REST when needed) |
| Activity logging | `activity_logs` table written from server functions |

Functionally identical. Only the framework names differ.

---

## What I'll create this turn

1. SQL migration: `profiles`, `app_role` enum, `user_roles`, `has_role()` security-definer function, `inquiries`, `students`, `programs`, `classes`, `sections`, RLS policies, signup trigger
2. Auth pages: `/login`, `/signup`
3. Dashboard layout under `/_authenticated/*` with sidebar + role guard
4. Pages: `/dashboard`, `/inquiries` (list + new + detail), `/admissions/new`, `/students` (list + detail)
5. Storage bucket for student photos
6. Seed: create first super-admin (you'll log in, then I show you how to promote yourself)

Ready to start building Phase 1?
