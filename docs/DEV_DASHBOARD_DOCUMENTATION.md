# Developer Dashboard

Shown to the `developer` role under Manage → Dev Dashboard.

| Tab | Answers |
|---|---|
| Overview | Is the app healthy? Version, memory, CPU load, disk, database size and connections, and six health checks with the measured value beside each threshold. |
| API | What is failing or slow? Requests, error rate, median and 95th-percentile response time, a requests-over-time strip (errors in red), a sortable endpoint table, the slowest endpoints, and the 50 most recent errors. |
| Usage | Who is using what? Views and people per screen with a daily trend, and per person: last seen, device split, most-used screens. People with no activity are listed. |
| Sessions | Who is signed in? One row per person; expand to see each device. |
| Audit Log | Who changed what? Every write to the API plus sign-in events, filterable by person, action type and outcome. |

Each tab loads only when opened, keeps its last result when you come back to
it, and refreshes every 30 seconds while the browser tab is visible (the
Audit Log refreshes only on demand, so paging stays put). The time range
applies to API, Usage and Audit Log.

Design and data sources: `docs/ARCHITECTURE.md` section 11.
