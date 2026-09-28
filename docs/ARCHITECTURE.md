> وثيقة تصميم تاريخية. للتشغيل والوظائف الحالية راجع README وRELEASE؛ مسار PDF الحالي هو الطباعة من المتصفح.

# Nozha ERP - Architecture (v2)

## 1. Realtime
One subscription layer, three mechanisms:
| Need | Mechanism | Where |
|---|---|---|
| Dashboard / lists update when anything changes | `postgres_changes` on 9 tables -> debounced `router.refresh()` | `components/LiveRefresh.tsx` (already in app shell) |
| Open task page / open chat room | channel filtered by `task_id` / `room_id`, patch local state | Tasks + Chat modules |
| Notification bell / toast | channel on `notifications` filtered `user_id=eq.<me>` | Notifications module |
| Online status | Realtime **Presence** (`presence:online`), `profiles.last_seen` heartbeat every 60s for "last seen" | LiveRefresh + Chat |

Security: Realtime obeys RLS. A branch manager never receives events of another branch, and needs no client-side filtering for safety.
Requires `replica identity full` on tasks/attendance/employees/branches/messages (done in 0004) so DELETE/UPDATE payloads carry branch info.

## 2. Task state machine (enforced in the database, not just the UI)
```
created --(BM accept)--> received --(BM start)--> in_progress --(BM mark completed)--> waiting_review
                                                                                        |
        Super Admin:  approved -> closed   |   rejected -> closed   |   returned (modifications)
        BM after return/reject:  returned|rejected -> in_progress -> waiting_review (again)
```
- `enforce_task_transition` trigger rejects illegal moves and wrong roles (a manager can't approve his own task).
- Reply / notes / files are `task_events` (`comment`, `note`, `file_uploaded`); status events are written only by the trigger, so the **timeline can't be forged**.
- `task_events` and `activity_log` are **append-only** - no update/delete for anyone, including Super Admin.
- Files: `task_attachments` (image / PDF / Excel only, max 20 MB, whitelisted at both table and storage-bucket level). Path `{branch_id}/{task_id}/{file}`.
- Reject/Return: UI inserts a `comment` event first (mandatory reason), then changes status.

## 3. Messaging (Super Admin <-> Branch Manager)
- `get_or_create_direct_room(user)` RPC enforces who may talk to whom (Admin <-> anyone but employees; Area Manager <-> managers of his branches).
- One auto-created **branch group** per branch (`sync_branch_room`): all admins + that branch's manager (+ its area managers). Reassigning a manager updates membership automatically.
- Read status: `message_reads` (double tick) + `mark_room_read(room)` RPC (also clears bell notifications). Text / image / file; files go to `chat-files/{room_id}/...`.

## 4. Attendance
`attendance` = one row per employee per day (unique). Statuses present/late/absent/leave + check_in/out + notes.
Guard trigger: employee must belong to the branch, check-out >= check-in, absent/leave clear the times. Manager writes only for his branch (RLS).

## 5. Branch and employee management
- **Delete = soft delete** (`deleted_at`) so attendance, tasks, reports and the audit trail stay intact. Super Admin can restore.
- `assign_branch_manager(branch, user)`: one manager per branch (unique index), previous manager is detached, chat room synced, user notified.
- Employees: Super Admin full control. Branch Manager acts through **permissions** (`employees.add / edit / delete / documents`), set per role in `role_permissions` and overridable per user in `user_permissions`. Admin panel edits both - nothing hardcoded.
- Salary lives in `employee_salaries`, Super Admin only (also hidden from the audit log for area managers).

## 6. Reports (Excel + PDF)
`GET /api/reports/{type}?format=xlsx|pdf&from=&to=&branch=` (Route Handler, runs with the user's session).
- Data from `security_invoker` views (`v_attendance_report`, `v_task_report`, `v_branch_kpis`) -> RLS decides what the user may export.
- Excel: `exceljs`, RTL sheet, Arabic headers. PDF: HTML template -> `puppeteer-core` + `@sparticuz/chromium` (correct Arabic shaping; runs on Vercel).
- Every export calls `log_export()` -> audit log.

## 7. Audit log
Generic trigger on 20+ tables: user, branch, action, entity, old/new value, timestamp (shown in Africa/Cairo). Covers salary changes, permission changes, file uploads and exports. Immutable; Super Admin sees all, Area Manager sees his branches (without salary rows).

## 8. Demo data lifecycle
`npm run seed` fills everything with realistic data. Before client approval -> `scripts/reset-demo.ts` (added with module 2) wipes business data and `@nozha.local` demo users, keeping schema and settings.

## 9. Revised module order
2 Branches + Employees (+ assign manager, documents) -> 3 Attendance -> 4 Tasks (workflow, attachments, timeline) -> 5 Chat + notifications + presence -> 6 Reports export -> 7 Daily ops / Quality / Complaints -> 8 Activity-log viewer + admin permissions screen -> 9 PWA polish.
