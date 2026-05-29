---
name: pbx-voip-automation
description: "Use when dealing with automated phone calls, PBX, Asterisk dialplans, BDIX VPS, or the 7 PM unpaid invoice calling system. Triggers: BDWebs SIP trunk, call recordings, IVR, automated voice broadcasting."
metadata:
  author: imran
  version: "1.0.0"
---

# PBX & VoIP Automation Standards

## 1. Infrastructure (BDIX VPS)
- We do **NOT** use European servers for the PBX.
- Asterisk runs on a local **BDIX VPS** to ensure sub-millisecond local latency and pristine voice quality.
- **SIP Trunk:** We route calls through the BDWebs trunk (Caller ID / DID: `09617875955`).

## 2. Inbound Routing
- Inbound calls to `09617875955` hit the `inbound-handle` context in `extensions_bdix.conf`.
- Calls ring simultaneously to all support agents (`agent_imran`, `agent_rafy`, `agent_mujahid`, `agent_asad`, etc.) for 120 seconds.

## 3. Outbound & Automation
- **Unpaid Invoice Automation:** A script automatically runs every evening at **7:00 PM** to dial customers with unpaid invoices.
- **Number Sanitization:** Asterisk strips `+880` or `880` and reformats to local `01...` to pass carrier requirements.
- **Logging:** Every call triggers `/usr/local/bin/log_call.sh` to record the call duration and save the audio in `/var/spool/asterisk/monitor/`.

## 4. Operational Guardrails
- Before suggesting any modifications to call routing, always check `extensions_bdix.conf` first.
- Do not run high-volume concurrent automated calls without checking the SIP trunk's channel limits (usually 10-30 concurrent calls), as this will cause outbound failures.
