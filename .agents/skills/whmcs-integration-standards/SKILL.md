---
name: whmcs-integration-standards
description: "Use when querying WHMCS API, pulling customer billing data, or integrating Hostnin CRM data into TalkFuze. Triggers: fetching services, checking invoices, server status routing, or cross-referencing contact emails with billing accounts."
metadata:
  author: imran
  version: "1.0.0"
---

# WHMCS CRM Integration Standards

## 1. No Direct Database Queries
- TalkFuze MUST NOT directly query the WHMCS MySQL database. 
- ALWAYS use the WHMCS Local API or the secure `fetchWhmcsClient` wrapper in `src/actions/whmcs.ts`.

## 2. API Caching & Rate Limiting
- **Protect the Billing Server:** WHMCS runs the core billing engine. Uncached queries on every chat render will DDoS the server.
- **Zustand Cache:** WHMCS data must be cached in the TalkFuze frontend `crmCache` within the Zustand `useInboxStore`. 
- **Fetch Strategy:** Only fetch WHMCS data when an agent explicitly opens a conversation or clicks the CRM panel. Do not fetch WHMCS data for all conversations in the sidebar.

## 3. Data Privacy & Formatting
- **Sanitize Data:** When injecting WHMCS data into the AI Context (RAG), only include relevant fields (Service ID, Domain, Status, Amount, Next Due Date). Exclude sensitive PII that the AI does not need to resolve the ticket.
- **Currency Format:** Always format currency as `৳` (BDT) unless specifically handling a USD client.

## 4. Phone Number Matching (Crucial for WhatsApp)
- **Sanitization:** WhatsApp phone numbers arrive from Meta as raw digits (e.g., `880186...`). WHMCS phone numbers are highly irregular (often containing `+`, spaces, or missing country codes).
- **Matching Logic:** When attempting to auto-bind a WhatsApp contact to a WHMCS account, always strip non-numeric characters from both sides. Fall back to matching the last 10 digits (the core local number) to maximize hit rates without false positives.
