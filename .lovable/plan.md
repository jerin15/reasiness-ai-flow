## Goal
Track tasks done by Melvin (freelancer, Operations role) with a per-task billable amount and a paid/pending status. Admins get full CRUD; Melvin can view his own ledger. No changes to existing workflows or loops.

## Scope rule
A task counts toward the ledger only when an admin marks it `is_billable = true`. Default off, so existing tasks/flows are untouched.

## What gets built

### 1. Database (new migration)
Add three nullable columns to `public.tasks` (zero impact when unused):
- `is_billable boolean default false`
- `billable_amount numeric(10,2)` — admin-entered fee for that task
- `billable_currency text default 'AED'`

New table `public.freelancer_payments` to record payouts (one row per payment, can cover one or many tasks):
- `freelancer_id uuid` (profile id)
- `task_ids uuid[]` (which tasks this payment settles)
- `amount numeric(10,2)`, `currency text`
- `paid_at timestamptz`, `method text`, `reference text`, `notes text`
- `created_by uuid`, standard timestamps

RLS:
- Admins: full CRUD on the new columns + table.
- Freelancer (Melvin): SELECT only on his own rows / his own tasks' billing fields.
- Includes proper GRANTs per project convention.

Derived view (read-only) `freelancer_ledger_v` returning per freelancer:
- total billable, total paid, pending balance, task counts.

### 2. UI — new tab inside the team member profile
Add a **"Freelancer Billing"** tab visible only when the member is flagged as freelancer (start with Melvin; extensible). Components:

- **Summary cards:** Total Billable · Total Paid · Pending Balance · Tasks Pending Payment.
- **Billable Tasks table:** every task with `is_billable = true` assigned to Melvin — title, status, completed date, amount, payment status (Paid / Pending), linked payment ref. Admin can edit amount inline or unflag.
- **Payments table:** list of `freelancer_payments` rows with date, amount, method, tasks covered, notes. Admin actions: Add Payment, Edit, Delete (soft).
- **"Add Payment" dialog:** pick one or many pending tasks, enter amount/method/reference/notes → creates payment row and marks those tasks as covered.

### 3. Marking a task billable
In the existing task detail/edit dialog, add an admin-only "Freelancer billable" toggle + amount field. No change to task workflow, status logic, or assignments. The toggle is a pure metadata field.

### 4. Melvin's view
Same tab appears on his own profile in read-only mode: he sees his billable tasks, amounts, what's paid and what's pending. He cannot edit.

## What is NOT changed
- No changes to Operations pipeline, task statuses, kanban, notifications, sync triggers, or any existing flow.
- No deletion of tasks. Soft-delete preserved.
- No effect on tasks where `is_billable` stays false (the default).

## Technical notes
- Migration adds columns + table + RLS + GRANTs in one file.
- New components live in `src/components/freelancer/` (FreelancerBillingTab, AddPaymentDialog, BillableTasksTable, PaymentsTable).
- Profile page mounts the tab conditionally on a `is_freelancer` flag (added to `profiles`, default false; set true for Melvin via data update).
- All currency display defaults to AED to match existing app.
