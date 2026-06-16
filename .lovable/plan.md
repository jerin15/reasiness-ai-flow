## Goal
Melvin (and any `is_freelancer` profile) should display as **Freelancer** everywhere in the UI, and the admin↔freelancer flow should be dead simple:

1. Admin creates a task for Melvin and enters an **amount** (just for reference).
2. Melvin sees the task, hits **Mark Done** when finished.
3. Admin sees it as **Awaiting Approval**, hits **Approve** (admin can also mark done themselves and approve in one step).
4. Once approved, the amount becomes **Payable**. Admin records the payment → task shows **Paid**.

No new tables. Reuses the existing `tasks` (`is_billable`, `billable_amount`, `status`, `completed_at`) and `freelancer_payments`.

## Changes

### 1. "Freelancer" label everywhere
- `AddTaskDialog.tsx` (line ~622): when `member.is_freelancer === true`, render the role as `Freelancer` instead of `Operations`. Also make sure team-member fetch already returns `is_freelancer` (extend select if missing).
- Any other place that renders a team member's role badge (sidebar dropdown already updated, team report headers, chat list, presence, etc.) — sweep and apply the same rule: freelancer flag wins over `user_roles.role`.
- Admin "Manage Team" list shows `Freelancer` badge for Melvin.

### 2. Simple task lifecycle in `FreelancerOnlyDashboard`
The dashboard already lists Melvin's billable tasks. Add a single status pill per task with three states driven off existing fields:

```
to_do            -> tasks.status != 'completed'
awaiting_approval -> status = 'completed' AND completed_at IS NOT NULL AND admin_remarks != 'approved'
approved         -> status = 'completed' AND admin_remarks contains 'approved' AND not yet paid
paid             -> task id appears in freelancer_payments.task_ids
```

Per row actions:
- **Melvin view** (`isAdmin=false`): if to_do → "Mark Done" button (sets `status='completed'`, `completed_at=now()`). If awaiting_approval/approved/paid → read-only badge.
- **Admin view** (`isAdmin=true`):
  - to_do → "Mark Done" + Edit + Delete
  - awaiting_approval → "Approve" (sets `admin_remarks='approved'` and ensures `status='completed'`) + Edit + Delete
  - approved (unpaid) → "Record Payment" (opens FreelancerBillingDialog scoped to this task) + Edit + Delete
  - paid → read-only "Paid" badge + Edit (no delete on paid tasks)

### 3. Admin's "New Task for Freelancer" is one screen
When admin clicks **+ New Task** from inside Melvin's FreelancerOnlyDashboard, open a slim `FreelancerTaskDialog` (new, small) with just:
- Title (required)
- Description (optional)
- Due date (optional)
- **Amount AED** (required — sets `is_billable=true`, `billable_amount=<n>`)

It writes a `tasks` row with `assigned_to = melvin`, `status='todo'`, `is_billable=true`, `billable_amount=<n>`, `type='general'`. No pipeline picker, no products manager, no role selector — just the four fields. (The existing heavy `AddTaskDialog` remains available elsewhere.)

### 4. Pay button
- "Record Payment" reuses existing `FreelancerBillingDialog` (already supports admin add-payment).
- After payment is saved, dashboard refetches and the row flips to "Paid".

## What is NOT changed
- No DB migrations.
- Workflow for every other team member is untouched.
- Admin's existing Manage Team → Freelancer Billing dialog still works.
- Webhooks, audits, soft-delete rules — all preserved.

## Technical details
- Files to edit: `src/components/freelancer/FreelancerOnlyDashboard.tsx`, `src/components/AddTaskDialog.tsx`, `src/pages/Dashboard.tsx` (already passes `is_freelancer` via teamMembers — verify), `src/components/ManageTeamDialog.tsx` (label sweep).
- New file: `src/components/freelancer/FreelancerTaskDialog.tsx` (~80 lines, four-field form).
- "Approved" marker stored as a sentinel substring `[approved]` appended to `admin_remarks` to avoid schema change. Checked with `admin_remarks?.includes('[approved]')`.
- Payment detection unchanged: row id present in any `freelancer_payments.task_ids[]`.
