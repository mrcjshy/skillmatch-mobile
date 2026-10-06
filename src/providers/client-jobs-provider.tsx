import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { supabase } from '@/lib/supabase';
import { parseJobPaymentMethod, type JobPaymentMethod } from '@/lib/job-payment';


export type MasterSkill = { id: string; skill_name: string };

export type PostedJob = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  scheduled_at: string | null;
  budget: number | null;
  payment_method: JobPaymentMethod | null;
  payment_method_readable: boolean;
  skills: string[];
};

const COPY = {
  loadSkills: "Couldn't load the skill list. Please try again.",
  loadJobs: "Couldn't load your jobs. Please try again.",
  loadJobSkills: "Couldn't load your jobs. Please try again.",
  loadGeneric: "Couldn't load your dashboard. Please try again.",
} as const;

async function loadSkills(): Promise<MasterSkill[]> {
  const result = await supabase
    .from('skills')
    .select('id, skill_name')
    .order('skill_name', { ascending: true });
  if (result.error) {
    console.warn('[N7-UI] skills read failed:', result.error.code, result.error.message);
    throw new Error(COPY.loadSkills);
  }
  return (result.data ?? []).filter(
    (skill): skill is MasterSkill =>
      typeof skill.id === 'string' && typeof skill.skill_name === 'string'
  );
}

async function loadMyJobs(clientId: string): Promise<PostedJob[]> {
  const jobsResult = await supabase
    .from('job_postings')
    .select('id, title, description, status, scheduled_at, budget, payment_method')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  if (jobsResult.error) {
    console.warn(
      '[N7-UI] job_postings read failed:',
      jobsResult.error.code,
      jobsResult.error.message
    );
    throw new Error(COPY.loadJobs);
  }

  const jobs = jobsResult.data ?? [];
  if (jobs.length === 0) return [];

  const skillsResult = await supabase
    .from('job_skills')
    .select('job_id, skills(skill_name)')
    .in(
      'job_id',
      jobs.map((job) => String(job.id))
    );
  if (skillsResult.error) {
    console.warn(
      '[N7-UI] job_skills read failed:',
      skillsResult.error.code,
      skillsResult.error.message
    );
    throw new Error(COPY.loadJobSkills);
  }

  const skillsByJob = new Map<string, string[]>();
  for (const row of (skillsResult.data ?? []) as {
    job_id: string;
    skills: { skill_name: string } | { skill_name: string }[] | null;
  }[]) {
    const relation = Array.isArray(row.skills) ? row.skills[0] : row.skills;
    if (!relation?.skill_name) continue;
    const list = skillsByJob.get(row.job_id) ?? [];
    list.push(relation.skill_name);
    skillsByJob.set(row.job_id, list);
  }

  return jobs.map((job) => {
    const parsed = parseJobPaymentMethod(job.payment_method);
    return {
      id: String(job.id),
      title: String(job.title),
      description: typeof job.description === 'string' ? job.description : null,
      status: String(job.status ?? 'open'),
      scheduled_at: (job.scheduled_at as string | null) ?? null,
      budget: (job.budget as number | null) ?? null,
      payment_method: parsed.ok ? parsed.method : null,
      payment_method_readable: parsed.ok,
      skills: (skillsByJob.get(String(job.id)) ?? []).sort(),
    };
  });
}

type ClientJobsContextValue = {
  isLoading: boolean;
  loadError: string | null;
  skills: MasterSkill[];
  jobs: PostedJob[];
  refresh: (clientId: string) => Promise<void>;
};

const ClientJobsContext = createContext<ClientJobsContextValue | undefined>(undefined);

/** The existing two loaders share one authorized latest-refresh owner. */
export function createClientJobsRefreshOwner(
  clientId: string, isOwnerCurrent: () => boolean,
  readSkills: () => Promise<MasterSkill[]> = loadSkills,
  readJobs: (id: string) => Promise<PostedJob[]> = loadMyJobs,
) {
  let disposed = false, invalidated = false, sequence = 0;
  let state = { isLoading: true, loadError: null as string | null, skills: [] as MasterSkill[], jobs: [] as PostedJob[] };
  const listeners = new Set<() => void>();
  const publish = (next: typeof state) => { state = next; for (const listener of listeners) listener(); };
  const authorized = () => {
    if (disposed || invalidated) return false;
    try { if (isOwnerCurrent()) return true; } catch { /* A guard failure ends this lifetime. */ }
    invalidated = true;
    return false;
  };
  const current = (request: number) => authorized() && request === sequence;
  async function refresh(id: string, initial = false) {
    if (!authorized() || id !== clientId) throw new Error('Client jobs owner changed.');
    const request = ++sequence;
    try {
      const [skills, jobs] = await Promise.all([readSkills(), readJobs(id)]);
      if (current(request)) publish({ ...state, skills, jobs, isLoading: false, loadError: null });
    } catch (error) {
      if (initial && current(request)) publish({ ...state, isLoading: false, loadError: error instanceof Error ? error.message : COPY.loadGeneric });
      throw error;
    }
  }
  return {
    refresh: (id: string) => refresh(id),
    loadInitial: () => refresh(clientId, true),
    dispose: () => { disposed = true; sequence++; },
    activate: () => { disposed = false; },
    snapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

export function ClientJobsProvider({ children, ownerId, isOwnerCurrent }: { children: ReactNode; ownerId: string; isOwnerCurrent: () => boolean }) {
  const [owner] = useState(() => createClientJobsRefreshOwner(ownerId, isOwnerCurrent));
  const state = useSyncExternalStore(owner.subscribe, owner.snapshot, owner.snapshot);
  useEffect(() => {
    owner.activate();
    void owner.loadInitial().catch(() => {});
    return () => owner.dispose();
  }, [owner]);
  return <ClientJobsContext.Provider value={{ ...state, refresh: owner.refresh }}>{children}</ClientJobsContext.Provider>;
}
export function useClientJobs(): ClientJobsContextValue {
  const value = useContext(ClientJobsContext);
  if (value === undefined) {
    throw new Error('useClientJobs must be used within a ClientJobsProvider.');
  }
  return value;
}
