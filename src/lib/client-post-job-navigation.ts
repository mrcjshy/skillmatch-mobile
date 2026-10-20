/** Only a receipt published by the existing posting owner may open tracking.
 * Focus/foreground/authority are checked by the caller; no ID is invented here.
 */
export function postingRecoveryNotice(receipt: { postSuccess: string | null; postError: string | null }): string | undefined {
  // Ordinary success is the map itself. Retain upload/refresh recovery messages
  // for this Job instead of showing a global draft receipt on unrelated jobs.
  const warnings = [receipt.postSuccess && /could not|unknown/i.test(receipt.postSuccess) ? receipt.postSuccess : null, receipt.postError];
  return warnings.filter(Boolean).join(' ') || undefined;
}

export function openPostedJobMap(input: {
  isCurrent: () => boolean;
  takePendingCreatedJob: () => string | null;
  navigate: (jobId: string) => void;
}): boolean {
  if (!input.isCurrent()) return false;
  const jobId = input.takePendingCreatedJob();
  if (!jobId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) return false;
  if (!input.isCurrent()) return false;
  input.navigate(jobId);
  return true;
}
