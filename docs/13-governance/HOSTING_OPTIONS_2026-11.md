# Hosting Options for Xspeeria (November 2026)

**For the owner to decide** (readiness blocker C-3). Nothing here is chosen or bought. Prices are not quoted, because none were verified; get written quotes.

## 1. The rule that decides most of this

**The CBN circular of 15 June 2026** ("Introduction of Market Structure Requirements, Data Localisation, Ultimate Beneficial Ownership Disclosure, and Systemic Oversight Measures in the Nigeria Payments System") requires **payment transaction data generated in Nigeria to be stored and managed in Nigeria from 1 January 2027**.

- **Who it covers:** banks, payment service providers, switching and processing companies and other payment participants.
- **What reports say:**
  - it does not ban international cloud providers as such;
  - it doesn't name a technology;
  - offshore **backups** holding payment data should not be assumed to be exempt.
- **For Xspeeria:** whether a P2P marketplace whose money is held by a partner bank counts as a "participant" is a question for the lawyer (C-2). **Until the lawyer says otherwise, plan for in-country hosting** of the database and its backups. Xspeeria's deals, amounts, payout records and escrow events are payment data.
- Sources (news and legal summaries; get the circular itself from the lawyer or the bank):
  - [BusinessDay](https://businessday.ng/technology/article/over-90-of-nigerian-banks-fintechs-face-foreign-cloud-exit-as-cbn-forces-data-home-by-2027/)
  - [Youverify summary](https://youverify.co/en/blogs/cbn-payment-data-storage-regulations-data-localisation-nigeria)
  - [Techpoint](https://techpoint.africa/insight/cbn-data-localisation-push-raises-concerns/)

## 2. What Xspeeria needs from a host

| Need | Why |
|---|---|
| **PostgreSQL 16** (managed if possible), in Nigeria | All data. Row-level security and roles must work (ADR-078). The app's login user must **not** be a superuser or have `BYPASSRLS`. |
| **Daily backups in Nigeria, plus one recorded restore test** | Readiness C-4. |
| **Containers or VMs** for the API (Python/FastAPI) and the console (Next.js) | Two small services and background jobs. |
| **A secret manager** | Keys out of `.env` files (C-3, SEC-026/027). |
| **Separate test and live setups** | SEC-034. |
| **Private object storage** | Staff photos, adverts (ADR-049). |
| **HTTPS, a firewall, and the console limited to staff networks** | ADR-079; the console shouldn't be open to the internet. |
| **Logs kept centrally**; support you can reach | Incidents (ADR-074). |
| **Certifications:** ISO 27001; PCI DSS if card data ever appears; Tier III or better data centre | The partner bank will ask. |

## 3. The options

| | **A. Nigerian cloud provider** | **B. Amazon (AWS) Local Zone in Lagos** | **C. Your own servers in a Lagos data centre** |
|---|---|---|---|
| What it is | A cloud run from Nigerian data centres. Examples named in the press: **Layer3**, **Nobus**, **Kasi Cloud**, telco clouds (MTN, Airtel). | AWS equipment in Lagos (launched January 2023) connected to an AWS region abroad. | Rent rack space (e.g. **Rack Centre**, **Equinix MDXi**, **OADC**) and run your own servers. |
| Data in Nigeria | Yes, by design. Confirm in the contract that **backups** stay in Nigeria too. | The servers and disks are in Lagos. **Not verified:** whether a managed PostgreSQL service is offered there, and where backups and snapshots are kept. Ask AWS in writing. | Yes. |
| Managed PostgreSQL | **Layer3** advertises database, Kubernetes, object storage and backup services from "data centers located within Nigeria", and states ISO 27001, ISO 27017 and PCI-DSS ([Layer3](https://layer3.ng/solutions/cloud)). Others: ask. | `UNKNOWN — NOT VERIFIED` in the Lagos Local Zone. Otherwise run PostgreSQL yourself on a virtual server. | You run it yourself. |
| Effort for a small team | **Low to medium.** | **Medium.** AWS is powerful but complex, and some services may not be in Lagos. | **High.** Hardware, power, patches, backups and on-call are all yours. |
| Risk | Smaller providers: check their uptime record, backup and power arrangements, and exit terms. | Data-location details need confirming against the CBN rule. | Everything depends on your own operations. |
| Fit for Xspeeria now | **Best fit to evaluate first.** | A fallback if a Nigerian provider can't meet the needs. | Not recommended at this stage. |

## 4. Recommended next steps

1. **Lawyer (C-2):** is Xspeeria covered by the 15 June 2026 circular? Which data must stay in Nigeria? May backups or the identity-check provider (Didit) process data abroad?
2. **Ask 2–3 Nigerian providers** (Layer3 first, because it advertises managed databases and certifications) for a written answer to the table in §2:
   - PostgreSQL 16 with roles and row-level security, and no superuser for the app;
   - backup location and frequency, and the restore process;
   - secret manager;
   - certifications;
   - uptime record;
   - power and redundancy;
   - support hours;
   - exit terms (getting the data back);
   - price for a small test setup and a small live setup.
3. **Ask AWS** the same about the Lagos Local Zone, especially the managed PostgreSQL and backup locations.
4. **Ask the partner bank** what it requires of your hosting. Banks often have a vendor questionnaire.
5. Then choose. I'll set up the test environment, backups and the deploy pipeline on whichever you pick.

**Not verified here:** prices, uptime and current service lists of every provider named. These are from the providers' own pages and press reports as of November 2026.
