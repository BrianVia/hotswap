# Bug Tracking

## Summary

| # | Bug | Severity | Status |
|---|-----|----------|--------|
| 1 | Query Progress Events Unscoped | Critical | ⏳ Pending |
| 2 | Numeric Query Params Broken | Critical | ⏳ Pending |
| 3 | ExportDialog setState During Render | Medium | ⏳ Pending |
| 4 | SSO Shell Injection Vulnerability | Critical | ⏳ Pending |
| 5 | Auto-Updater Config Contradiction | Low | ⏳ Pending |
| 6 | Table Open No Error Handling | Medium | ⏳ Pending |
| 7 | Pending Changes Ignores Failures | High | ⏳ Pending |
| 8 | Default Profile Not Loaded | Medium | ⏳ Pending |
| 9 | Batch Writes Drop Items | High | ⏳ Pending |

---

## Bug Details

### 1. Query Progress Events Are Unscoped (Race Condition)
**Severity:** Critical
**Status:** Plan Ready
**Files:** `src/components/TabContent.tsx`, `electron/ipc/handlers.ts`

**Problem:** `query-progress`/`write-progress` events are globally broadcasted without scoping. Running two queries in parallel will interleave progress and items across tabs, corrupting result sets.

**Solution:** Add unique request ID (UUID) to scope progress events:
- Generate UUID when starting each query
- Include requestId in all progress events
- Filter events in renderer by matching requestId

---

### 2. Query Params Force Strings (Numeric Keys Broken)
**Severity:** Critical
**Status:** Plan Ready
**Files:** `src/types/index.ts`, `src/components/TabContent.tsx`, `electron/types.ts`

**Problem:** All query params forced to strings. Numeric PK/SK values sent as strings, causing queries on numeric keys to fail.

**Solution:**
- Update types to `value: string | number | boolean`
- Auto-detect attribute types from TableInfo
- Add type selector UI for filters
- Parse values before sending to DynamoDB

---

### 3. ExportDialog setState During Render
**Severity:** Medium
**Status:** Plan Ready
**Files:** `src/components/dialogs/ExportDialog.tsx:59-65`

**Problem:** `useMemo` calls `setState` during render, violating React rules and causing potential render loops.

**Solution:** Convert `useMemo` to `useEffect`:
```tsx
useEffect(() => {
  if (isOpen) {
    setSelectedFields(new Set(fields));
    setExportSelected(selectedRowIndices.length > 0);
  }
}, [isOpen, fields, selectedRowIndices.length]);
```

---

### 4. SSO Login Shell Injection Vulnerability
**Severity:** Critical (Security)
**Status:** Plan Ready
**Files:** `electron/services/credential-manager.ts:63-66`

**Problem:** `spawn('aws', [...], { shell: true })` allows shell injection via malicious profile names.

**Solution:** Remove `shell: true`:
```typescript
const process = spawn('aws', ['sso', 'login', '--profile', profileName], {
  stdio: ['inherit', 'pipe', 'pipe'],
});
```

---

### 5. Auto-Updater Config Contradicts Comment
**Severity:** Low
**Status:** Plan Ready
**Files:** `electron/updater.ts:10-12`

**Problem:** Comment says "Don't auto-download" but `autoDownload = true`. Updates download without consent.

**Solution:**
- Set `autoDownload = false`
- Add `downloadUpdate()` function
- Update UI to show download button when update available

---

### 6. Table Open Has No Error Handling
**Severity:** Medium
**Status:** Plan Ready
**Files:** `src/components/TableList.tsx:94-124`

**Problem:** `describeTable` calls have no try/catch. Auth/network failures throw unhandled rejections.

**Solution:** Add try/catch with error state:
- Add `describeTableError` state
- Wrap async calls in try/catch
- Display errors in existing error UI

---

### 7. Pending Changes Ignores Failures
**Severity:** High
**Status:** Plan Ready
**Files:** `src/components/TabContent.tsx:1317-1378`

**Problem:** `handleApplyChanges` swallows errors, clears changes even on failure, users think writes succeeded.

**Solution:**
- Check `result.success` for every operation
- Only clear changes on full success
- Display detailed error messages
- Re-run query after successful writes

---

### 8. Default Profile Not Loaded
**Severity:** Medium
**Status:** Plan Ready
**Files:** `electron/services/config-parser.ts:30-55`

**Problem:** Parser only reads `[profile ...]` sections, ignores `[default]`.

**Solution:** Handle both formats:
```typescript
if (key.startsWith('profile ')) {
  profileName = key.replace('profile ', '');
} else if (key === 'default') {
  profileName = 'default';
}
```

---

### 9. Batch Writes Drop Items Silently
**Severity:** High
**Status:** Plan Ready
**Files:** `electron/ipc/handlers.ts:304-378`

**Problem:** Batch writes execute one-by-one (not batched), no retry for unprocessed items, throttling causes silent data loss.

**Solution:**
- Use real `BatchWriteCommand` (25 items per batch)
- Implement exponential backoff retry
- Handle `UnprocessedItems` from responses
- Return accurate success/failure counts
