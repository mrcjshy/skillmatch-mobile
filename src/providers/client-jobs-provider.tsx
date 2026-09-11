import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import { supabase } from '@/lib/supabase';
import { parseJobPaymentMethod, type JobPaymentMethod } from '@/lib/job-payment';
import { useAccount } from '@/providers/account-provider';

export type MasterSkill = { id: string; skill_name: string };

export type PostedJob = {
  id: string;
  title: string;
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
    .select('id, title, status, scheduled_at, budget, payment_method')
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

export function ClientJobsProvider({ children }: { children: ReactNode }) {
  const { account } = useAccount();
  const clientId = account?.id;
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [skills, setSkills] = useState<MasterSkill[]>([]);
  const [jobs, setJobs] = useState<PostedJob[]>([]);

  const refresh = useCallback(async (id: string) => {
    const [masterSkills, myJobs] = await Promise.all([loadSkills(), loadMyJobs(id)]);
    setSkills(masterSkills);
    setJobs(myJobs);
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount; established convention */
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    refresh(clientId)
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : COPY.loadGeneric);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, refresh]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <ClientJobsContext.Provider value={{ isLoading, loadError, skills, jobs, refresh }}>
      {children}
    </ClientJobsContext.Provider>
  );
}

export function useClientJobs(): ClientJobsContextValue {
  const value = useContext(ClientJobsContext);
  if (value === undefined) {
    throw new Error('useClientJobs must be used within a ClientJobsProvider.');
  }
  return value;
}
