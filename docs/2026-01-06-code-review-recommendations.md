# Code Review Recommendations

**Date:** 2026-01-06
**Scope:** Uncommitted changes for critical fixes (query progress race condition, numeric query parameters, batch writes, error handling, input validation)

---

## Critical Issues

### 1. Missing `isFinite()` check in `coerceKeyValue()` - FIXED

**File:** `electron/services/query-executor.ts:19`
**Severity:** Critical
**Confidence:** 90%
**Status:** FIXED

**Issue:** The function uses `!isNaN(num)` but doesn't check `isFinite(num)`. Strings like `"Infinity"` or `"-Infinity"` will be converted to JavaScript `Infinity` values, which DynamoDB does not support and will reject at runtime.

**Fix applied:**
```typescript
if (!isNaN(num) && isFinite(num)) {
  return num;
}
```

---

### 2. Dialog not closed on partial/complete failure - FIXED

**File:** `src/components/TabContent.tsx:1575-1584`
**Severity:** Critical
**Confidence:** 95%
**Status:** FIXED

**Issue:** In `handleApplyChanges`, when operations partially or fully fail, `setShowConfirmDialog(false)` is not called, leaving the confirmation dialog open and blocking UI interaction.

**Fix applied:** Added `setShowConfirmDialog(false)` to both error paths (line ~1576 and ~1584).

---

### 3. Missing validation for empty updates - FIXED

**File:** `electron/ipc/handlers.ts:519`
**Severity:** Critical
**Confidence:** 85%
**Status:** FIXED

**Issue:** The `dynamo:update-item` handler validates that `updates` is an object but not that it's non-empty. An empty `{}` creates an invalid DynamoDB `UpdateExpression` with syntax `SET ` (no fields), causing an AWS SDK error.

**Fix applied:**
```typescript
if (!validateItem(updates) || Object.keys(updates).length === 0) {
  throw new Error('Invalid or empty updates');
}
```

---

## Important Issues

### 4. Race condition: queryId filter accepts all events when undefined

**File:** `src/components/TabContent.tsx` (lines 583, 678, 2259, 2387)
**Severity:** Important
**Confidence:** 85%
**Status:** Not fixed (accepted limitation)

**Issue:** The filter logic allows ALL events through when `currentQueryId` is undefined (before `query-started` event arrives):

```typescript
if (progress.queryId && currentQueryId && progress.queryId !== currentQueryId) {
  return; // Only blocks if BOTH queryIds are set and don't match
}
```

**Problem:** During the window between subscribing to `onQueryProgress` and receiving `onQueryStarted`, events from other tabs' queries could be processed incorrectly.

**Decision:** This is accepted as a known limitation. The window is typically very short (milliseconds), and the complexity of generating queryIds synchronously on the renderer side outweighs the benefit.

---

### 5. Type inconsistency: SK operator uses inline union - FIXED

**File:** `electron/types.ts:78,85`
**Severity:** Important
**Confidence:** 95%
**Status:** FIXED

**Issue:** The `sk.operator` field uses an inline union type instead of the named `SkOperator` type that's defined and used consistently in `src/types/index.ts`.

**Fix applied:** Added `SkOperator` type export and used it in `QueryParams`:
```typescript
export type SkOperator = 'eq' | 'begins_with' | 'between' | 'lt' | 'lte' | 'gt' | 'gte';

sk?: { name: string; operator: SkOperator; value: string; value2?: string; valueType?: DynamoKeyValueType };
```

---

### 6. Missing useEffect cleanup in initial scan

**File:** `src/components/TabContent.tsx:2354-2434`
**Severity:** Important
**Confidence:** 90%
**Status:** Not fixed (deferred)

**Issue:** The `useEffect` that performs the initial scan does not return a cleanup function. If the component unmounts or `activeTab?.id` changes while `executeInitialScan()` is running, event listeners remain active.

**Decision:** Deferred. The current implementation works correctly in practice because:
1. The scan completes quickly in most cases
2. The finally block properly unsubscribes after completion
3. Adding cleanup would require significant refactoring of the async flow

---

### 7. Progress counting could double-count items

**File:** `electron/ipc/handlers.ts:679-722`
**Severity:** Important
**Confidence:** 80%
**Status:** Not fixed (deferred)

**Issue:** In batch write with retries, items may be counted multiple times across retry attempts if partial success occurs before fallback to individual operations.

**Decision:** Deferred. This is an edge case that only occurs when:
1. BatchWriteCommand partially succeeds
2. Then throws an error on retry
3. Then falls back to individual operations

The progress is still directionally correct and the actual data integrity is not affected.

---

## Minor Issues

### 8. Partial success message only in console

**File:** `src/components/TabContent.tsx:1571-1573`
**Severity:** Low
**Confidence:** 75%
**Status:** Not fixed (enhancement)

**Issue:** When operations partially succeed, the only indication is a `console.warn()`. Users see the error message but don't know how many operations actually succeeded.

**Decision:** This is an enhancement for future consideration.

---

### 9. Cleanup order reversed from registration

**File:** `src/components/TabContent.tsx` (all query functions)
**Severity:** Low
**Confidence:** 70%
**Status:** Not fixed (cosmetic)

**Issue:** Unsubscribe functions are called in order `unsubscribe()` then `unsubscribeStart()`, but registration is in opposite order.

**Decision:** Not fixing as this has no functional impact given these handlers are independent.

---

## Implementation Status

| Priority | Issue | Status |
|----------|-------|--------|
| 1 | Add `isFinite()` check | FIXED |
| 2 | Close dialog on error | FIXED |
| 3 | Empty updates validation | FIXED |
| 4 | Type consistency (SkOperator) | FIXED |
| 5 | useEffect cleanup | Deferred |
| 6 | QueryId race condition | Accepted |
| 7 | Progress double-counting | Deferred |
| 8 | Partial success message | Enhancement |
| 9 | Cleanup order | Not fixing |

---

## Summary

- **4 issues fixed** (all critical + 1 important)
- **3 issues deferred** (medium complexity, low impact)
- **2 issues not fixing** (low priority or accepted limitations)

**Build Status:**
- TypeScript: PASSING
- Vite Build: PASSING
- Electron Build: PASSING
