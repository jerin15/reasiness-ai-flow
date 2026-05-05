## Problem

The "TRANE Thermo King" task (id `e360aaf7…`) was created for **Jairaj (Designer)** and was correctly progressing through his loop (`todo → with_client`). Then **Reena (Admin)** moved it through `done → client_approval`. `client_approval` belongs to the **Estimator/Quotation** pipeline, so the task vanished from Jairaj's board even though it was never intended to enter that workflow.

This is a workflow-integrity issue: any admin (or any role) can today move a task into a status that belongs to a different team's pipeline, silently removing it from the original owner's view and breaking their loop.

## Fix

### 1. Restore the task
Move `e360aaf7-657d-4ae2-9167-10e407d1b972` back to Jairaj where he last had it:
- `status = 'with_client'`
- `assigned_to = 085a7f0e…` (Jairaj — already correct)
- `status_changed_at = now()`, `last_activity_at = now()`
- `came_from_designer_done = false`
- Add an audit log entry noting the manual restoration with reason.

### 2. Add a workflow-integrity guard (status transition validator)

Introduce a server-side trigger `enforce_pipeline_integrity` on `public.tasks` that blocks moves which jump between pipelines unless explicitly allowed. Allowed transitions per role:

```text
Designer pipeline:    todo ↔ mockup ↔ with_client ↔ done
Estimator pipeline:   todo ↔ supplier_quotes ↔ client_approval ↔ admin_approval ↔ quotation_bill ↔ final_invoice ↔ done
Operations pipeline:  production ↔ done
```

Rules enforced by the trigger:
- A task whose **assigned role** is `designer` cannot be moved into estimator-only statuses (`supplier_quotes`, `client_approval`, `admin_approval`, `quotation_bill`, `final_invoice`) by anyone except an admin who explicitly reassigns it (`assigned_to` change to an estimation user in the same UPDATE).
- A task whose assigned role is `estimation` cannot be moved into designer-only statuses (`mockup`, `with_client`) without simultaneous reassignment to a designer.
- Any cross-pipeline jump that does **not** include a matching `assigned_to` change is rejected with a clear error.

This means even an admin can no longer accidentally "lose" a designer's task into the estimator board — they must consciously reassign it.

### 3. Front-end safeguard (defensive)

In `AdminKanbanBoard.tsx` and `KanbanBoard.tsx`, when an admin drags a task across pipelines:
- Show a confirm dialog: *"This will move the task out of {currentOwner}'s pipeline and into the {targetPipeline} workflow. Reassign to whom?"*
- Require selecting a new assignee from the matching role before the move is committed.
- If cancelled, revert the drag.

### 4. Audit visibility

Add a dedicated `pipeline_transfer` audit action so these cross-pipeline moves are easy to find later in `task_audit_log`.

## Technical notes

- Migration: create trigger function `public.enforce_pipeline_integrity()` + `BEFORE UPDATE` trigger on `tasks`. Use a small lookup of status → pipeline. Allow service-role bypass (`current_setting('request.jwt.claim.role', true) = 'service_role'`) so webhooks/automations are not blocked.
- Data fix: a single `UPDATE` on the TRANE task plus an `INSERT` into `task_audit_log` with `action='restored'`.
- Front-end: small dialog component reused in both Kanban boards; no changes to existing drag/drop logic outside the cross-pipeline branch.

## Out of scope

- No changes to existing intra-pipeline transitions, automation rules, or webhooks.
- No changes to Operations or Mockup pipeline behavior.
