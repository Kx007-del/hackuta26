/** Reports belong to the current player, and must not leak across account changes. */
export function clearPrivateReport(storage: Pick<Storage, 'removeItem'>) {
  try { storage.removeItem('showcase:attempt-report:v1'); } catch { /* Storage can be unavailable. */ }
}
