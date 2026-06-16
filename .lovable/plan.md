## Goal
For freelancers (Melvin, and any future profile flagged `is_freelancer`), replace the entire dashboard with a single simple screen: their tasks and paid/pending status. No Operations kanban, no routes, no map — just billing.

## What the new screen shows
- Header: name + "Freelancer" badge + sign out.
- Summary strip: Total Billable · Paid · Pending · Balance.
- Two tabs:
  - **My Tasks** — every task assigned to Melvin marked billable, with title, status, completed date, amount (AED), and a Paid/Pending badge.
  - **Payments** — list of recorded payments (date, amount, method, reference, notes, tasks covered).
- Read-only for the freelancer. Admin can still manage everything via Manage Team → Open Freelancer Billing (unchanged).

## What changes
- `src/pages/Dashboard.tsx`: if the logged-in user's `is_freelancer === true`, short-circuit before any role-based view and render the new `FreelancerOnlyDashboard`. Sidebar, ops dashboard, kanban, header — all skipped. Sign-out still works.
- New component `src/components/freelancer/FreelancerOnlyDashboard.tsx` reusing the data logic from `FreelancerBillingDialog` but as a full-page layout (not a modal).
- Remove the now-redundant "My Earnings" sidebar item / dialog wiring (sidebar isn't rendered for freelancers anyway).

## What is NOT changed
- Admin's view of Melvin (when admin selects Melvin in the user-switcher) and all other team members' dashboards stay identical.
- Webhooks, ops triggers, kanban logic, task sync — untouched. Melvin can still be assigned ops tasks; admins still see them in the normal ops view; the freelancer screen just doesn't show the ops UI to Melvin himself.
- No DB changes.

## Note on the workflow-preservation rule
Per existing project memory, freelancer's own UI is being intentionally simplified per user instruction; underlying data and admin-side workflows remain intact.
