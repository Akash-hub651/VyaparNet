# VyaparNet Inventory Recovery Runbooks

This document provides operational procedures for critical alerts and failure modes in the Sprint 3 Inventory Module.

## Runbook 1: `inv_protect_mode = READ_ONLY`

### Trigger
Alert: `inventory_protection_mode_active{mode="READ_ONLY"} == 1`
This means an admin has manually engaged the emergency READ_ONLY mode via `InventoryProtectionModeService.setMode('READ_ONLY')`. All reservations and stock updates will throw `503 Service Unavailable`.

### Investigation Steps
1. **Check Slack/Incident Channel**: Confirm if an admin or automated emergency workflow engaged this mode.
2. **Review DB/Redis Health**: Is the database saturated? Is Redis completely offline? READ_ONLY is typically engaged to stop cascading failures.
3. **Verify Grafana**: Look at the "Redis Failures & Mode Degradation" panel.

### Recovery Procedure
1. Verify underlying infrastructure issues are resolved.
2. Manually execute a script to restore mode:
   ```typescript
   // Example script execution or via secure admin dashboard
   await inventoryProtectionModeService.setMode('NORMAL');
   ```
3. Monitor `inventory_protection_mode_changes` metric returning to NORMAL.

---

## Runbook 2: Inventory Drift Detected

### Trigger
Alert: `inventory_drift_detected{isCritical="true"} > 0`
This occurs when the background incremental reconciliation worker (`InventoryReconcileService`) detects a mismatch between `Inventory` quantities and aggregated `InventoryMovement` or `InventoryReservation` records.

### Investigation Steps
1. Retrieve the `inventoryId` and `discrepancy` details from Pino logs:
   ```json
   { "event": "Drift detected", "inventoryId": "xxx", "expectedQuantity": 50, "actualQuantity": 45 }
   ```
2. Verify if it's `quantity` (total stock) or `reservedQty` (active reservations).
3. If it's `reservedQty`, check if the expiry worker (`InventoryProcessor`) is lagging.

### Recovery Procedure
1. If the drift is genuine (e.g., missed movement record due to infrastructure outage), the system will automatically attempt to repair it by emitting an `InventoryDriftResolved` event or flagging it for manual review.
2. If manual repair is needed:
   - Calculate exact stock from movements.
   - Run a targeted `$transaction` script that updates `Inventory.quantity` matching `SUM(InventoryMovement)`.

---

## Runbook 3: Expiry Worker DLQ Accumulates

### Trigger
Alert: BullMQ Dead Letter Queue for `inventory` queue > threshold, or `expire-reservations` job failing continuously.

### Investigation Steps
1. Inspect the BullMQ UI or CLI.
2. Look at the failing job stack trace. Common causes: Prisma connection limits or Redis timeout.
3. Because `expire-reservations` uses `updateMany WHERE status='ACTIVE'` it is completely idempotent.

### Recovery Procedure
1. Once DB/Redis health is restored, retry the failed jobs via BullMQ.
2. If BullMQ is completely dead or queue is lost, run the manual expiry script (see Runbook 4).

---

## Runbook 4: Manual Expiry SQL Script

### Trigger
Use this if the BullMQ background worker is permanently dead, or if you need to manually clear out stuck reservations during an incident.

### Recovery Procedure
Run the following SQL to identify stuck reservations:
```sql
SELECT id, inventory_id, quantity, expires_at 
FROM "InventoryReservation"
WHERE status = 'ACTIVE' 
AND expires_at < NOW();
```

To manually release them and restore stock (replace `<id>` with actual ID):
```typescript
// Do not do this via raw SQL since Inventory.reservedQty MUST be decremented.
// Use the application service:
await inventoryService.release('<id>', 'SYSTEM_RECOVERY', 'SYSTEM', 'ADMIN', 'SYSTEM');
```
If you must do it via raw SQL in a dire emergency (NOT RECOMMENDED):
```sql
BEGIN;
UPDATE "InventoryReservation" SET status = 'EXPIRED', updated_at = NOW() WHERE id = '<id>' AND status = 'ACTIVE';
UPDATE "Inventory" SET reserved_qty = reserved_qty - <quantity> WHERE id = '<inventory_id>';
COMMIT;
```
