import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import { supabase } from '@/lib/supabase';
import { useAccount } from '@/providers/account-provider';

export type AvailabilityStatus = 'available' | 'busy' | 'offline';
export type Proficiency = 'beginner' | 'intermediate' | 'expert';
export type MasterSkill = { id: string; skill_name: string };
export type SkillSelection = Record<string, Proficiency>;

export const AVAILABILITY_OPTIONS: { value: AvailabilityStatus; label: string }[] = [
  { value: 'available', label: 'Available' },
  { value: 'busy', label: 'Busy' },
  { value: 'offline', label: 'Offline' },
];

export const PROFICIENCY_OPTIONS: { value: Proficiency; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'expert', label: 'Expert' },
];

function isAvailability(value: unknown): value is AvailabilityStatus {
  return value === 'available' || value === 'busy' || value === 'offline';
}

function isProficiency(value: unknown): value is Proficiency {
  return value === 'beginner' || value === 'intermediate' || value === 'expert';
}

type LoadedState = {
  skills: MasterSkill[];
  profileId: string | null;
  bio: string;
  availability: AvailabilityStatus;
  selection: SkillSelection;
};

const COPY = {
  loadSkills: "Couldn't load the skill list. Please try again.",
  loadProfile: "Couldn't load your profile. Please try again.",
  loadWorkerSkills: "Couldn't load your skills. Please try again.",
  loadGeneric: "Couldn't load your profile. Please try again.",
  saveProfile: "Couldn't save your profile. Please try again.",
  saveSkills: "Couldn't save your skills. Please try again.",
  saveGeneric: "Couldn't save your changes. Please try again.",
} as const;

async function loadWorkerData(userId: string): Promise<LoadedState> {
  const skillsRes = await supabase
    .from('skills')
    .select('id, skill_name')
    .order('skill_name', { ascending: true });
  if (skillsRes.error) {
    console.warn('[N6-UI] skills read failed:', skillsRes.error.code, skillsRes.error.message);
    throw new Error(COPY.loadSkills);
  }
  const skills: MasterSkill[] = (skillsRes.data ?? []).filter(
    (skill): skill is MasterSkill =>
      typeof skill.id === 'string' && typeof skill.skill_name === 'string'
  );

  const profileRes = await supabase
    .from('worker_profiles')
    .select('id, bio, availability_status')
    .eq('user_id', userId)
    .maybeSingle();
  if (profileRes.error) {
    console.warn('[N6-UI] profile read failed:', profileRes.error.code, profileRes.error.message);
    throw new Error(COPY.loadProfile);
  }

  if (!profileRes.data) {
    return { skills, profileId: null, bio: '', availability: 'available', selection: {} };
  }

  const profileId = String(profileRes.data.id);
  const skillRowsRes = await supabase
    .from('worker_skills')
    .select('skill_id, proficiency_level')
    .eq('worker_id', profileId);
  if (skillRowsRes.error) {
    console.warn(
      '[N6-UI] worker_skills read failed:',
      skillRowsRes.error.code,
      skillRowsRes.error.message
    );
    throw new Error(COPY.loadWorkerSkills);
  }
  const selection: SkillSelection = {};
  for (const row of skillRowsRes.data ?? []) {
    if (typeof row.skill_id === 'string' && isProficiency(row.proficiency_level)) {
      selection[row.skill_id] = row.proficiency_level;
    }
  }

  return {
    skills,
    profileId,
    bio: typeof profileRes.data.bio === 'string' ? profileRes.data.bio : '',
    availability: isAvailability(profileRes.data.availability_status)
      ? profileRes.data.availability_status
      : 'available',
    selection,
  };
}

type WorkerProfileContextValue = {
  isLoading: boolean;
  loadError: string | null;
  skills: MasterSkill[];
  bio: string;
  setBio: (value: string) => void;
  availability: AvailabilityStatus;
  setAvailability: (value: AvailabilityStatus) => void;
  selection: SkillSelection;
  isSaving: boolean;
  saveError: string | null;
  saveSuccess: string | null;
  toggleSkill: (skillId: string) => void;
  setProficiency: (skillId: string, level: Proficiency) => void;
  handleSave: () => Promise<void>;
};

const WorkerProfileContext = createContext<WorkerProfileContextValue | undefined>(undefined);

export function WorkerProfileProvider({ children }: { children: ReactNode }) {
  const { account } = useAccount();
  const userId = account?.id;

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [skills, setSkills] = useState<MasterSkill[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [bio, setBio] = useState('');
  const [availability, setAvailability] = useState<AvailabilityStatus>('available');
  const [selection, setSelection] = useState<SkillSelection>({});
  const [persistedSelection, setPersistedSelection] = useState<SkillSelection>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const applyLoaded = useCallback((loaded: LoadedState) => {
    setSkills(loaded.skills);
    setProfileId(loaded.profileId);
    setBio(loaded.bio);
    setAvailability(loaded.availability);
    setSelection(loaded.selection);
    setPersistedSelection(loaded.selection);
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    loadWorkerData(userId)
      .then((loaded) => {
        if (cancelled) return;
        applyLoaded(loaded);
      })
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
  }, [userId, applyLoaded]);

  function toggleSkill(skillId: string) {
    setSelection((previous) => {
      const next = { ...previous };
      if (next[skillId]) delete next[skillId];
      else next[skillId] = 'beginner';
      return next;
    });
  }

  function setProficiency(skillId: string, level: Proficiency) {
    setSelection((previous) => ({ ...previous, [skillId]: level }));
  }

  async function handleSave() {
    if (isSaving || !userId) return;
    setSaveError(null);
    setSaveSuccess(null);

    if (!isAvailability(availability)) {
      setSaveError('Please choose an availability status.');
      return;
    }
    const knownSkillIds = new Set(skills.map((skill) => skill.id));
    for (const [skillId, level] of Object.entries(selection)) {
      if (!knownSkillIds.has(skillId) || !isProficiency(level)) {
        setSaveError('Please choose a valid proficiency for each selected skill.');
        return;
      }
    }

    setIsSaving(true);
    const trimmedBio = bio.trim();
    const bioValue = trimmedBio.length > 0 ? trimmedBio : null;
    try {
      let currentProfileId = profileId;
      if (!currentProfileId) {
        const insertResult = await supabase
          .from('worker_profiles')
          .insert({ user_id: userId, bio: bioValue, availability_status: availability })
          .select('id')
          .single();
        if (insertResult.error || !insertResult.data?.id) {
          console.warn(
            '[N6-UI] profile insert failed:',
            insertResult.error?.code,
            insertResult.error?.message ?? 'no id returned'
          );
          throw new Error(COPY.saveProfile);
        }
        currentProfileId = String(insertResult.data.id);
        setProfileId(currentProfileId);
      } else {
        const updateResult = await supabase
          .from('worker_profiles')
          .update({ bio: bioValue, availability_status: availability })
          .eq('id', currentProfileId)
          .eq('user_id', userId);
        if (updateResult.error) {
          console.warn(
            '[N6-UI] profile update failed:',
            updateResult.error.code,
            updateResult.error.message
          );
          throw new Error(COPY.saveProfile);
        }
      }

      const removed = Object.keys(persistedSelection).filter((id) => !selection[id]);
      const added = Object.keys(selection).filter((id) => !persistedSelection[id]);
      const changed = Object.keys(selection).filter(
        (id) => persistedSelection[id] && persistedSelection[id] !== selection[id]
      );

      if (removed.length > 0) {
        const deleteResult = await supabase
          .from('worker_skills')
          .delete()
          .eq('worker_id', currentProfileId)
          .in('skill_id', removed);
        if (deleteResult.error) {
          console.warn(
            '[N6-UI] skill delete failed:',
            deleteResult.error.code,
            deleteResult.error.message
          );
          throw new Error(COPY.saveSkills);
        }
      }
      for (const skillId of changed) {
        const updateResult = await supabase
          .from('worker_skills')
          .update({ proficiency_level: selection[skillId] })
          .eq('worker_id', currentProfileId)
          .eq('skill_id', skillId);
        if (updateResult.error) {
          console.warn(
            '[N6-UI] skill update failed:',
            updateResult.error.code,
            updateResult.error.message
          );
          throw new Error(COPY.saveSkills);
        }
      }
      if (added.length > 0) {
        const insertResult = await supabase.from('worker_skills').insert(
          added.map((skillId) => ({
            worker_id: currentProfileId,
            skill_id: skillId,
            proficiency_level: selection[skillId],
          }))
        );
        if (insertResult.error) {
          console.warn(
            '[N6-UI] skill insert failed:',
            insertResult.error.code,
            insertResult.error.message
          );
          throw new Error(COPY.saveSkills);
        }
      }

      const reloaded = await loadWorkerData(userId);
      applyLoaded(reloaded);
      setSaveSuccess('Profile saved.');
    } catch (error: unknown) {
      setSaveError(
        (error instanceof Error ? error.message : COPY.saveGeneric) +
          ' Some changes may not have been saved — please review and try again.'
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <WorkerProfileContext.Provider
      value={{
        isLoading,
        loadError,
        skills,
        bio,
        setBio,
        availability,
        setAvailability,
        selection,
        isSaving,
        saveError,
        saveSuccess,
        toggleSkill,
        setProficiency,
        handleSave,
      }}
    >
      {children}
    </WorkerProfileContext.Provider>
  );
}

export function useWorkerProfile(): WorkerProfileContextValue {
  const value = useContext(WorkerProfileContext);
  if (value === undefined) {
    throw new Error('useWorkerProfile must be used within a WorkerProfileProvider.');
  }
  return value;
}
