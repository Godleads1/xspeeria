# Protecting `main` on GitHub (SEC-031, readiness H-4)

Today anyone with write access can push straight to `main`, skipping review and the automatic checks. GitHub's rules for private repositories need a paid plan (**GitHub Team**, per user per month; check GitHub's current price). After upgrading, the setup takes about two minutes.

## Settings

**Repository › Settings › Rules › Rulesets › New branch ruleset**:

| Setting | Value |
|---|---|
| Name | `Protect main` |
| Enforcement | **Active** |
| Target branches | **Default branch** (`main`) |
| **Restrict deletions** | On |
| **Block force pushes** | On |
| **Require a pull request before merging** | On |
| — Required approvals | **1** once there are two people who can review. While you're the only reviewer, set **0**: a pull request is still required, so nothing skips the checks. |
| — Dismiss stale approvals when new commits are pushed | On |
| — Require conversation resolution | On |
| **Require status checks to pass** | On, with these three (the names CI uses): **Python Quality & Security**, **Node & TypeScript Quality**, **Secret Scanning & Tracked-File Guard** |
| — Require branches to be up to date before merging | On |
| Bypass list | **Empty.** Nobody skips it, admins included. |

## What changes for you

- Every change goes through a pull request (as all of today's did), and **Merge** stays grey until the three checks are green.
- No one, including the owner, can push directly to `main` or rewrite its history.

## Also worth switching on (free)

- **Settings › Code security:** Dependabot alerts, and secret-scanning push protection if your plan includes it.
- **Two-factor sign-in** required for everyone in the GitHub organisation.
