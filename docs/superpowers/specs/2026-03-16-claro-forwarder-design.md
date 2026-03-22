# Design Spec: Generic File Forwarder

## Purpose
The goal is to automate the forwarding of files (invoices, boletos, receipts) sent by specific trusted contacts directly to a target group "Banco - Fátima". This ensures centralized document management for recurring payments from providers like "Minha Claro" and the Real Estate agency.

## Current Context
The project `whats-L` processes WhatsApp messages for Obsidian logging. It primarily filters messages from a specific group. We are introducing a new category of behavior: sender-based file forwarding from DMs, leveraging existing deduplication logic.

## Proposed Architecture
A multi-source modular handler will be implemented, integrated with the existing checkpoint system.

### 1. Components

#### `handlers/file_forwarder.js`
A new handler that will:
- **Match Logic:** Check if `msg.from` exists in the `FORWARD_SOURCE_NUMBERS` environment list.
- **Media Check:** Verify `msg.hasMedia`.
- **Target Group Resolution:** 
    - Search for the group "Banco - Fátima" by name.
    - **Optimization:** Cache the group ID in memory once found.
- **Execution:** 
    - Download media.
    - `targetGroup.sendMessage(media, { caption: msg.body })`.
- **Persistence:** Ensure `markProcessed(msg)` is called upon success to prevent duplicate forwards across script restarts.

#### `main.js` (Modifications)
- **Import:** Add `file_forwarder` to the handlers.
- **Filter Adjustment:** Update `processMessage` to allow DMs from any ID included in `FORWARD_SOURCE_NUMBERS`.
- **Sync Logic:** Update `syncMissedMessagesByCheckpoint` to also check for missed messages in the authorized DM contacts, ensuring no boletos are missed if the script was offline.

#### `.env` (Modifications)
Add configuration variables:
- `FORWARD_SOURCE_NUMBERS="5511999910621@c.us,556199099705@c.us"`
- `TARGET_FORWARD_GROUP_NAME="Banco - Fátima"`

### 2. Data Flow
1. WhatsApp Message Received -> `main.js`.
2. `main.js` checks: Is it a group? OR Is the sender in the `FORWARD_SOURCE_NUMBERS` list?
3. If valid source, it proceeds.
4. `file_forwarder.match({ msg })` returns true.
5. `file_forwarder.handle({ msg })` sends media and marks as processed.
6. `processed.json` and `checkpoint.json` are updated.

### 3. Error Handling
- If the target group is not found, log an error and do NOT mark as processed.
- If media download fails, log the error.

### 4. Testing Strategy
- **Manual Test:** Send a PDF from one authorized number and verify arrival. Verify that running the script again doesn't resend it.

## Success Criteria
- Files from authorized sources are forwarded.
- No duplicate forwards occur.
- Missed boletos are caught during the startup sync.
