<!-- SOURCE DOCUMENT: 06_Infrastructure_DevOps_Handbook.docx -->
<!-- Converted to Markdown for Claude/Claude Code repository use. -->
<!-- Source content is preserved; this conversion does not establish new business or technical authority. -->

**XSPEERIA**

Wallet-less Peer-to-Peer Fiat Currency Exchange

**DOCUMENT 06 OF 05 — INFRA**

**Infrastructure & DevOps Handbook**

*Environments, CI/CD, Infrastructure as Code, Monitoring & Operational Runbooks*

|                  |                                                     |
|------------------|-----------------------------------------------------|
| **Attribute**    | **Value**                                           |
| Document Version | v1.0 — Draft                                        |
| Document Owner   | AWS Principal DevOps Architect / SRE Lead           |
| Review Cycle     | Monthly during pre-launch; quarterly post-launch    |
| Classification   | Internal — Confidential — Pre-Development Blueprint |
| Status           | Draft — Pre-Development Blueprint                   |
| Date             | August 2026                                         |

Version History

|             |          |                  |                                                                     |
|-------------|----------|------------------|---------------------------------------------------------------------|
| **Version** | **Date** | **Author**       | **Summary of Changes**                                              |
| v0.1        | 2026-07  | DevOps Architect | Initial draft from ARCHITECTURE.md stack and SECURITY.md tooling    |
| v1.0        | 2026-08  | DevOps Architect | Full environment strategy, CI/CD, IaC, monitoring, DR, and runbooks |

Table of Contents

Executive Summary

This handbook defines how Xspeeria’s infrastructure is provisioned, deployed, monitored, and recovered. It operationalizes the technology choices in ARCHITECTURE.md (FastAPI, PostgreSQL, Redis, SQLAlchemy, Celery, React Native/Expo, Next.js) and the quality-gate tooling documented for the project (Bandit, Ruff, MyPy, Pytest, pip-audit) — whose normative source is unresolved, see the note below — into a concrete environment strategy, CI/CD pipeline, Infrastructure-as-Code approach, observability stack, and a set of on-call runbooks for the failure modes most relevant to a real-money P2P exchange platform.

> **ASSUMPTION:** *ARCHITECTURE.md specifies the technology stack, and the required quality-gate tools are documented without a normative source (see the note below), but neither specifies a specific cloud provider, region, or hosting topology. This document assumes an AWS-centric deployment (consistent with the "AWS Principal DevOps Architect" role in MASTER_PROMPT.md) as the reference implementation. Provider-specific service names (RDS, ElastiCache, ECS/Fargate) are illustrative and should be confirmed against final infrastructure procurement decisions.*

> **`UNKNOWN — NOT VERIFIED` — missing normative security baseline.** Statements below previously cited a repository document named `SECURITY.md` as their normative source. **No such document exists.** No normative Security Baseline Specification currently exists in this repository, and the security-baseline decision (Decision 2, `AUDIT_PHASE0_2026-08-18.md` §14) remains **OPEN**. Those citations now read "the applicable approved security policy", which is **not yet determined** — the controls described therefore lack their expected normative grounding. Documented requirements are not evidence of implementation or verification.

1\. Infrastructure Overview

The platform runs as a set of independently deployable services fronting a shared PostgreSQL primary, a Redis cluster serving both caching and the Celery broker role, and Celery worker pools for asynchronous domain-event processing (see Document 05, Section 6).

***Figure: High-level infrastructure topology***

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p>```mermaid</p>
<p>graph TB</p>
<p>subgraph Client</p>
<p>RN[React Native App]</p>
<p>NX[Next.js Admin]</p>
<p>end</p>
<p>subgraph Edge</p>
<p>CF[CDN / WAF]</p>
<p>ALB[Application Load Balancer]</p>
<p>end</p>
<p>subgraph Compute</p>
<p>API[FastAPI Service - ECS Fargate]</p>
<p>WORKER[Celery Workers - ECS Fargate]</p>
<p>BEAT[Celery Beat Scheduler]</p>
<p>end</p>
<p>subgraph Data</p>
<p>PG[(PostgreSQL - RDS Multi-AZ)]</p>
<p>REDIS[(Redis - ElastiCache)]</p>
<p>S3[(Object Storage - S3, KYC docs)]</p>
<p>end</p>
<p>subgraph Observability</p>
<p>PROM[Prometheus]</p>
<p>GRAF[Grafana]</p>
<p>SENTRY[Sentry]</p>
<p>OTEL[OpenTelemetry Collector]</p>
<p>end</p>
<p>RN --&gt; CF --&gt; ALB --&gt; API</p>
<p>NX --&gt; CF</p>
<p>API --&gt; PG</p>
<p>API --&gt; REDIS</p>
<p>API --&gt; S3</p>
<p>WORKER --&gt; REDIS</p>
<p>WORKER --&gt; PG</p>
<p>BEAT --&gt; REDIS</p>
<p>API --&gt; OTEL --&gt; PROM --&gt; GRAF</p>
<p>API --&gt; SENTRY</p>
<p>WORKER --&gt; SENTRY</p>
<p>```</p></td>
</tr>
</tbody>
</table>

2\. Environment Strategy

|                 |                                                                      |                                                                               |                                                                                      |
|-----------------|----------------------------------------------------------------------|-------------------------------------------------------------------------------|--------------------------------------------------------------------------------------|
| **Environment** | **Purpose**                                                          | **Data**                                                                      | **Access**                                                                           |
| Local           | Individual developer machines; full stack via Docker Compose         | Synthetic seed data only                                                      | Developer machine, no shared credentials                                             |
| Development     | Shared integration environment for in-progress feature branches      | Synthetic data, reset weekly                                                  | Engineering team (VPN-gated)                                                         |
| Staging         | Production-parity environment for release candidates and QA sign-off | Anonymized/synthetic data mirroring production schema                         | Engineering + QA + Product (VPN-gated)                                               |
| Production      | Live customer-facing environment                                     | Real customer and financial data, encrypted at rest (AES-256 — requirement documented; normative source unresolved) | Least-privilege RBAC; break-glass procedure for emergency access, fully audit-logged |

Every environment is provisioned from the same Terraform modules (Section 5) with environment-specific variable files, so staging is structurally identical to production — the primary source of "works in staging, fails in production" defects.

3\. Docker

3.1 Compose Topology (Local & Development)

docker-compose.yml defines the following services for local development, mirroring the production topology at reduced scale:

|             |                                                            |                                      |
|-------------|------------------------------------------------------------|--------------------------------------|
| **Service** | **Image**                                                  | **Purpose**                          |
| api         | Built from ./backend/Dockerfile                            | FastAPI application server           |
| worker      | Built from ./backend/Dockerfile (celery worker entrypoint) | Celery worker pool                   |
| beat        | Built from ./backend/Dockerfile (celery beat entrypoint)   | Scheduled task dispatcher            |
| postgres    | postgres:16                                                | Primary relational database          |
| redis       | redis:7                                                    | Cache + Celery broker/result backend |
| admin       | Built from ./admin/Dockerfile                              | Next.js Admin console                |

3.2 Networking

All services share a dedicated bridge network (xspeeria-net) in Compose. Only api and admin expose host ports (8000, 3000 respectively); postgres and redis are internal-only, matching the production security group posture where the database and cache are never internet-routable.

3.3 Volumes

|                |                          |                                                                                          |
|----------------|--------------------------|------------------------------------------------------------------------------------------|
| **Volume**     | **Mount**                | **Purpose**                                                                              |
| pgdata         | /var/lib/postgresql/data | Postgres persistence across container restarts                                           |
| redisdata      | /data                    | Redis AOF persistence (dev convenience; production uses ElastiCache managed persistence) |
| ./backend:/app | bind mount               | Live code reload in local development                                                    |

3.4 Secrets

Local/Development use a git-ignored .env file loaded via docker-compose’s env_file directive, seeded from .env.example with placeholder values. Staging and Production never use .env files — secrets are injected at container start from AWS Secrets Manager via the ECS task definition’s secrets block, so no plaintext credential ever touches disk or a CI log.

4\. CI/CD Pipeline

4.1 Pipeline Stages (GitHub Actions)

***Figure: CI/CD pipeline flow***

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p>```mermaid</p>
<p>graph LR</p>
<p>A[Push / PR] --&gt; B[Lint: Ruff]</p>
<p>B --&gt; C[Type Check: MyPy]</p>
<p>C --&gt; D[Test: Pytest]</p>
<p>D --&gt; E[Security: Bandit]</p>
<p>E --&gt; F[Dependency Audit: pip-audit]</p>
<p>F --&gt; G{Branch?}</p>
<p>G --&gt;|feature branch| H[Report status, block merge on failure]</p>
<p>G --&gt;|main| I[Build Docker image]</p>
<p>I --&gt; J[Push to ECR]</p>
<p>J --&gt; K[Deploy to Staging]</p>
<p>K --&gt; L[Smoke tests]</p>
<p>L --&gt; M{Manual approval}</p>
<p>M --&gt;|approved| N[Deploy to Production]</p>
<p>N --&gt; O[Post-deploy health check]</p>
<p>```</p></td>
</tr>
</tbody>
</table>

4.2 Quality Gates

|           |                                                                      |                                        |
|-----------|----------------------------------------------------------------------|----------------------------------------|
| **Tool**  | **Purpose**                                                          | **Failure Behavior**                   |
| Ruff      | Python linting and formatting enforcement                            | Blocks merge                           |
| MyPy      | Static type checking                                                 | Blocks merge                           |
| Pytest    | Unit and integration test suite, minimum coverage threshold enforced | Blocks merge below coverage threshold  |
| Bandit    | Static application security testing (SAST) for Python                | Blocks merge on high/critical findings |
| pip-audit | Known-vulnerability scan of Python dependencies                      | Blocks merge on high/critical CVEs     |

This is the tool set presently configured in the repository CI workflow (`.github/workflows/ci.yml`), applied as hard CI gates rather than advisory checks — no override path exists that bypasses these gates for main-branch merges. This is the **current repository configuration**, and must not be represented as an **approved normative security baseline**: no Security Baseline Specification exists and Decision 2 is open.

4.3 Deployment Flow

Merges to main automatically deploy to Staging. Production deployment requires an explicit manual approval gate in GitHub Actions (Environments feature), performed by a designated release approver, after staging smoke tests pass. This two-environment, human-gated promotion path is the minimum bar for a platform moving real customer funds.

5\. Infrastructure as Code

5.1 Terraform Module Structure

|                       |                                                                                                       |
|-----------------------|-------------------------------------------------------------------------------------------------------|
| **Module**            | **Provisions**                                                                                        |
| modules/network       | VPC, public/private subnets across 2+ AZs, NAT gateways, security groups                              |
| modules/database      | RDS PostgreSQL (Multi-AZ in staging/production), parameter groups, automated backups                  |
| modules/cache         | ElastiCache Redis cluster, subnet group, security group                                               |
| modules/compute       | ECS cluster, Fargate task definitions and services for api/worker/beat                                |
| modules/storage       | S3 bucket for KYC documents with AES-256 default encryption and bucket policies denying public access |
| modules/observability | Prometheus/Grafana workspace or managed equivalent, Sentry project config, OTEL collector deployment  |
| modules/dns-cdn       | Route53 zones, CloudFront/WAF configuration                                                           |

5.2 State Management

Terraform state is stored remotely in an S3 backend with DynamoDB state locking, one state file per environment (dev/staging/production) to prevent cross-environment blast radius from a single apply.

5.3 Variables & Secrets

Environment-specific values live in terraform.tfvars per environment, git-ignored where they contain anything sensitive; all genuinely secret values (database passwords, JWT signing keys, third-party API keys) are generated into AWS Secrets Manager by Terraform’s random_password + aws_secretsmanager_secret resources rather than being written to any .tfvars file at all.

6\. Monitoring

6.1 Stack

|               |                                                                                               |
|---------------|-----------------------------------------------------------------------------------------------|
| **Tool**      | **Role**                                                                                      |
| Prometheus    | Metrics collection (request latency, error rate, queue depth, DB connection pool utilization) |
| Grafana       | Dashboards and visualization                                                                  |
| Sentry        | Error tracking and exception aggregation across API and workers                               |
| OpenTelemetry | Distributed tracing across API → database → Celery task boundaries                            |

6.2 Key Dashboards

- API Health: request rate, p50/p95/p99 latency, 4xx/5xx rate by endpoint.

- Settlement Pipeline: Celery queue depth, task success/failure rate, time-in-state for each settlement status.

- Database: connection pool saturation, replication lag (Multi-AZ), slow query log volume.

- Business Health: matches per hour, settlement completion rate, dispute rate — surfaced to Product alongside infra metrics since they share the same alerting pipeline.

6.3 Alerting Policy

|               |                                                                                             |                                                                      |
|---------------|---------------------------------------------------------------------------------------------|----------------------------------------------------------------------|
| **Severity**  | **Example Trigger**                                                                         | **Response**                                                         |
| P1 — Critical | API 5xx rate \> 5% for 5 minutes; Settlement queue processing halted                        | Immediate page to on-call SRE; incident channel opened automatically |
| P2 — High     | p95 latency \> 2s sustained; Celery DLQ receiving MatchConfirmed/ReleaseAuthorized events | Page on-call within 15 minutes                                       |
| P3 — Medium   | Elevated error rate on a non-critical endpoint; disk usage \> 80%                           | Ticket created, addressed within business hours                      |
| P4 — Low      | Informational threshold breaches, dependency version drift                                  | Weekly triage                                                        |

7\. Backup & Disaster Recovery

7.1 Objectives

|                                |                                                                    |                                                                                                                              |
|--------------------------------|--------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------|
| **Metric**                     | **Target**                                                         | **Rationale**                                                                                                                |
| RPO (Recovery Point Objective) | 5 minutes                                                          | PostgreSQL Multi-AZ synchronous replication plus continuous WAL archiving bounds acceptable data loss for a financial ledger |
| RTO (Recovery Time Objective)  | 30 minutes for database failover; 2 hours for full-region recovery | Multi-AZ automatic failover handles the common case; full-region DR is a documented manual procedure                         |

> **ASSUMPTION:** *Specific RPO/RTO figures are proposed targets consistent with standard practice for a Multi-AZ RDS deployment carrying financial data, not yet validated against a formal business-continuity risk assessment. They should be ratified by Engineering and Compliance jointly before being treated as an SLA commitment to banking partners (see Document 07, Section 8).*

7.1.1 Append-Only Financial Store Operations (ADR-002 / DEC-004)

`settlement_events`, `webhook_receipts`, `ledger_entries` and `ledger_lines` are append-only. Operational consequences:

|                             |                                                                                                                                     |
|-----------------------------|---------------------------------------------------------------------------------------------------------------------------------------|
| **Concern**                 | **Requirement**                                                                                                                     |
| Database roles              | Application roles hold INSERT only on these tables. `UPDATE` and `DELETE` are revoked at the role level, with triggers as defence in depth. Tables are owned by a role the application cannot assume. |
| Runtime credentials         | The application never connects as owner or superuser. A separate SELECT-only `auditor` credential exists for independent verification. |
| Restore integrity           | After any restore, per-entry content hashes and the most recent signed checkpoints must be re-verified before the ledger is treated as trustworthy |
| Checkpoint verification job | A scheduled job verifies per-entry hashes and signed checkpoint roots. A break is a **P1** incident. |
| Ledger divergence           | Projections may be deterministically rebuilt from accepted history. **The ledger is never silently rebuilt** — divergence requires human investigation and sign-off, because a silent rebuild is indistinguishable from tampering. |
| Retention                   | Financial retention is at least 7 years per Appendix D Section 13; archival must preserve append-only guarantees and hash verifiability |

> **TBD — P-11, Compliance / Security / Legal:** *checkpoint frequency and the external anchoring mechanism for signed checkpoint roots are not yet determined and must not be assumed. Entries created after the most recent checkpoint rely on role restrictions, per-entry hashes, WAL archiving to immutable storage, and independent reconciliation until the next checkpoint seals them.*

7.2 Database Restore Procedure

Point-in-time recovery via RDS automated backups (35-day retention) restores to a new instance, which is validated against a checksum of expected row counts for core tables before traffic is cut over via a DNS/connection-string change — the original (possibly-corrupted) instance is never overwritten in place.

7.3 Object Storage Recovery

S3 versioning is enabled on the KYC document bucket; accidental deletion or overwrite is recoverable via version rollback. Cross-region replication provides a secondary copy for full-region loss scenarios.

7.4 Rollback

Every production deployment retains the prior ECS task definition revision. Rollback is a single ECS service update to the previous task definition ARN, executed via the same CI/CD pipeline’s rollback job, target completion under 5 minutes.

8\. Operational Runbooks

Deploy

|                            |                                                                                                                                                                                                                                                                                             |
|----------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Field**                  | **Detail**                                                                                                                                                                                                                                                                                  |
| Trigger                    | Merge to main after CI passes, or manual re-run of a prior successful build                                                                                                                                                                                                                 |
| Procedure                  | 1\. Verify staging smoke tests are green. 2. Trigger manual approval gate in GitHub Actions. 3. Monitor ECS deployment circuit breaker during rollout. 4. Confirm post-deploy health check endpoint returns 200 across all tasks. 5. Watch error-rate dashboard for 15 minutes post-deploy. |
| Rollback / Abort Condition | If health checks fail or error rate spikes \>2x baseline within 15 minutes, execute Rollback runbook immediately.                                                                                                                                                                           |
| Owning Role                | On-call SRE + Release Approver                                                                                                                                                                                                                                                              |

Rollback

|                            |                                                                                                                                                                        |
|----------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Field**                  | **Detail**                                                                                                                                                             |
| Trigger                    | Failed deploy health check, or P1 incident traced to a recent release                                                                                                  |
| Procedure                  | 1\. Identify last-known-good ECS task definition revision. 2. Update ECS service to that revision. 3. Confirm health checks green. 4. Open incident postmortem ticket. |
| Rollback / Abort Condition | N/A — this is itself the abort procedure                                                                                                                               |
| Owning Role                | On-call SRE                                                                                                                                                            |

Rotate Secrets

|                            |                                                                                                                                                                                                                                                                                           |
|----------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Field**                  | **Detail**                                                                                                                                                                                                                                                                                |
| Trigger                    | Scheduled quarterly rotation, or suspected credential compromise                                                                                                                                                                                                                          |
| Procedure                  | 1\. Generate new secret value in AWS Secrets Manager (versioned, old value retained temporarily). 2. Update ECS task definitions to reference new version. 3. Rolling-restart affected services. 4. Confirm application health. 5. Revoke old secret version after a 24-hour soak period. |
| Rollback / Abort Condition | If rolling restart causes failures, revert task definitions to reference the prior secret version immediately — do not revoke the old value until new value is confirmed working.                                                                                                         |
| Owning Role                | Security Lead + On-call SRE                                                                                                                                                                                                                                                               |

Database Migration

|                            |                                                                                                                                                                                                                                                                                                                                                 |
|----------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Field**                  | **Detail**                                                                                                                                                                                                                                                                                                                                      |
| Trigger                    | New Alembic/SQLAlchemy migration merged to main                                                                                                                                                                                                                                                                                                 |
| Procedure                  | 1\. Review migration for backward compatibility (additive-first: new nullable columns before backfill, before making non-nullable in a later release). 2. Apply to Staging automatically via CI/CD. 3. Verify against staging data. 4. Apply to Production during low-traffic window with an active database backup snapshot immediately prior. |
| Rollback / Abort Condition | If migration fails partway, restore from the pre-migration snapshot rather than attempting a partial manual fix on a financial schema.                                                                                                                                                                                                          |
| Owning Role                | Backend Lead                                                                                                                                                                                                                                                                                                                                    |

Redis Failure

|                            |                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
|----------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Field**                  | **Detail**                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Trigger                    | ElastiCache node failure or connectivity loss alert (P1)                                                                                                                                                                                                                                                                                                                                                                                                       |
| Procedure                  | 1\. Confirm failure scope (single node vs. cluster) via CloudWatch/Prometheus. 2. ElastiCache automatic failover should promote a replica — confirm this occurred. 3. If automatic failover does not resolve within 5 minutes, manually trigger failover via AWS console/CLI. 4. Celery workers will retry queued tasks per their retry policy (Document 05, Section 6) once broker connectivity is restored — confirm queue depth drains rather than growing. |
| Rollback / Abort Condition | If cluster-wide failure persists beyond RTO target, activate read-only degraded mode (Marketplace browsing available, new Offer/Match creation paused) rather than allowing uncontrolled task backlog.                                                                                                                                                                                                                                                         |
| Owning Role                | On-call SRE                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

Celery Queue Failure

|                            |                                                                                                                                                                                                                                                                                                                                                               |
|----------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Field**                  | **Detail**                                                                                                                                                                                                                                                                                                                                                    |
| Trigger                    | DLQ depth alert or queue processing halted (P1/P2 per event type, see Section 6.3)                                                                                                                                                                                                                                                                            |
| Procedure                  | 1\. Inspect DLQ contents to identify the failing event type and error pattern. 2. If the cause is a transient downstream dependency (e.g., banking webhook endpoint down), confirm dependency recovery and manually replay DLQ messages. 3. If the cause is a code defect, hotfix via the standard Deploy runbook before replaying to avoid repeated failure. |
| Rollback / Abort Condition | MatchConfirmed and ReleaseAuthorized failures are money-movement-critical — do not replay blindly; verify no duplicate settlement or duplicate release would result, using the idempotency keys defined in Document 05 and Appendix D Section 8. Release keys are deterministic and include `leg_id`, so a correct replay is a partner-side no-op; a replay that omits `leg_id` is not safe and must be rejected.                                                                                                                                                          |
| Owning Role                | Backend Lead + On-call SRE                                                                                                                                                                                                                                                                                                                                    |

API Outage

|                            |                                                                                                                                                                                                                                                                                                                                                                                |
|----------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Field**                  | **Detail**                                                                                                                                                                                                                                                                                                                                                                     |
| Trigger                    | ALB health checks failing across all API tasks (P1)                                                                                                                                                                                                                                                                                                                            |
| Procedure                  | 1\. Check most recent deploy — if within the last hour, execute Rollback runbook immediately. 2. Check RDS/ElastiCache health dashboards for an upstream dependency failure. 3. Check ECS service events for a capacity/scheduling issue (e.g., failed task placement). 4. If root cause is not immediately evident, scale out task count as a mitigation while investigating. |
| Rollback / Abort Condition | Declare a customer-facing incident and post a status-page update if outage exceeds 5 minutes, per the communication expectations in Document 07’s failure-scenario handling.                                                                                                                                                                                                   |
| Owning Role                | On-call SRE, with Engineering Lead paged for outages exceeding 15 minutes                                                                                                                                                                                                                                                                                                      |

Appendix A: Tool Version Baseline

|            |                                                                             |
|------------|-----------------------------------------------------------------------------|
| **Tool**   | **Baseline Version Policy**                                                 |
| PostgreSQL | Latest stable major version at project start, minor-version patched monthly |
| Redis      | Latest stable major version, patched monthly                                |
| Python     | Pinned per backend/pyproject.toml, upgraded deliberately per quarter        |
| Node.js    | LTS release, upgraded deliberately per quarter                              |

This handbook assumes no infrastructure has been provisioned yet; it is the blueprint from which the first Terraform apply and first CI/CD pipeline run will be executed, consistent with EXECUTION_MANUAL.md’s Stage 3 (Build Architecture) and Stage 4 (Security) sequencing.
