# On-Call Guide

**Owner decision, 2026-11-02:** the on-call person is **Chinedu Egbuchulam, +234 810 553 1421**. **Owner, 2026-11-03:** the backup is **Oluwaseun Adesanya, +234 701 399 0127**.

This page says who answers alerts, how quickly, and what to do first. The full process is in [`INCIDENT_RESPONSE_PLAN.md`](INCIDENT_RESPONSE_PLAN.md) (ADR-074). Times are Lagos time (Africa/Lagos).

## 1. Who

| Role | Person | How to reach them |
|---|---|---|
| **On call** (answers alerts, leads incidents) | **Chinedu Egbuchulam** | **+234 810 553 1421** (call, then WhatsApp) |
| **Backup** (answers when the on-call person doesn't within the time below) | **Oluwaseun Adesanya** | **+234 701 399 0127** (call, then WhatsApp) |
| **Product owner** (told of every P1 and P2) | *To be named, if not the same person* | — |
| **Partner bank's incident contact** | *From the bank's agreement (C-1)* | — |
| **Hosting provider's support** | *From the hosting contract (C-3)* | — |

**One person can't be on call every hour of every week.** An alert the on-call person doesn't answer in time goes to the backup (§2). How the two share the weeks is for them and the owner to agree.

## 2. How quickly

| Level | Start within | If no answer by then |
|---|---|---|
| **P1 — Critical** (money, accounts or data harmed now; service down) | **15 minutes**, any hour | Call the backup, then the owner. Any Super Admin may press **Pause all deals** (ADR-075) while waiting. |
| **P2 — High** (likely harm soon; a control under attack) | **1 hour** | Call the backup. |
| **P3 — Medium** | Next working day | — |
| **P4 — Low** | Weekly review | — |

## 3. Where alerts arrive

- **System Health › Alerts** and the **staff bell** in the admin console. They are visible while the console is open.
- **By email**, once Resend is set up (C-5). Until then, nobody is woken by an alert. During a pilot, keep the console open in working hours and check it at least every 2 hours outside them.
- **By phone**: not yet. Paging (SMS or a call) needs a provider, so it is a decision for the owner before launch.

## 4. First five minutes of any alert

1. Press **"I'm on it"** on the alert, so others can see it's taken.
2. Read the alert's quick card ([incident plan §4](INCIDENT_RESPONSE_PLAN.md#4-quick-cards-by-alert)).
3. **Money or accounts at risk right now?** Contain first:
   - **Pause all deals** for the whole service, or put a hold on one deal;
   - suspend a customer, or **Sign everyone out**.

   Investigate after.
4. Open the incident record `INC-YYYYMMDD-n` and write down the time, the level and what you know.
5. **P1 or P2:** tell the owner now. If the owner is you, tell the backup.

## 5. Handing over

At the end of a shift, or when going offline, send the backup:
- open alerts and incidents;
- anything paused or held, and why;
- what to watch.

Write it in the incident record too.

## 6. Keep this page current

- Change the names and numbers here **in the same week** someone joins, leaves or changes number.
- **Before the pilot:**
  - ~~name a backup~~ (done 2026-11-03);
  - set up email alerts;
  - run one practice drill of a P1 (incident plan §5).
