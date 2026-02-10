

# Fix: CRM Tasks Reappearing in Pipelines

## Problem

CRM tasks keep reappearing in pipelines after being moved or worked on. There are two root causes in the `receive-task-webhook` edge function:

1. **Mockup tasks**: The webhook uses `upsert` with `status: 'pending'` on the `mockup_tasks` table. When the CRM re-sends the same task (same `external_task_id`), the upsert **resets the status back to 'pending'**, undoing all progress (review, approved, completed). This is why "Mr. Zaid Taha (RAPIDEFENCE)" keeps reappearing.

2. **Quotation tasks**: The webhook uses a plain `insert` into the `tasks` table with no duplicate check. When the CRM re-sends a task, it creates a **brand new duplicate** every time.

## Solution

Update the `receive-task-webhook` edge function with idempotent handling:

### 1. Mockup tasks - Skip if already exists and has progressed

Before upserting, check if a mockup task with the same `external_task_id` already exists. If it does and its status is anything other than `pending`, skip the upsert entirely (return success without modifying the task). Only create/reset if the task doesn't exist yet.

### 2. Quotation tasks - Skip if duplicate `external_task_id`

Before inserting, check if a task with the same `external_task_id` already exists in the `tasks` table. If found, return the existing task ID with a "already exists" message instead of creating a duplicate.

## Technical Details

**File changed:** `supabase/functions/receive-task-webhook/index.ts`

**Changes to `handleCreateDesign`:**
- Query `mockup_tasks` for existing record with matching `external_task_id`
- If found and status is not `pending`, return success with existing task ID (no modification)
- If not found or status is `pending`, proceed with current upsert logic

**Changes to `handleCreateQuotation`:**
- Query `tasks` for existing record with matching `external_task_id` (when `external_task_id` is provided)
- If found, return success with existing task ID (no duplicate created)
- If not found, proceed with current insert logic

No other files, flows, or workflows are affected. This is purely a server-side guard in the webhook handler.

