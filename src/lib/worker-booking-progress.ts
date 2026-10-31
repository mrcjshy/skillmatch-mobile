import { supabase } from './supabase';

export type WorkerProgress = { bookingId: string; arrivedAt: string | null; serviceCompletedAt: string | null };
export type WorkerProgressStep = 'arrive' | 'complete';
export type ProgressRpc = (name: string, args: Record<string, string>) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
const unavailable = () => new Error('Could not verify booking progress. Refresh the booking before trying again.');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function timestamp(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)));
}
export function parseWorkerProgress(data: unknown, bookingId: string): WorkerProgress {
  if (!uuid.test(bookingId) || !Array.isArray(data) || data.length !== 1) throw unavailable();
  const row = data[0];
  if (!row || typeof row !== 'object' || row.booking_id !== bookingId ||
      !timestamp(row.arrived_at) || !timestamp(row.service_completed_at) ||
      (row.service_completed_at !== null && (row.arrived_at === null || Date.parse(row.service_completed_at) < Date.parse(row.arrived_at)))) throw unavailable();
  return { bookingId, arrivedAt: row.arrived_at, serviceCompletedAt: row.service_completed_at };
}
export type WorkerProgressPresentation = { action: WorkerProgressStep | null; label: string; actionLabel: string; message: string };
export function workerProgressPresentation(status: string, progress: WorkerProgress | null, paymentStatus: string | null): WorkerProgressPresentation {
  if (status !== 'confirmed') return { action: null, label: '', actionLabel: '', message: '' };
  if (!progress) return { action: null, label: 'Progress Unavailable', actionLabel: '', message: 'Refresh the booking to verify your next step.' };
  if (progress.serviceCompletedAt) return { action: null, label: 'Job Completed', actionLabel: '',
    message: paymentStatus === 'paid' ? 'Awaiting Client Final Completion' : paymentStatus === 'pending' ? 'Ready to Receive Payment' : paymentStatus === null ? 'Checking Payment Status' : 'Payment Needs Review' };
  if (progress.arrivedAt) return { action: 'complete', label: 'Arrived at Job Site', actionLabel: 'Swipe to Mark as Completed', message: 'Confirm only when the agreed work is finished. Payment is handled separately.' };
  return { action: 'arrive', label: 'Accepted', actionLabel: 'Swipe to Confirm Arrival', message: 'Confirm only when you have physically arrived at the job location.' };
}
const invoke: ProgressRpc = async (name, args) => await supabase.rpc(name, args);
async function request(name: string, args: Record<string, string>, rpc: ProgressRpc) {
  if (!uuid.test(args.p_booking_id)) throw unavailable();
  let result;
  try { result = await rpc(name, args); } catch { throw unavailable(); }
  if (result.error) throw unavailable();
  return parseWorkerProgress(result.data, args.p_booking_id);
}
export async function loadWorkerProgress(bookingId: string, rpc: ProgressRpc = invoke): Promise<WorkerProgress> {
  return request('get_my_worker_booking_progress', { p_booking_id: bookingId }, rpc);
}
export async function confirmWorkerProgress(bookingId: string, step: WorkerProgressStep, rpc: ProgressRpc = invoke): Promise<WorkerProgress> {
  if (step !== 'arrive' && step !== 'complete') throw unavailable();
  const progress = await request('confirm_my_worker_booking_progress', { p_booking_id: bookingId, p_step: step }, rpc);
  if (!progress.arrivedAt || (step === 'complete' && !progress.serviceCompletedAt)) throw unavailable();
  return progress;
}
