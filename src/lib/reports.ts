/**
 * R3-UI user-report contract.
 *
 * Booking reports and app issues are written only through SECURITY DEFINER
 * RPCs. My Reports reads the caller's own rows through reporter-only RLS.
 * Administrators use list_reports / get_report / review_report. This module
 * never sends a reported-user id, never updates public.reports directly, and
 * never invents notification types.
 */

import { supabase } from './supabase';

export const BOOKING_REPORT_CATEGORIES = [
  'behavior',
  'no-show',
  'harassment',
  'safety',
  'payment',
  'incorrect_details',
  'fraud',
  'other',
] as const;

export type BookingReportCategory = (typeof BOOKING_REPORT_CATEGORIES)[number];

export const REPORT_DESCRIPTION_MAX = 2000;

export type ReportDescriptionValidation =
  | { ok: true; description: string }
  | { ok: false; reason: 'empty' | 'too_long' };

export function validateReportDescription(raw: string): ReportDescriptionValidation {
  const description = raw.trim();
  if (description === '') return { ok: false, reason: 'empty' };
  if (description.length > REPORT_DESCRIPTION_MAX) return { ok: false, reason: 'too_long' };
  return { ok: true, description };
}

export function remainingReportCharacters(raw: string): number {
  return REPORT_DESCRIPTION_MAX - raw.trim().length;
}

const CATEGORY_LABEL: Record<string, string> = {
  behavior: 'Behavior',
  'no-show': 'No-show',
  harassment: 'Harassment',
  safety: 'Safety',
  payment: 'Payment',
  incorrect_details: 'Incorrect details',
  fraud: 'Fraud',
  app_issue: 'App issue',
  other: 'Other',
};

export function formatReportCategory(category: string): string {
  return CATEGORY_LABEL[category] ?? 'Report';
}

export const REPORT_STATUSES = [
  'submitted',
  'under_review',
  'resolved',
  'dismissed',
] as const;

export type ReportStatus = (typeof REPORT_STATUSES)[number];

const STATUS_LABEL: Record<string, string> = {
  submitted: 'Submitted',
  under_review: 'Under review',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};

export function formatReportStatus(status: string): string {
  return STATUS_LABEL[status] ?? 'Report';
}

export type ReviewStatus = 'under_review' | 'resolved' | 'dismissed';

export function allowedReviewStatuses(status: string): ReviewStatus[] {
  if (status === 'submitted') return ['under_review', 'resolved', 'dismissed'];
  if (status === 'under_review') return ['resolved', 'dismissed'];
  return [];
}

export type AdminResponseValidation =
  | { ok: true; response: string | null }
  | { ok: false; reason: 'empty' | 'too_long' };

export function validateAdminResponse(targetStatus: string, raw: string): AdminResponseValidation {
  const response = raw.trim();
  if (response.length > REPORT_DESCRIPTION_MAX) return { ok: false, reason: 'too_long' };
  if (targetStatus === 'under_review') {
    return { ok: true, response: response === '' ? null : response };
  }
  if (response === '') return { ok: false, reason: 'empty' };
  return { ok: true, response };
}

export function isBookingReportableStatus(status: string): boolean {
  return status === 'confirmed' || status === 'completed' || status === 'cancelled';
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isReportId(value: string | null): value is string {
  return value !== null && UUID_PATTERN.test(value);
}

export function reportContextLabel(bookingId: string | null): string {
  return bookingId === null ? 'App issue' : 'Booking report';
}

/* ------------------------------------------------------------------ *
 * Error classification
 * ------------------------------------------------------------------ */

export class ReportError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null) {
    super(message);
    this.name = 'ReportError';
    this.code = code;
  }
}

const FORBIDDEN = '42501';
const INVALID_INPUT = '22023';
const CONFLICT = 'SM409';

export const COPY = {
  reportAction: 'Report',
  bookingTitle: 'Report',
  appIssueTitle: 'Report an app issue',
  myReportsTitle: 'My Reports',
  reportDetailsTitle: 'Report Details',
  adminReportsTitle: 'Reports',
  categoryLabel: 'Category',
  descriptionLabel: 'Description',
  descriptionPlaceholder: 'What happened?',
  submitBooking: 'Submit report',
  submitAppIssue: 'Submit app issue',
  submitting: 'Submitting…',
  emptyDescription: 'Enter a description between 1 and 2000 characters.',
  tooLongDescription: 'Description must be between 1 and 2000 characters.',
  bookingSubmittedTitle: 'Report submitted',
  bookingSubmitted: 'Your report was submitted.',
  appIssueSubmittedTitle: 'App issue submitted',
  appIssueSubmitted: 'Your app issue was submitted.',
  emptyMyReports: 'You have not submitted any reports yet.',
  loadFailed: 'Unable to load your reports. Please try again.',
  unavailable: 'This report is unavailable.',
  noAdminResponse: 'No response yet',
  adminLoadFailed: 'Unable to load reports. Please try again.',
  adminEmpty: 'No reports have been submitted.',
  adminDetailLoadFailed: 'Unable to load this report. Please try again.',
  responseLabel: 'Admin response',
  responsePlaceholder: 'Response to the reporter',
  responseRequired: 'Enter a response between 1 and 2000 characters.',
  responseTooLong: 'Admin response must be between 1 and 2000 characters.',
  markUnderReview: 'Mark under review',
  resolve: 'Resolve',
  dismiss: 'Dismiss',
  reviewing: 'Saving…',
  reviewSaved: 'Review saved.',
  bookingForbidden: "You don't have permission to submit this report.",
  bookingConflict: 'This report cannot be submitted right now.',
  bookingInvalid: 'Description must be between 1 and 2000 characters.',
  bookingGeneric: "We couldn't submit this report. Please try again.",
  appForbidden: "You don't have permission to submit an app issue.",
  appInvalid: 'Description must be between 1 and 2000 characters.',
  appGeneric: "We couldn't submit this app issue. Please try again.",
  reviewForbidden: "You don't have permission to review reports.",
  reviewInvalid: 'Check the review status and response and try again.',
  reviewConflict: 'This report is not available for review.',
  reviewGeneric: "We couldn't save this review. Please try again.",
  refreshFailed: 'That worked, but the report could not be refreshed. Pull down to refresh.',
  evidenceTitle: 'Historical Booking Messages',
  evidenceLoading: 'Loading messages…',
  evidenceEmpty: 'No messages were recorded for this booking.',
  evidenceWorker: 'Worker',
  evidenceClient: 'Client',
} as const;

function codeOf(e: unknown): string | null {
  return e instanceof ReportError ? e.code : null;
}

export function submitBookingErrorCopy(e: unknown): string {
  const code = codeOf(e);
  if (code === FORBIDDEN) return COPY.bookingForbidden;
  if (code === INVALID_INPUT) return COPY.bookingInvalid;
  if (code === CONFLICT) return COPY.bookingConflict;
  return COPY.bookingGeneric;
}

export function submitAppIssueErrorCopy(e: unknown): string {
  const code = codeOf(e);
  if (code === FORBIDDEN) return COPY.appForbidden;
  if (code === INVALID_INPUT) return COPY.appInvalid;
  return COPY.appGeneric;
}

export function loadMyReportsErrorCopy(_e: unknown): string {
  return COPY.loadFailed;
}

export function loadAdminReportsErrorCopy(e: unknown): string {
  const code = codeOf(e);
  if (code === FORBIDDEN) return COPY.reviewForbidden;
  return COPY.adminLoadFailed;
}

export function loadAdminReportErrorCopy(e: unknown): string {
  const code = codeOf(e);
  if (code === FORBIDDEN) return COPY.reviewForbidden;
  if (code === CONFLICT) return COPY.unavailable;
  return COPY.adminDetailLoadFailed;
}

export function reviewErrorCopy(e: unknown): string {
  const code = codeOf(e);
  if (code === FORBIDDEN) return COPY.reviewForbidden;
  if (code === INVALID_INPUT) return COPY.reviewInvalid;
  if (code === CONFLICT) return COPY.reviewConflict;
  return COPY.reviewGeneric;
}

/* ------------------------------------------------------------------ *
 * Row types and coercion
 * ------------------------------------------------------------------ */

export type MyReport = {
  id: string;
  booking_id: string | null;
  category: string;
  description: string;
  status: string;
  admin_response: string | null;
  reviewed_at: string | null;
  created_at: string | null;
};

export type AdminReportListRow = {
  report_id: string;
  reporter_id: string;
  reporter_full_name: string;
  reported_user_id: string | null;
  reported_full_name: string | null;
  booking_id: string | null;
  category: string;
  status: string;
  created_at: string | null;
};

export type AdminReportDetail = {
  report_id: string;
  reporter_id: string;
  reporter_full_name: string;
  reported_user_id: string | null;
  reported_full_name: string | null;
  booking_id: string | null;
  job_title: string | null;
  category: string;
  description: string;
  status: string;
  admin_response: string | null;
  reviewed_at: string | null;
  created_at: string | null;
};

function toNullableText(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

function toMyReport(row: unknown): MyReport | null {
  if (typeof row !== 'object' || row === null) return null;
  const r = row as Record<string, unknown>;
  const id = toNullableText(r.id);
  const category = toNullableText(r.category);
  const description = typeof r.description === 'string' ? r.description : null;
  const status = toNullableText(r.status);
  if (id === null || category === null || description === null || status === null) return null;
  return {
    id,
    booking_id: toNullableText(r.booking_id),
    category,
    description,
    status,
    admin_response: toNullableText(r.admin_response),
    reviewed_at: toNullableText(r.reviewed_at),
    created_at: toNullableText(r.created_at),
  };
}

function toAdminListRow(row: unknown): AdminReportListRow | null {
  if (typeof row !== 'object' || row === null) return null;
  const r = row as Record<string, unknown>;
  const reportId = toNullableText(r.report_id);
  const reporterId = toNullableText(r.reporter_id);
  const reporterName = toNullableText(r.reporter_full_name);
  const category = toNullableText(r.category);
  const status = toNullableText(r.status);
  if (
    reportId === null ||
    reporterId === null ||
    reporterName === null ||
    category === null ||
    status === null
  ) {
    return null;
  }
  return {
    report_id: reportId,
    reporter_id: reporterId,
    reporter_full_name: reporterName,
    reported_user_id: toNullableText(r.reported_user_id),
    reported_full_name: toNullableText(r.reported_full_name),
    booking_id: toNullableText(r.booking_id),
    category,
    status,
    created_at: toNullableText(r.created_at),
  };
}

function toAdminDetail(row: unknown): AdminReportDetail | null {
  if (typeof row !== 'object' || row === null) return null;
  const r = row as Record<string, unknown>;
  const reportId = toNullableText(r.report_id);
  const reporterId = toNullableText(r.reporter_id);
  const reporterName = toNullableText(r.reporter_full_name);
  const category = toNullableText(r.category);
  const description = typeof r.description === 'string' ? r.description : null;
  const status = toNullableText(r.status);
  if (
    reportId === null ||
    reporterId === null ||
    reporterName === null ||
    category === null ||
    description === null ||
    status === null
  ) {
    return null;
  }
  return {
    report_id: reportId,
    reporter_id: reporterId,
    reporter_full_name: reporterName,
    reported_user_id: toNullableText(r.reported_user_id),
    reported_full_name: toNullableText(r.reported_full_name),
    booking_id: toNullableText(r.booking_id),
    job_title: toNullableText(r.job_title),
    category,
    description,
    status,
    admin_response: toNullableText(r.admin_response),
    reviewed_at: toNullableText(r.reviewed_at),
    created_at: toNullableText(r.created_at),
  };
}

function throwRpcError(error: { message?: string; code?: string } | null): never {
  throw new ReportError(error?.message || 'The request failed.', error?.code ?? null);
}

/* ------------------------------------------------------------------ *
 * Server calls
 * ------------------------------------------------------------------ */

export async function loadMyReports(): Promise<MyReport[]> {
  const res = await supabase
    .from('reports')
    .select('id, booking_id, category, description, status, admin_response, reviewed_at, created_at')
    .order('created_at', { ascending: false });

  if (res.error) {
    throw new ReportError(res.error.message || 'The request failed.', res.error.code ?? null);
  }
  const rows = Array.isArray(res.data) ? res.data : [];
  return rows.map(toMyReport).filter((row): row is MyReport => row !== null);
}

export async function submitBookingReport(
  bookingId: string,
  category: BookingReportCategory,
  description: string
): Promise<void> {
  const res = await supabase.rpc('submit_my_booking_report', {
    p_booking_id: bookingId,
    p_category: category,
    p_description: description,
  });
  if (res.error) throwRpcError(res.error);
}

export async function submitAppIssue(description: string): Promise<void> {
  const res = await supabase.rpc('submit_my_app_issue', { p_description: description });
  if (res.error) throwRpcError(res.error);
}

export async function loadAdminReports(): Promise<AdminReportListRow[]> {
  const res = await supabase.rpc('list_reports');
  if (res.error) throwRpcError(res.error);
  const rows = Array.isArray(res.data) ? res.data : [];
  return rows.map(toAdminListRow).filter((row): row is AdminReportListRow => row !== null);
}

export async function loadAdminReport(reportId: string): Promise<AdminReportDetail> {
  const res = await supabase.rpc('get_report', { p_report_id: reportId });
  if (res.error) throwRpcError(res.error);
  const rows = Array.isArray(res.data) ? res.data : [];
  const detail = rows.length > 0 ? toAdminDetail(rows[0]) : null;
  if (detail === null) {
    throw new ReportError('this report is not available', CONFLICT);
  }
  return detail;
}

export type ReportBookingMessage = {
  message_id: string;
  sender_role: 'worker' | 'client';
  content: string;
  created_at: string | null;
};

function toEvidenceRow(row: unknown): ReportBookingMessage | null {
  if (typeof row !== 'object' || row === null) return null;
  const r = row as Record<string, unknown>;
  const messageId = toNullableText(r.message_id);
  const senderRole = toNullableText(r.sender_role);
  const content = typeof r.content === 'string' ? r.content : null;
  if (messageId === null || content === null || (senderRole !== 'worker' && senderRole !== 'client')) {
    return null;
  }
  return {
    message_id: messageId,
    sender_role: senderRole,
    content,
    created_at: toNullableText(r.created_at),
  };
}

export async function loadReportBookingMessages(reportId: string): Promise<ReportBookingMessage[]> {
  const res = await supabase.rpc('get_report_booking_messages', { p_report_id: reportId });
  if (res.error) throwRpcError(res.error);
  const rows = Array.isArray(res.data) ? res.data : [];
  return rows.map(toEvidenceRow).filter((row): row is ReportBookingMessage => row !== null);
}

export async function reviewReport(
  reportId: string,
  status: ReviewStatus,
  adminResponse: string | null
): Promise<void> {
  const res = await supabase.rpc('review_report', {
    p_report_id: reportId,
    p_status: status,
    p_admin_response: adminResponse,
  });
  if (res.error) throwRpcError(res.error);
}
