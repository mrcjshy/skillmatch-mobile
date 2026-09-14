/**
 * R5D-1 / R5D-IMG-M1C — Worker portfolio. Own-row list / insert / delete.
 *
 * Ownership is `portfolio_items.worker_id` → `worker_profiles.id`.
 * `users.id` is never written as `worker_id` and is never a Storage folder.
 * `image_url` and `badge_level` are never selected or written.
 * Matching and verification are untouched. Resume remains text-only.
 */

import {
  PORTFOLIO_BUCKET,
  PORTFOLIO_SIGNED_URL_EXPIRES_IN,
  buildImageMetadataRows,
  exactObjectCleanupPaths,
  loadValidatedLocalImage,
  logPortfolioImageFailure,
  newPortfolioImageId,
  recordExactUploadedPath,
  validateImageCount,
  type PortfolioImageMetadataInsert,
  type PortfolioImageStage,
  type ValidatedImageBytes,
} from './portfolio-images';
import { supabase } from './supabase';

export const PORTFOLIO_PATH = '/worker/portfolio';
export const PORTFOLIO_TITLE_MAX = 150;

export const PROJECT_SCALES = ['small', 'medium', 'large'] as const;
export type ProjectScale = (typeof PROJECT_SCALES)[number];

export const PROJECT_SCALE_OPTIONS: { value: ProjectScale; label: string }[] = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
];

export const PORTFOLIO_INSERT_KEYS = ['description', 'project_scale', 'title', 'worker_id'] as const;

export const PORTFOLIO_INSERT_FORBIDDEN_FIELDS = [
  'image_url',
  'badge_level',
  'is_verified',
  'verified_by',
  'rating_avg',
  'strike_count',
  'id',
  'user_id',
  'skill_id',
  'job_id',
] as const;

export const PORTFOLIO_COPY = {
  title: 'Portfolio',
  heading: 'Portfolio',
  helper: 'Projects you add here can appear in your generated resume.',
  empty: 'No portfolio items yet.',
  add: 'Add Portfolio Item',
  titleLabel: 'Title',
  descriptionLabel: 'Description (optional)',
  scaleLabel: 'Project scale',
  photosLabel: 'Photos (optional)',
  addPhotos: 'Add photos',
  choosePhotos: 'Choose photos',
  cover: 'Cover',
  removePhoto: 'Remove photo',
  photosDenied: 'Photo library access is needed to attach project images.',
  photosUnavailable: 'Photos could not be opened. Please try again.',
  imageUnavailable: 'Photo could not be loaded.',
  save: 'Save',
  saving: 'Saving…',
  saved: 'Portfolio item saved.',
  savedRefreshFailed:
    'Project saved, but the list could not be refreshed. Try again to reload rather than saving again.',
  rolledBack: 'The project could not be saved. Please try again.',
  needsReconciliation:
    'The project may not have saved completely. Please try again, and do not assume it was removed.',
  delete: 'Delete',
  deleting: 'Deleting…',
  deleted: 'Portfolio item deleted.',
  deleteTitle: 'Delete this project?',
  deleteBody: 'This removes the project from your portfolio.',
  dismiss: 'Cancel',
  loading: 'Loading your portfolio…',
  retry: 'Try again',
  loadFailed: 'Your portfolio could not be loaded. Please try again.',
  saveFailed: 'The project could not be saved. Please try again.',
  deleteFailed: 'The project could not be deleted. Please try again.',
  noProfile:
    'You have not set up your Worker profile yet. Add your About Me and skills on Profile first.',
  emptyTitle: 'Please enter a title.',
  titleTooLong: 'Title must be at most 150 characters.',
  invalidScale: 'Please choose a project scale.',
  tooManyImages: 'You can attach at most 5 photos.',
  imageTooLarge: 'Each photo must be 5 MB or smaller.',
  unsupportedImage: 'Use JPEG, PNG, or WebP photos only.',
  emptyImage: 'A selected photo was empty. Please choose another.',
  imageReadFailed: 'A selected photo could not be read. Please try again.',
} as const;

export type PortfolioInsertDraft = {
  workerId: string;
  title: string;
  description: string;
  projectScale: string;
};

export type PortfolioInsertPayload = {
  worker_id: string;
  title: string;
  description: string | null;
  project_scale: ProjectScale;
};

export type PortfolioInsertResult =
  | { ok: true; payload: PortfolioInsertPayload }
  | { ok: false; reason: 'empty_title' | 'title_too_long' | 'invalid_scale' | 'missing_worker' };

export type PortfolioDraftImage = {
  uri: string;
};

export type PortfolioImage = {
  id: string;
  portfolioItemId: string;
  storagePath: string;
  position: number;
  createdAt: string | null;
};

export type PortfolioItemImage = PortfolioImage & {
  signedUrl: string | null;
};

export type PortfolioItem = {
  id: string;
  workerId: string;
  title: string;
  description: string | null;
  projectScale: ProjectScale;
  createdAt: string | null;
  images: PortfolioItemImage[];
};

export type OwnPortfolioLoad =
  | { kind: 'no-profile' }
  | { kind: 'ready'; workerProfileId: string; items: PortfolioItem[] };

export type CreateOwnPortfolioInput = {
  accountId: string;
  title: string;
  description: string;
  projectScale: string;
  images?: readonly PortfolioDraftImage[];
};

export type CreatePortfolioResult =
  | { status: 'success'; workerProfileId: string; items: PortfolioItem[] }
  | { status: 'validation_failed'; message: string }
  | { status: 'rolled_back'; message: string }
  | { status: 'needs_reconciliation'; message: string }
  | { status: 'saved_refresh_failed'; message: string };

export type DeletePortfolioResult =
  | { status: 'success' }
  | { status: 'retryable_failure'; message: string }
  | { status: 'needs_reconciliation'; message: string };

export class PortfolioError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null) {
    super(message);
    this.name = 'PortfolioError';
    this.code = code;
  }
}

function isProjectScale(value: unknown): value is ProjectScale {
  return value === 'small' || value === 'medium' || value === 'large';
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function isPosition(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5;
}

export function buildPortfolioInsertPayload(draft: PortfolioInsertDraft): PortfolioInsertResult {
  if (typeof draft.workerId !== 'string' || draft.workerId === '') {
    return { ok: false, reason: 'missing_worker' };
  }

  const title = draft.title.trim();
  if (title === '') return { ok: false, reason: 'empty_title' };
  if (title.length > PORTFOLIO_TITLE_MAX) return { ok: false, reason: 'title_too_long' };

  if (!isProjectScale(draft.projectScale)) return { ok: false, reason: 'invalid_scale' };

  return {
    ok: true,
    payload: {
      worker_id: draft.workerId,
      title,
      description: text(draft.description),
      project_scale: draft.projectScale,
    },
  };
}

export function insertFailureCopy(reason: Exclude<PortfolioInsertResult, { ok: true }>['reason']): string {
  if (reason === 'empty_title') return PORTFOLIO_COPY.emptyTitle;
  if (reason === 'title_too_long') return PORTFOLIO_COPY.titleTooLong;
  if (reason === 'invalid_scale') return PORTFOLIO_COPY.invalidScale;
  return PORTFOLIO_COPY.saveFailed;
}

export function imageValidationCopy(
  reason: 'too_many' | 'empty' | 'too_large' | 'unsupported_type' | 'read_failed'
): string {
  if (reason === 'too_many') return PORTFOLIO_COPY.tooManyImages;
  if (reason === 'too_large') return PORTFOLIO_COPY.imageTooLarge;
  if (reason === 'unsupported_type') return PORTFOLIO_COPY.unsupportedImage;
  if (reason === 'empty') return PORTFOLIO_COPY.emptyImage;
  return PORTFOLIO_COPY.imageReadFailed;
}

function toPortfolioItem(row: unknown): Omit<PortfolioItem, 'images'> | null {
  if (typeof row !== 'object' || row === null) return null;
  const r = row as Record<string, unknown>;
  const id = typeof r.id === 'string' && r.id !== '' ? r.id : null;
  const workerId = typeof r.worker_id === 'string' && r.worker_id !== '' ? r.worker_id : null;
  const title = text(r.title);
  if (id === null || workerId === null || title === null || !isProjectScale(r.project_scale)) {
    return null;
  }
  return {
    id,
    workerId,
    title,
    description: text(r.description),
    projectScale: r.project_scale,
    createdAt: typeof r.created_at === 'string' ? r.created_at : null,
  };
}

function toPortfolioImage(row: unknown): PortfolioImage | null {
  if (typeof row !== 'object' || row === null) return null;
  const r = row as Record<string, unknown>;
  const id = typeof r.id === 'string' && r.id !== '' ? r.id : null;
  const portfolioItemId =
    typeof r.portfolio_item_id === 'string' && r.portfolio_item_id !== '' ? r.portfolio_item_id : null;
  const storagePath = typeof r.storage_path === 'string' && r.storage_path !== '' ? r.storage_path : null;
  if (id === null || portfolioItemId === null || storagePath === null || !isPosition(r.position)) {
    return null;
  }
  return {
    id,
    portfolioItemId,
    storagePath,
    position: r.position,
    createdAt: typeof r.created_at === 'string' ? r.created_at : null,
  };
}

function sortOwnItems(items: PortfolioItem[]): PortfolioItem[] {
  return [...items].sort(
    (a, b) => compareText(b.createdAt ?? '', a.createdAt ?? '') || compareText(b.id, a.id)
  );
}

function sortImages(images: PortfolioImage[]): PortfolioImage[] {
  return [...images].sort((a, b) => a.position - b.position || compareText(a.id, b.id));
}

async function resolveOwnWorkerProfileId(accountId: string): Promise<string | null> {
  const res = await supabase
    .from('worker_profiles')
    .select('id')
    .eq('user_id', accountId)
    .maybeSingle();
  if (res.error) throw new PortfolioError('profile read failed', res.error.code ?? null);
  return typeof res.data?.id === 'string' && res.data.id !== '' ? res.data.id : null;
}

async function attachSignedUrls(images: PortfolioImage[]): Promise<PortfolioItemImage[]> {
  if (images.length === 0) return [];
  const paths = images.map((image) => image.storagePath);
  const signed = await supabase.storage
    .from(PORTFOLIO_BUCKET)
    .createSignedUrls(paths, PORTFOLIO_SIGNED_URL_EXPIRES_IN);
  const byPath = new Map<string, string | null>();
  if (signed.error || !Array.isArray(signed.data)) {
    logPortfolioImageFailure('signed_url', signed.error ?? { message: 'signed url response missing' });
    for (const image of images) byPath.set(image.storagePath, null);
  } else {
    for (const row of signed.data) {
      const path = typeof row.path === 'string' ? row.path : '';
      const url =
        typeof row.signedUrl === 'string' && row.signedUrl !== '' && row.error == null
          ? row.signedUrl
          : null;
      if (path !== '') byPath.set(path, url);
    }
  }
  return images.map((image) => ({
    ...image,
    signedUrl: byPath.get(image.storagePath) ?? null,
  }));
}

async function loadImagesForItems(itemIds: string[]): Promise<Map<string, PortfolioItemImage[]>> {
  const grouped = new Map<string, PortfolioItemImage[]>();
  if (itemIds.length === 0) return grouped;

  const res = await supabase
    .from('portfolio_item_images')
    .select('id, portfolio_item_id, storage_path, position, created_at')
    .in('portfolio_item_id', itemIds)
    .order('position', { ascending: true });
  if (res.error) throw new PortfolioError('portfolio image read failed', res.error.code ?? null);

  const metadata = sortImages(
    (res.data ?? []).map(toPortfolioImage).filter((image): image is PortfolioImage => image !== null)
  );
  const displayed = await attachSignedUrls(metadata);
  for (const image of displayed) {
    const current = grouped.get(image.portfolioItemId) ?? [];
    current.push(image);
    grouped.set(image.portfolioItemId, current);
  }
  return grouped;
}

export async function loadOwnPortfolio(accountId: string): Promise<OwnPortfolioLoad> {
  const workerProfileId = await resolveOwnWorkerProfileId(accountId);
  if (workerProfileId === null) return { kind: 'no-profile' };

  const res = await supabase
    .from('portfolio_items')
    .select('id, worker_id, title, description, project_scale, created_at')
    .eq('worker_id', workerProfileId)
    .order('created_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false });
  if (res.error) throw new PortfolioError('portfolio read failed', res.error.code ?? null);

  const baseItems = (res.data ?? [])
    .map(toPortfolioItem)
    .filter((item): item is Omit<PortfolioItem, 'images'> => item !== null && item.workerId === workerProfileId);

  const imagesByItem = await loadImagesForItems(baseItems.map((item) => item.id));

  const items = sortOwnItems(
    baseItems.map((item) => ({
      ...item,
      images: imagesByItem.get(item.id) ?? [],
    }))
  );
  return { kind: 'ready', workerProfileId, items };
}

async function compensatingCleanup(
  workerProfileId: string,
  itemId: string,
  uploadedPaths: readonly string[]
): Promise<'rolled_back' | 'needs_reconciliation'> {
  if (uploadedPaths.length > 0) {
    const paths = exactObjectCleanupPaths(uploadedPaths);
    const removed = await supabase.storage.from(PORTFOLIO_BUCKET).remove(paths);
    if (removed.error) {
      logPortfolioImageFailure('cleanup_storage', removed.error);
      return 'needs_reconciliation';
    }
  }

  const deleted = await supabase
    .from('portfolio_items')
    .delete()
    .eq('id', itemId)
    .eq('worker_id', workerProfileId);
  if (deleted.error) {
    logPortfolioImageFailure('cleanup_parent', deleted.error);
    return 'needs_reconciliation';
  }
  return 'rolled_back';
}

function writeFailureResult(
  outcome: 'rolled_back' | 'needs_reconciliation'
): Extract<CreatePortfolioResult, { status: 'rolled_back' | 'needs_reconciliation' }> {
  return {
    status: outcome,
    message: outcome === 'rolled_back' ? PORTFOLIO_COPY.rolledBack : PORTFOLIO_COPY.needsReconciliation,
  };
}

async function abortImageWrite(
  stage: PortfolioImageStage,
  error: unknown,
  workerProfileId: string,
  itemId: string,
  uploadedPaths: readonly string[]
): Promise<Extract<CreatePortfolioResult, { status: 'rolled_back' | 'needs_reconciliation' }>> {
  logPortfolioImageFailure(stage, error);
  return writeFailureResult(await compensatingCleanup(workerProfileId, itemId, uploadedPaths));
}

async function reloadAfterWrite(
  accountId: string
): Promise<Extract<CreatePortfolioResult, { status: 'success' | 'saved_refresh_failed' }>> {
  try {
    const loaded = await loadOwnPortfolio(accountId);
    if (loaded.kind !== 'ready') {
      logPortfolioImageFailure('authoritative_reload', { message: 'portfolio reload was not ready' });
      return { status: 'saved_refresh_failed', message: PORTFOLIO_COPY.savedRefreshFailed };
    }
    return { status: 'success', workerProfileId: loaded.workerProfileId, items: loaded.items };
  } catch (error) {
    logPortfolioImageFailure('authoritative_reload', error);
    return { status: 'saved_refresh_failed', message: PORTFOLIO_COPY.savedRefreshFailed };
  }
}

export async function createOwnPortfolioItem(input: CreateOwnPortfolioInput): Promise<CreatePortfolioResult> {
  const images = input.images ?? [];
  const textCheck = buildPortfolioInsertPayload({
    workerId: 'pending',
    title: input.title,
    description: input.description,
    projectScale: input.projectScale,
  });
  if (!textCheck.ok) {
    return { status: 'validation_failed', message: insertFailureCopy(textCheck.reason) };
  }

  const counted = validateImageCount(images.length);
  if (!counted.ok) {
    return { status: 'validation_failed', message: imageValidationCopy('too_many') };
  }

  const validated: ValidatedImageBytes[] = [];
  for (const image of images) {
    const loaded = await loadValidatedLocalImage(image.uri);
    if (!loaded.ok) {
      return { status: 'validation_failed', message: imageValidationCopy(loaded.reason) };
    }
    validated.push(loaded.image);
  }

  let workerProfileId: string | null;
  try {
    workerProfileId = await resolveOwnWorkerProfileId(input.accountId);
  } catch {
    return { status: 'validation_failed', message: PORTFOLIO_COPY.saveFailed };
  }
  if (workerProfileId === null) {
    return { status: 'validation_failed', message: PORTFOLIO_COPY.noProfile };
  }

  const built = buildPortfolioInsertPayload({
    workerId: workerProfileId,
    title: input.title,
    description: input.description,
    projectScale: input.projectScale,
  });
  if (!built.ok) {
    return { status: 'validation_failed', message: insertFailureCopy(built.reason) };
  }

  const inserted = await supabase.from('portfolio_items').insert(built.payload).select('id').single();
  const itemId =
    !inserted.error && typeof inserted.data?.id === 'string' && inserted.data.id !== ''
      ? inserted.data.id
      : null;
  if (itemId === null) {
    logPortfolioImageFailure('item_insert', inserted.error ?? { message: 'missing portfolio item id' });
    return inserted.error
      ? { status: 'rolled_back', message: PORTFOLIO_COPY.saveFailed }
      : { status: 'needs_reconciliation', message: PORTFOLIO_COPY.needsReconciliation };
  }

  if (validated.length === 0) {
    return reloadAfterWrite(input.accountId);
  }

  let imageIds: string[];
  try {
    imageIds = validated.map(() => newPortfolioImageId());
  } catch (error) {
    return abortImageWrite('image_id', error, workerProfileId, itemId, []);
  }

  let rows: PortfolioImageMetadataInsert[];
  try {
    rows = buildImageMetadataRows({
      workerProfileId,
      portfolioItemId: itemId,
      images: validated.map((image, index) => ({
        id: imageIds[index] ?? '',
        ext: image.ext,
      })),
    });
  } catch (error) {
    return abortImageWrite('image_id', error, workerProfileId, itemId, []);
  }

  let uploadedPaths: string[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const image = validated[index];
    if (row === undefined || image === undefined) {
      return abortImageWrite(
        'storage_upload',
        { message: 'image row mismatch' },
        workerProfileId,
        itemId,
        uploadedPaths
      );
    }
    let uploaded: { error: unknown };
    try {
      uploaded = await supabase.storage.from(PORTFOLIO_BUCKET).upload(row.storage_path, image.bytes, {
        upsert: false,
        contentType: image.mime,
      });
    } catch (error) {
      return abortImageWrite('storage_upload', error, workerProfileId, itemId, uploadedPaths);
    }
    if (uploaded.error) {
      return abortImageWrite('storage_upload', uploaded.error, workerProfileId, itemId, uploadedPaths);
    }
    uploadedPaths = recordExactUploadedPath(uploadedPaths, row.storage_path);
  }

  let metadata: { error: unknown };
  try {
    metadata = await supabase.from('portfolio_item_images').insert(rows);
  } catch (error) {
    return abortImageWrite('metadata_insert', error, workerProfileId, itemId, uploadedPaths);
  }
  if (metadata.error) {
    return abortImageWrite('metadata_insert', metadata.error, workerProfileId, itemId, uploadedPaths);
  }

  return reloadAfterWrite(input.accountId);
}

export async function deleteOwnPortfolioItem(
  workerProfileId: string,
  itemId: string
): Promise<DeletePortfolioResult> {
  if (workerProfileId === '' || itemId === '') {
    return { status: 'retryable_failure', message: PORTFOLIO_COPY.deleteFailed };
  }

  const metadata = await supabase
    .from('portfolio_item_images')
    .select('storage_path')
    .eq('portfolio_item_id', itemId)
    .order('position', { ascending: true });
  if (metadata.error) {
    return { status: 'retryable_failure', message: PORTFOLIO_COPY.deleteFailed };
  }

  const paths = (metadata.data ?? [])
    .map((row) => (typeof row.storage_path === 'string' ? row.storage_path : null))
    .filter((path): path is string => path !== null && path !== '');

  if (paths.length > 0) {
    const removed = await supabase.storage.from(PORTFOLIO_BUCKET).remove(exactObjectCleanupPaths(paths));
    if (removed.error) {
      return { status: 'retryable_failure', message: PORTFOLIO_COPY.deleteFailed };
    }
  }

  const deleted = await supabase
    .from('portfolio_items')
    .delete()
    .eq('id', itemId)
    .eq('worker_id', workerProfileId);
  if (deleted.error) {
    return paths.length > 0
      ? { status: 'needs_reconciliation', message: PORTFOLIO_COPY.needsReconciliation }
      : { status: 'retryable_failure', message: PORTFOLIO_COPY.deleteFailed };
  }
  return { status: 'success' };
}

export function projectScaleLabel(scale: ProjectScale): string {
  return PROJECT_SCALE_OPTIONS.find((option) => option.value === scale)?.label ?? scale;
}

export function portfolioPhotoCountLabel(count: number): string {
  return `${count}/5`;
}
