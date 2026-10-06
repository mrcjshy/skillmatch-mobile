import { StateScreen } from '@/components/state-screen';

/** Inline-only state: the route is guarded and never navigable (see the root layout). */
export default function LoadingScreen() {
  return <StateScreen loading title="Loading SkillMatch" message="Getting things ready…" />;
}
