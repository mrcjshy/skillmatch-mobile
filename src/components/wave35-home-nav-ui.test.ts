// @ts-expect-error -- Node-only static composition harness; not native runtime evidence.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { canAddPostJobSkill, MAX_POST_JOB_SKILLS, orderedPostJobSkillIds, postJobSkillRole, togglePostJobSkill } from '@/lib/post-job-skill-selection';
import { createClientPostJobDraftOwner } from '@/providers/client-post-job-draft-provider';

const read = (file: string): string => readFileSync(file, 'utf8');
const code = (file: string): string => read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');
function files(dir: string): string[] {
  return (readdirSync(dir) as string[]).flatMap((name) => {
    const path = `${dir}/${name}`;
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}
const sources = files('src').filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file));

const WORKER_TABS = 'src/app/(worker)/(tabs)/_layout.tsx';
const WORKER_HOME = 'src/app/(worker)/(tabs)/worker/index.tsx';
const CLIENT_HOME = 'src/app/(client)/(tabs)/client/index.tsx';
const WORKER_PROFILE = 'src/app/(worker)/(tabs)/worker/profile.tsx';
const HEADER = 'src/components/home-header.tsx';
const POST = 'src/components/client-post-job-screen.tsx';

describe('Authenticated header: no brand, bell on Home only', () => {
  it('removes the SkillMatch logo and name from every Worker and Client surface', () => {
    for (const file of sources.filter((path) => /src\/app\/\((worker|client)\)\//.test(path) || path === HEADER)) {
      expect(code(file), file).not.toMatch(/HomeBrand|skillmatch-logo|>SkillMatch</);
    }
  });

  it.each(['worker', 'client'])('renders the %s notification bell from the Home sticky header and nowhere else', (role) => {
    const users = sources.filter((file) => /<NotificationBell\b/.test(code(file)));
    expect(users).toEqual([HEADER]);
    const importers = sources.filter((file) => code(file).includes("from '@/components/home-header'"));
    expect(importers.filter((file) => file.includes(`(${role})`))).toEqual([role === 'worker' ? WORKER_HOME : CLIENT_HOME]);
    // Wave 4: Admin Home is the one other importer, for the Admin role's own Home-only bell.
    expect(importers.filter((file) => !/\((worker|client)\)/.test(file))).toEqual(['src/app/(admin)/(tabs)/admin/index.tsx']);
    expect(importers).toHaveLength(3);
    // Bookings, Profile, details, chat, Post job and Notifications get no bell from their navigators either.
    for (const layout of [`src/app/(${role})/_layout.tsx`, `src/app/(${role})/(tabs)/_layout.tsx`]) expect(code(layout)).not.toMatch(/headerRight|NotificationBell/);
  });

  it('keeps the header outside the scroller, with the top inset, a wrapping name and a full-size bell target', () => {
    const header = code(HEADER);
    expect(header).toContain('paddingTop: insets.top + ui.spacing.headerTop');
    expect(header).not.toMatch(/numberOfLines|position: 'absolute'|<Modal|<Image/);
    expect(code('src/components/notification-bell.tsx')).toMatch(/minHeight: size\.ghostButton,\s*minWidth: size\.ghostButton/);
    for (const home of [WORKER_HOME, CLIENT_HOME]) {
      const source = code(home);
      expect(source.indexOf('</HomeStickyHeader>')).toBeLessThan(source.search(/<(?:Motion)?(?:FlatList|ScrollView)\b/));
      expect(source).not.toMatch(/stickyHeaderIndices|<Modal|position: 'absolute'/);
    }
  });
});

describe('Worker navigation and Home', () => {
  it('has three tabs and no Find work route at all (Wave 5 removed the hidden route)', () => {
    const tabs = code(WORKER_TABS);
    const screens = [...tabs.matchAll(/<Tabs\.Screen\s+name="([^"]+)"/g)].map((match) => match[1]);
    expect(screens).toEqual(['worker/index', 'worker/bookings', 'worker/profile']);
    expect(tabs).not.toMatch(/href: null/);
    expect([...tabs.matchAll(/<TabLabel[^>]*>([^<]+)<\/TabLabel>/g)].map((match) => match[1])).toEqual(['Home', 'Bookings', 'Profile']);
    expect(tabs).not.toContain('Find work');
    // Nothing in the app names the removed route.
    expect(sources.filter((file) => code(file).includes('worker/opportunities'))).toEqual([]);
  });

  it('lists available jobs on Home from the existing opportunity read, with no browse entry or overlay', () => {
    const home = code(WORKER_HOME);
    expect((home.match(/loadMyJobOpportunities\(\)/g) ?? []).length).toBe(1);
    expect(home).toContain('workerOpportunitiesTopic()');
    // Motion: the same FlatList through the Reanimated host (`MotionFlatList`), same data.
    expect(home).toMatch(/<MotionFlatList[\s\S]*data=\{jobs\}/);
    expect(home).toMatch(/<JobOpportunityCompactCard\s+compact/);
    expect(home).toContain('title="Available jobs"');
    expect(home).not.toMatch(/FindWorkOverlay|Browse opportunities|<AppButton|\.slice\(/);
  });

  it('keeps work status in the header through the shared sheet, as a compact 48dp control', () => {
    const home = code(WORKER_HOME);
    const header = home.slice(home.indexOf('<HomeStickyHeader'), home.indexOf('</HomeStickyHeader>'));
    expect(header).toMatch(/<AvailabilityControl\s+compact/);
    expect((home.match(/<AvailabilityControl/g) ?? []).length).toBe(1);
    const control = code('src/components/availability-control.tsx');
    expect(control).toMatch(/compactRow: \{[^}]*minHeight: size\.minTarget/);
    expect(control).toContain('<AppSheet visible={open} onClose={close} title="Work status">');
    expect(control).toContain("{compact ? null : <Text style={styles.caption}>Work status</Text>}");
  });
});

describe('Worker Profile identity', () => {
  const profile = code(WORKER_PROFILE);

  it('puts phone, email and Edit profile with the identity, ahead of the professional content', () => {
    const order = ['<InitialsAvatar', 'styles.identityName', 'styles.trade', 'label="Phone"', 'label="Email"', 'label="Edit profile"', 'title="Work skills"', 'title="Professional identity"', 'title="Account and support"'].map((marker) => profile.indexOf(marker));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(profile).not.toContain('<Collapsible');
  });

  it('leaves Account and support with actions only', () => {
    const account = profile.slice(profile.indexOf('title="Account and support"'), profile.indexOf('function ContactLine'));
    expect(account).not.toMatch(/FactRow|ContactLine|account\?\.phone|account\?\.email/);
    expect([...account.matchAll(/<NavRow label="([^"]+)"/g)].map((match) => match[1])).toEqual(['Help and FAQ', 'My reports', 'Report an app issue', 'Terms and conditions', 'Privacy policy']);
    expect(account).toContain('label="Sign out"');
  });

  it('shows only the contact data the Worker account already carries', () => {
    expect([...profile.matchAll(/<ContactLine [^>]*label="([^"]+)"/g)].map((match) => match[1])).toEqual(['Phone', 'Email', 'Area']);
    expect(profile).toContain('value={account?.phone ?? null}');
    expect(profile).toContain('value={account?.email ?? null}');
    expect(profile).toContain('value={account ? `${account.barangay}, ${account.city}` : null}');
  });
});

describe('Client Home', () => {
  const home = code(CLIENT_HOME);

  it('shows the open jobs themselves and only those, each opening Job Details', () => {
    expect(home).toContain("jobs.filter(job => job.status === 'open')");
    expect(home).toContain('openJobs.map((job, index) =>');
    expect(home).toContain("pathname: '/client/job-details', params: { jobId: job.id }");
    expect(home).toContain('label="Waiting for worker"');
    expect(home).not.toMatch(/awaiting a worker`|AppListRow|\.slice\(/);
  });

  it('does not repeat itself: no Post a job on Home (Wave 7 bar action), one section for waiting jobs, no second help or area block', () => {
    expect((home.match(/label="Post a job"/g) ?? []).length).toBe(0);
    expect((home.match(/<SectionHeader/g) ?? []).length).toBe(1);
    expect(home).not.toMatch(/Find the right help|service area|Help and FAQ/);
  });
});

describe('Post job skill selection', () => {
  const none = { primarySkillId: null, additionalSkillIds: [] };

  it('makes the first skill primary and the second secondary', () => {
    const first = togglePostJobSkill(none, 'plumbing');
    expect(first).toEqual({ primarySkillId: 'plumbing', additionalSkillIds: [] });
    expect(postJobSkillRole(first, 'plumbing')).toBe('Primary');
    const second = togglePostJobSkill(first, 'carpentry');
    expect(second).toEqual({ primarySkillId: 'plumbing', additionalSkillIds: ['carpentry'] });
    expect(postJobSkillRole(second, 'carpentry')).toBe('Secondary');
    expect(postJobSkillRole(second, 'painting')).toBeNull();
  });

  it('caps the choice at two: a third unselected skill is not added and there is no Additional role', () => {
    const two = { primarySkillId: 'plumbing', additionalSkillIds: ['carpentry'] };
    expect(MAX_POST_JOB_SKILLS).toBe(2);
    expect(togglePostJobSkill(two, 'painting')).toEqual(two);
    expect(postJobSkillRole(two, 'painting')).toBeNull();
    expect(canAddPostJobSkill(two, 'painting')).toBe(false);
    expect(canAddPostJobSkill(two, 'carpentry')).toBe(true);
    expect(canAddPostJobSkill({ primarySkillId: 'plumbing', additionalSkillIds: [] }, 'painting')).toBe(true);
    expect(read('src/lib/post-job-skill-selection.ts')).not.toContain("'Additional'");
  });

  it('never carries more than two skills forward from an older selection', () => {
    const older = { primarySkillId: 'a', additionalSkillIds: ['b', 'c'] };
    expect(orderedPostJobSkillIds(older)).toEqual(['a', 'b']);
    expect(togglePostJobSkill(older, 'a')).toEqual({ primarySkillId: 'b', additionalSkillIds: [] });
  });

  it('removes a tapped skill, promoting the next one when the primary goes', () => {
    const two = { primarySkillId: 'plumbing', additionalSkillIds: ['carpentry'] };
    expect(togglePostJobSkill({ primarySkillId: 'plumbing', additionalSkillIds: [] }, 'plumbing')).toEqual(none);
    expect(togglePostJobSkill(two, 'carpentry')).toEqual({ primarySkillId: 'plumbing', additionalSkillIds: [] });
    expect(togglePostJobSkill(two, 'plumbing')).toEqual({ primarySkillId: 'carpentry', additionalSkillIds: [] });
  });

  it('normalises duplicates and a missing primary without inventing ids', () => {
    expect(orderedPostJobSkillIds({ primarySkillId: 'a', additionalSkillIds: ['a', 'b', 'b'] })).toEqual(['a', 'b']);
    expect(togglePostJobSkill({ primarySkillId: null, additionalSkillIds: ['b'] }, 'c')).toEqual({ primarySkillId: 'b', additionalSkillIds: ['c'] });
  });

  it('is the only skill control on the screen and leaves the posting payload shape alone', () => {
    const post = code(POST);
    expect((post.match(/<SkillCatalogPicker/g) ?? []).length).toBe(1);
    expect(post).toContain('isSkillUnavailable={(skillId) => !canAddPostJobSkill(modalSelection, skillId)}');
    expect(post).toContain('Choose up to two skills.');
    expect((post.match(/onPress=\{openSkillsModal\}/g) ?? []).length).toBe(1);
    expect(post).not.toMatch(/Primary skill<|Choose primary skill|cannot be removed|SkillListSummary/);
    expect(code('src/lib/client-post-job-submission.ts')).toContain('const skillIds = [...new Set([primary.id, ...draft.additionalSkillIds.filter(id => knownIds.has(id))])];');
  });
});

describe('Home pull-to-refresh', () => {
  it('gives Worker Home one refresh gesture that reuses the focus, resume and live-update reads', () => {
    const home = code(WORKER_HOME);
    expect((home.match(/<RefreshControl\b/g) ?? []).length).toBe(1);
    expect(home).toContain('refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void refreshHome(); }}');
    expect(home).toContain('refreshStatus.current = read;');
    expect(home).toContain('refreshOpportunities.current?.();');
    // No new loader: the gesture calls the existing reads only.
    expect((home.match(/loadMyJobOpportunities\(/g) ?? []).length).toBe(1);
    expect((home.match(/loadWorkerBookings\(/g) ?? []).length).toBe(1);
    expect(home).toContain('subscribeInvalidation({');
    expect(home).toMatch(/AppState\.addEventListener\('change'/);
  });

  it('gives Client Home one refresh gesture over the existing bookings read and jobs owner', () => {
    const home = code(CLIENT_HOME);
    expect((home.match(/<RefreshControl\b/g) ?? []).length).toBe(1);
    expect(home).toContain('refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void refreshHome(); }}');
    expect(home).toContain('bookingFocus.current?.refresh();');
    expect(home).toContain('await refreshJobs(clientId);');
    expect(home).not.toMatch(/loadMyJobs|loadClientBookings\(/);
    expect(home).toContain('useFocusEffect(');
  });
});

describe('Post job draft stays reactive under React Compiler', () => {
  it('keeps the provider uncompiled and publishes a fresh context value on every draft change', () => {
    const provider = read('src/providers/client-post-job-draft-provider.tsx');
    const body = provider.slice(provider.indexOf('export function ClientPostJobDraftMemoryProvider'));
    expect(body.slice(0, body.indexOf('const [memory]'))).toContain("'use no memo';");
    expect(body).toContain('<DraftContext.Provider value={owner ? { ...owner } : undefined}>');
    expect(body).toContain('useSyncExternalStore(owner?.subscribe ?? emptySubscribe');
  });

  it('notifies subscribers and exposes typed text and chosen skills on the next read', () => {
    const owner = createClientPostJobDraftOwner('client-a');
    let notified = 0;
    const unsubscribe = owner.subscribe(() => { notified++; });
    const before = owner.snapshot();
    expect(owner.updateDraft({ description: 'Leaking tap' })).toBe(true);
    expect(owner.updateDraft((draft) => togglePostJobSkill(draft, 'plumbing'))).toBe(true);
    expect(owner.updateDraft((draft) => togglePostJobSkill(draft, 'carpentry'))).toBe(true);
    expect(notified).toBe(3);
    expect(owner.snapshot()).toBe(before + 3);
    expect({ ...owner }.draft).toMatchObject({ description: 'Leaking tap', primarySkillId: 'plumbing', additionalSkillIds: ['carpentry'] });
    unsubscribe();
  });
});

describe('Notification channel sound', () => {
  // W7 (owner decision 2026-10-04) supersedes the Wave 3.5 "no sound key" pin: the versioned
  // channel now names the bundled Tugma file. 'default' is still never passed as a file name.
  it('passes only the bundled Tugma file name to the versioned Android channel', () => {
    const push = code('src/lib/push-notifications.ts');
    const channel = push.slice(push.indexOf('setNotificationChannelAsync(ANDROID_CHANNEL_ID'), push.indexOf('androidChannelReady = true'));
    expect(channel).toContain('importance: notifications.AndroidImportance.HIGH');
    expect(channel).toContain('sound: ANDROID_NOTIFICATION_SOUND');
    expect(push).toContain("export const ANDROID_NOTIFICATION_SOUND = 'skillmatch_tugma.wav';");
    expect(push).not.toMatch(/sound: 'default'/);
  });
});
