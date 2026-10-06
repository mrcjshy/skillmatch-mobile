import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { SessionContextValue } from '@/providers/session-provider';
import type { AccountContextValue } from '@/providers/account-provider';
import type { JobPhotoDraft } from '@/components/job-photo-picker';
import type { JobPin } from '@/lib/job-location';
import type { JobPaymentMethod } from '@/lib/job-payment';
import type { PostJobWizardStep } from '@/lib/post-job-wizard';

export type FeePreset = 300 | 500 | 1000 | 1500 | 'custom' | null;
export type ClientPostJobDraft = {
  description: string; address: string; pin: JobPin | null; locationNote: string | null;
  scheduleDate: Date | null; scheduleTime: Date | null; budgetText: string; feePreset: FeePreset;
  paymentMethod: JobPaymentMethod | null; primarySkillId: string | null; additionalSkillIds: string[];
  skillsModalMode: 'primary' | 'additional'; modalQuery: string; modalPrimaryId: string | null;
  modalAdditionalIds: string[]; jobPhotos: JobPhotoDraft[]; photoError: string | null;
  wizardStep: PostJobWizardStep; postError: string | null; postSuccess: string | null;
};
export type ClientPostJobOperation = Readonly<{ ownerId: string; generation: number; id: number; draft: ClientPostJobDraft }>;
type DraftUpdate = Partial<ClientPostJobDraft> | ((draft: ClientPostJobDraft) => Partial<ClientPostJobDraft>);
export type ClientPostJobDraftContextValue = {
  ownerId: string; draft: ClientPostJobDraft; isPosting: boolean; draftEpoch: number;
  isOwnerCurrent: () => boolean; updateDraft: (update: DraftUpdate) => boolean;
  beginPost: () => ClientPostJobOperation | null; isOperationCurrent: (operation: ClientPostJobOperation) => boolean;
  recordCreatedJob: (operation: ClientPostJobOperation, id: string) => boolean;
  markCreateDispatched: (operation: ClientPostJobOperation) => boolean;
  recordCreateFailure: (operation: ClientPostJobOperation, error: string, known?: boolean) => boolean;
  failPost: (operation: ClientPostJobOperation, error: string) => boolean;
  settlePost: (operation: ClientPostJobOperation, result: { success: string; error: string | null }) => boolean;
  finishPost: (operation: ClientPostJobOperation) => boolean; takePendingCreatedJob: () => string | null;
};
function initialDraft(): ClientPostJobDraft {
  return { description: '', address: '', pin: null, locationNote: null, scheduleDate: null, scheduleTime: null,
    budgetText: '', feePreset: null, paymentMethod: null, primarySkillId: null, additionalSkillIds: [],
    skillsModalMode: 'additional', modalQuery: '', modalPrimaryId: null, modalAdditionalIds: [],
    jobPhotos: [], photoError: null, wizardStep: 1, postError: null, postSuccess: null };
}
function copyDraft(draft: ClientPostJobDraft): ClientPostJobDraft {
  return { ...draft, pin: draft.pin && { ...draft.pin }, scheduleDate: draft.scheduleDate && new Date(draft.scheduleDate),
    scheduleTime: draft.scheduleTime && new Date(draft.scheduleTime), additionalSkillIds: [...draft.additionalSkillIds],
    modalAdditionalIds: [...draft.modalAdditionalIds], jobPhotos: draft.jobPhotos.map(photo => ({ ...photo })) };
}
/** Memory-only account owner. Its synchronous latch is independent of React rendering. */
export function createClientPostJobDraftOwner(ownerId: string, onChange = () => {}, isAuthorized = () => true, isRetained?: () => boolean) {
  let disposed = false, invalidated = false, generation = 0, nextId = 0, epoch = 0;
  let draft = initialDraft(), operation: ClientPostJobOperation | null = null;
  let createdId: string | null = null, pendingId: string | null = null, settled = false, revision = 0;
  let canceled = false, dispatched = false, pendingCreate: ClientPostJobOperation | null = null;
  let canceledFailure: string | null = null;
  let indeterminate = false;
  let suspended = false;
  const listeners = new Set<() => void>();
  const authorized = () => {
    if (disposed || invalidated) return false;
    try { return (!isRetained || isRetained()) && isAuthorized(); } catch { return false; }
  };
  const isOwnerCurrent = () => {
    // Retained-owner access is also queried by screen render; observation is pure.
    if (isRetained) return authorized();
    if (disposed || invalidated) return false;
    try {
      if (isAuthorized()) {
        return true;
      }
    } catch { /* Fail closed without exposing guard errors. */ }
    invalidated = true;
    return false;
  };
  const isOperationCurrent = (candidate: ClientPostJobOperation) => {
    if (!isOwnerCurrent()) {
      if (isRetained) {
        if (!isRetained()) owner.dispose();
        else owner.suspend();
      }
      return false;
    }
    return operation === candidate;
  };
  const changed = () => { revision++; onChange(); for (const listener of listeners) listener(); };
  const owner = {
    ownerId,
    get draft() { return authorized() ? draft : initialDraft(); }, get isPosting() { return authorized() && (operation !== null || pendingCreate !== null); }, get draftEpoch() { return epoch; },
    isOwnerCurrent, isOperationCurrent,
    suspend() {
      if (disposed || suspended) return;
      suspended = true; canceled = true;
      if (dispatched && createdId === null && operation !== null) pendingCreate = operation;
      operation = null; changed();
    },
    revalidate() {
      if (!isOwnerCurrent()) {
        if (isRetained) {
          if (!isRetained()) owner.dispose();
          else owner.suspend();
        }
        return false;
      }
      let publish = suspended;
      suspended = false;
      if (canceled && pendingCreate === null && createdId !== null && !settled) {
        pendingId = createdId; createdId = null; settled = true;
        draft = { ...initialDraft(), postSuccess: 'Job posted. Photo upload completion is unknown. Check My Posted Jobs.', postError: null };
        epoch++; publish = true;
      } else if (canceledFailure !== null) {
        draft = { ...draft, postError: canceledFailure }; canceledFailure = null; publish = true;
      }
      if (publish) changed();
      return true;
    },
    updateDraft(update: DraftUpdate) {
      if (!isOwnerCurrent() || operation || pendingCreate || indeterminate) return false;
      const next = copyDraft({ ...draft, ...(typeof update === 'function' ? update(copyDraft(draft)) : update) });
      // Settlement has already reset the form. Keep its receipt through neutral UI
      // updates; meaningful input (including a working skill choice) starts the next draft.
      if (draft.postSuccess && (next.description.trim() || next.modalQuery.trim() ||
        next.primarySkillId || next.additionalSkillIds.length || next.modalPrimaryId || next.modalAdditionalIds.length ||
        next.wizardStep > 1 || next.address.trim() || next.pin || next.scheduleDate || next.scheduleTime ||
        next.budgetText.trim() || next.feePreset !== null || next.paymentMethod || next.jobPhotos.length)) next.postSuccess = null;
      draft = next;
      changed(); return true;
    },
    beginPost() {
      owner.revalidate();
      if (!isOwnerCurrent() || operation || pendingCreate || indeterminate || createdId !== null || draft.wizardStep !== 4) return null;
      operation = { ownerId, generation, id: ++nextId, draft: copyDraft(draft) };
      createdId = null; settled = false; canceled = false; dispatched = false; draft = { ...draft, postError: null, postSuccess: null }; changed(); return operation;
    },
    markCreateDispatched(candidate: ClientPostJobOperation) {
      if (!isOperationCurrent(candidate)) return false;
      dispatched = true; return true;
    },
    recordCreatedJob(candidate: ClientPostJobOperation, id: string) {
      const current = isOperationCurrent(candidate);
      if (!current && (!isRetained || disposed || invalidated || !isRetained() || pendingCreate !== candidate)) return false;
      if (createdId !== null || !id) return false;
      createdId = id; pendingCreate = null;
      if (current) return true;
      // Only immutable create outcome is recorded; no visible settlement while suspended.
      if (owner.revalidate()) changed();
      return true;
    },
    recordCreateFailure(candidate: ClientPostJobOperation, error: string, known = true) {
      const current = isOperationCurrent(candidate);
      if (!current && (!isRetained || disposed || invalidated || !isRetained() || pendingCreate !== candidate)) return false;
      indeterminate = !known;
      if (current) return owner.failPost(candidate, error);
      pendingCreate = null; canceledFailure = error;
      if (owner.revalidate()) changed();
      return true;
    },
    failPost(candidate: ClientPostJobOperation, error: string) {
      if (!isOperationCurrent(candidate) || createdId !== null) return false;
      draft = { ...draft, postError: error }; changed(); return true;
    },
    settlePost(candidate: ClientPostJobOperation, result: { success: string; error: string | null }) {
      if (!isOperationCurrent(candidate) || createdId === null || settled) return false;
      settled = true; pendingId = createdId; draft = { ...initialDraft(), postSuccess: result.success, postError: result.error };
      epoch++; changed(); return true;
    },
    finishPost(candidate: ClientPostJobOperation) {
      if (!isOperationCurrent(candidate)) return false;
      operation = null;
      // An unexpected post-creation interruption must never reopen creation.
      if (settled) createdId = null;
      changed(); return true;
    },
    takePendingCreatedJob() {
      owner.revalidate();
      if (!isOwnerCurrent()) return null;
      const id = pendingId; pendingId = null; return id;
    },
    dispose() { if (disposed) return; disposed = true; generation++; epoch++; operation = null; pendingCreate = null; createdId = null; pendingId = null; canceledFailure = null; indeterminate = false; draft = initialDraft(); changed(); },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    snapshot() { return revision; },
    activate() { disposed = false; },
  };
  return owner;
}
const DraftContext = createContext<ClientPostJobDraftContextValue | undefined>(undefined);
/** Private memory survives route removal. Only local lifecycle notifications;
 * no service loader, Auth SDK subscription, database/Storage reader or watcher. */
export function ClientPostJobDraftMemoryProvider({ children, session, account }: { children: ReactNode; session: SessionContextValue; account: AccountContextValue }) {
  // React Compiler would memoise the spread context value on the stable owner object, so draft changes
  // never reached consumers (typed text and skill choices were dropped). Keep this component uncompiled.
  'use no memo';
  const [memory] = useState(() => {
    let authority: { session: SessionContextValue; account: AccountContextValue } | null = null;
    return {
      observe(nextSession: SessionContextValue, nextAccount: AccountContextValue) { authority = { session: nextSession, account: nextAccount }; },
      authority() { return authority; },
    };
  });
  const emptySubscribe = () => () => {};
  const termination = account.clientDraftTermination;
  const terminationEpoch = useSyncExternalStore(termination?.subscribe ?? emptySubscribe, termination?.snapshot ?? (() => 0), termination?.snapshot ?? (() => 0));
  const lifetime = session.sessionLifetime;
  const subscribeSessionLifecycle = session.subscribeSessionLifecycle;
  const owner = useMemo(() => {
    if (!lifetime) return undefined;
    const isRetained = () => lifetime.isCurrent() && (termination?.snapshot() ?? 0) === terminationEpoch;
    const isAuthorized = () => {
      const authority = memory.authority();
      if (!authority) return false;
      const { session: s, account: a } = authority;
      return isRetained() && s.sessionLifetime === lifetime && s.recoveryStatus === 'idle' && !s.isSessionLoading && !s.sessionError &&
        (s.isSessionRevisionCurrent?.(s.sessionRevision ?? 0) ?? false) && a.status === 'resolved' &&
        a.account?.id === lifetime.ownerId && a.account.role === 'client' && a.account.is_active === true && a.hasCurrentConsent === true;
    };
    return createClientPostJobDraftOwner(lifetime.ownerId, undefined, isAuthorized, isRetained);
  }, [lifetime, memory, termination, terminationEpoch]);
  useSyncExternalStore(owner?.subscribe ?? emptySubscribe, owner?.snapshot ?? (() => 0), owner?.snapshot ?? (() => 0));
  useLayoutEffect(() => {
    const unsubscribeSession = subscribeSessionLifecycle?.(() => {
      if (!lifetime?.isCurrent()) owner?.dispose();
      else owner?.suspend();
    });
    const unsubscribeTermination = termination?.subscribe(() => owner?.dispose());
    return () => { unsubscribeSession?.(); unsubscribeTermination?.(); };
  }, [owner, lifetime, subscribeSessionLifecycle, termination]);
  // Suspense hides/replays layout effects; only real unmount disposes memory.
  useEffect(() => { owner?.activate(); return () => owner?.dispose(); }, [owner]);
  useLayoutEffect(() => {
    // Only a committed authorization snapshot may resume fields or settle receipts.
    const previous = memory.authority();
    if (previous && previous.session.sessionRevision !== session.sessionRevision) owner?.suspend();
    memory.observe(session, account);
    owner?.revalidate();
  }, [memory, owner, session, account]);
  return <DraftContext.Provider value={owner ? { ...owner } : undefined}>{children}</DraftContext.Provider>;
}
export function ClientPostJobDraftProvider({ ownerId, isOwnerCurrent, children }: { ownerId: string; isOwnerCurrent: () => boolean; children: ReactNode }) {
  const [owner] = useState(() => createClientPostJobDraftOwner(ownerId, undefined, isOwnerCurrent));
  useSyncExternalStore(owner.subscribe, owner.snapshot, owner.snapshot);
  useEffect(() => { owner.activate(); return () => owner.dispose(); }, [owner]);
  return <DraftContext.Provider value={{ ...owner }}>{children}</DraftContext.Provider>;
}
export function useClientPostJobDraft(): ClientPostJobDraftContextValue {
  const value = useContext(DraftContext);
  if (!value) throw new Error('useClientPostJobDraft must be used within a ClientPostJobDraftProvider.');
  return value;
}
