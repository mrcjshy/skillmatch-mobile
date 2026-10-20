import { test, expect } from './runtime-tools.mjs';
import { openClientPicker } from './client-picker-navigation.mjs';
import { execFileSync } from 'node:child_process';

// Read only the single existing local Client's recents namespace, in memory.
// No credentials, account identifiers, historical rows or database files are emitted.
function latestConfirmedPoint() {
  const bytes = execFileSync('adb', ['-s', 'emulator-5558', 'exec-out', 'run-as', 'com.mrcjshy.skillmatch', 'cat', 'databases/RKStorage'], { windowsHide: true });
  const code = `import sys,sqlite3,json
c=sqlite3.connect(':memory:');c.deserialize(sys.stdin.buffer.read())
rows=list(c.execute("select value from catalystLocalStorage where key like 'skillmatch:recent-job-locations:v2:%'"))
assert len(rows)==1, 'Expected exactly the established Client namespace'
items=json.loads(rows[0][0]);print(json.dumps(max(items,key=lambda r:r['timestamp']) if items else None))`;
  return JSON.parse(execFileSync('python', ['-c', code], { input: bytes, encoding: 'utf8', windowsHide: true }));
}

async function newerConfirmedPoint(previous) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const current = latestConfirmedPoint();
    if (current && (!previous || current.timestamp > previous.timestamp)) return current;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('Expected the new explicit confirmation to reach local recents');
}

test('place-aware prepares a real denied-geocoder draft for continuous recording', async fixtures => {
  const { screen } = fixtures;
  await selectPublicCourt(fixtures);
  await expect(screen.getByText('Exact street unavailable.')).toBeVisible();
  await screen.getByRole('button', 'Confirm location').tap();
  await expect(screen.getByText('Step 1 of 4')).toBeVisible();
  await expect(screen.getByText('General area (selected pin confirmed)')).toBeVisible();
});

test('place-aware continuous move release candidate exact fallback and reopen', async ({ screen, app }) => {
  if (await screen.getByRole('button', 'Back to Post Job').isVisible()) await screen.getByRole('button', 'Back to Post Job').tap();
  await expect(screen.getByText('Step 1 of 4')).toBeVisible();
  await screen.getByRole('button', /^Change location/).tap();
  await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 30000 });
  await app.screenshot('place-aware-a-open-restored');
  await screen.swipe({ from: { x: 540, y: 850 }, to: { x: 690, y: 850 } });
  await expect(screen.getByText(/^Near /).first()).toBeVisible({ timeout: 15000 });
  await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled();
  await expectVisibleConfirmation(screen);
  await app.screenshot('place-aware-bcd-manual-near');
  const alternative = screen.getByRole('button', /^Move map to /).first();
  await expect(alternative).toBeVisible();
  const name = (await alternative.textContent()).replace(/^Move map to /, '');
  console.log('REAL_MAPPED_ALTERNATIVE', name);
  await alternative.tap();
  await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 30000 });
  expect(await screen.getByText(name, { exact: true }).count()).toBe(2);
  await expect(screen.getByText('Step 1 of 4')).not.toBeVisible();
  await app.screenshot('place-aware-ef-named-selection');
  const exact = screen.getByRole('button', 'Use exact pin instead');
  await expect(exact).toBeVisible();
  await exact.tap();
  await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 30000 });
  await app.screenshot('place-aware-g-exact-point');
  await screen.swipe({ from: { x: 640, y: 850 }, to: { x: 300, y: 750 } });
  await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 30000 });
  const destination = screen.getByLabel('Selected location address');
  const titles = await destination.getByRole('text').allTextContents();
  expect(titles.length).toBeGreaterThan(0);
  expect(titles.some(title => title === name || title === `Near ${name}`)).toBe(false);
  await expect(screen.getByText('Exact street unavailable.')).toBeVisible();
  await app.screenshot('place-aware-h-new-point');
  const prior = latestConfirmedPoint();
  await screen.getByRole('button', 'Confirm location').tap();
  await expect(screen.getByText('Step 1 of 4')).toBeVisible();
  await expect(screen.getByText('General area (selected pin confirmed)')).toBeVisible();
  const saved = await newerConfirmedPoint(prior);
  expect(saved.address).toBe('Selected Job location — Santa Ana, Pateros');
  await app.screenshot('place-aware-i-local-draft');
  await screen.getByRole('button', /^Change location/).tap();
  await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 30000 });
  await app.screenshot('place-aware-j-reopened');
  // A second explicit confirmation reads the reopened draft through the normal
  // product path; exact numeric equality catches silent padding/camera drift.
  await screen.getByRole('button', 'Confirm location').tap();
  await expect(screen.getByText('Step 1 of 4')).toBeVisible();
  const reopened = await newerConfirmedPoint(saved);
  expect(reopened.pin).toEqual(saved.pin);
  console.log('REOPENED_COORDINATE_EXACTLY_EQUAL', true);
  await screen.getByRole('button', /^Change location/).tap();
  await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 30000 });
  await app.screenshot('place-aware-continuous-final');
});

test('place-aware pan probe on the visible picker', async ({ screen, app }) => {
  await expect(screen.getByLabel('Selected location address')).toBeVisible();
  await screen.swipe({ from: { x: 540, y: 850 }, to: { x: 525, y: 860 } });
  await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 30000 });
  await expect(screen.getByRole('button', /^Move map to /).first()).toBeVisible({ timeout: 10000 });
  await app.screenshot('place-aware-probe');
});

test('place-aware native marker visual hit inspection', async ({ screen, app }) => {
  await app.screenshot('place-aware-marker-before-visual-tap');
  await screen.tapAt({ x: 742, y: 620 });
  await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 30000 });
  expect(await screen.getByText('Bahay Pamahalaan ng Barangay Santa Ana', { exact: true }).count()).toBe(2);
  await expect(screen.getByText('Step 1 of 4')).not.toBeVisible();
  await app.screenshot('place-aware-marker-after-visual-tap');
});

test('place-aware native marker search keyboard Back and controlled GPS', async fixtures => {
  const { screen, device, app } = fixtures;
  await openClientPicker(fixtures);
  await device.setPermission('location', 'grant');
  await device.setLocation({ latitude: 14.5444514, longitude: 121.07205067 });
  await screen.getByRole('button', 'Use My Location').tap();
  await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 60000 });
  await expect(screen.getByText('Exact street unavailable.')).not.toBeVisible();
  await app.screenshot('place-aware-controlled-emulator-gps');
  await screen.getByRole('button', 'Search locations').tap();
  await screen.getByLabel('Search for location').tap();
  await screen.getByLabel('Search for location').fill('Santa Ana Covered Court');
  await expectKeyboard(true);
  await app.screenshot('place-aware-search-keyboard');
  await screen.getByLabel('Search for location').press('Enter');
  await expectKeyboard(false);
  const result = screen.getByRole('button', /^Search result Santa Ana Covered Court, P\. Rosales/).first();
  await expect(result).toBeVisible({ timeout: 45000 });
  await result.tap();
  await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 30000 });
  expect(await screen.getByText('Santa Ana Covered Court', { exact: true }).count()).toBe(2);
  await screen.getByRole('button', 'Search locations').tap();
  await screen.getByLabel('Search for location').press('Enter');
  await expectKeyboard(false);
  await expect(screen.getByRole('button', 'Clear recent locations')).toBeVisible();
  await device.back();
  await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled();
  await screen.swipe({ from: { x: 540, y: 850 }, to: { x: 690, y: 850 } });
  // MapLibre's native overlay is absent from this Android accessibility dump.
  // This real marker was visually inspected at this public point and viewport;
  // verify its matching named row, then its actual native hit and selection.
  const name = 'Bahay Pamahalaan ng Barangay Santa Ana';
  await expect(screen.getByText(`Near ${name}`).first()).toBeVisible({ timeout: 15000 });
  await expect(screen.getByRole('button', `Move map to ${name}`)).toBeVisible();
  await app.screenshot('place-aware-marker-and-row');
  await screen.tapAt({ x: 742, y: 620 });
  await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 30000 });
  expect(await screen.getByText(name, { exact: true }).count()).toBe(2);
  await expect(screen.getByText('Step 1 of 4')).not.toBeVisible();
  await app.screenshot('place-aware-marker-selected');
});

test('place-aware enlarged fallback and final settled review at 100 percent', async fixtures => {
  const { screen, device, app } = fixtures;
  try {
    await device.setPermission('location', 'reset');
    execFileSync('adb', ['-s', 'emulator-5558', 'shell', 'settings', 'put', 'system', 'font_scale', '1.3'], { windowsHide: true });
    await device.openLink('skillmatchmobile://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081');
    await selectPublicCourt(fixtures);
    await screen.swipe({ from: { x: 540, y: 850 }, to: { x: 690, y: 850 } });
    await expect(screen.getByText(/^Near /).first()).toBeVisible({ timeout: 15000 });
    await expect(screen.getByText('Exact street unavailable.')).toBeVisible();
    await expectVisibleConfirmation(screen);
    await app.screenshot('place-aware-near-fallback-130');
    const candidate = screen.getByRole('button', /^Move map to /).first();
    if (!(await candidate.isVisible())) await screen.swipe({ from: { x: 700, y: 1790 }, to: { x: 700, y: 1560 } });
    await candidate.tap();
    await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 30000 });
    await expectVisibleConfirmation(screen);
    await app.screenshot('place-aware-named-fallback-130');
    await screen.getByRole('button', 'Search locations').tap();
    await screen.getByLabel('Search for location').tap();
    await expectKeyboard(true);
    await app.screenshot('place-aware-search-keyboard-130');
    await screen.getByLabel('Search for location').press('Enter');
    await expectKeyboard(false);
    await device.back();
    await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled();
  } finally {
    await device.setPermission('location', 'grant');
    execFileSync('adb', ['-s', 'emulator-5558', 'shell', 'settings', 'put', 'system', 'font_scale', '1.0'], { windowsHide: true });
  }
  await device.closeApp();
  await device.openLink('skillmatchmobile://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081');
  await selectPublicCourt(fixtures);
  await screen.swipe({ from: { x: 540, y: 850 }, to: { x: 690, y: 850 } });
  await expect(screen.getByText(/^Near /).first()).toBeVisible({ timeout: 15000 });
  await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled();
  await expectVisibleConfirmation(screen);
  await app.screenshot('place-aware-final-review-100');
});

test('place-aware live public context inspection', async fixtures => {
  const { screen, app } = fixtures;
  if (await screen.getByRole('button', 'Post a job').isVisible()) console.log('ROLE_EVIDENCE', 'Protected Client Home offers Post a job');
  await selectPublicCourt(fixtures);
  await app.screenshot('place-aware-search-selected');
  await screen.swipe({ from: { x: 540, y: 850 }, to: { x: 510, y: 870 } });
  await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 30000 });
  console.log('SELECTED_POINT', await screen.getByLabel('Selected location address').textContent());
  await app.screenshot('place-aware-manual-context');
  const alternative = screen.getByRole('button', /^Move map to /).first();
  await expect(alternative).toBeVisible({ timeout: 30000 });
  console.log('ACTUAL_ALTERNATIVE', await alternative.textContent());
  await alternative.tap();
  await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 30000 });
  console.log('SELECTED_PLACE', await screen.getByLabel('Selected location address').textContent());
  await app.screenshot('place-aware-mapped-candidate');
});

test('review correction reproduces and waits for a deliberate manual selection', async fixtures => {
  const { screen, app } = fixtures;
  await app.screenshot('review-correction-entry');
  await openClientPicker(fixtures);
  console.log('ENTRY_CONFIRM_ENABLED', await screen.getByRole('button', 'Confirm location').isEnabled());
  console.log('ENTRY_CHECKING_FEATURES', await screen.getByText('Checking nearby mapped features...').isVisible());
  await screen.swipe({ from: { x: 540, y: 850 }, to: { x: 495, y: 865 } });
  await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 30000 });
  await expect(screen.getByText('Checking nearby mapped features...')).not.toBeVisible();
  await app.screenshot('review-correction-manual-settled');
});

async function selectPublicCourt(fixtures) {
  const { screen } = fixtures;
  if (!(await screen.getByLabel('Search for location').isVisible())) {
    await openClientPicker(fixtures);
    await screen.getByRole('button', 'Search locations').tap();
  }
  await screen.getByLabel('Search for location').tap();
  await screen.getByLabel('Search for location').fill('Santa Ana Covered Court');
  await screen.getByLabel('Search for location').press('Enter');
  const result = screen.getByRole('button', /^Search result Santa Ana Covered Court, P\. Rosales/).first();
  await expect(result).toBeVisible({ timeout: 45000 });
  const start = Date.now();
  await result.tap();
  await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 30000 });
  await expect(screen.getByText('Checking nearby mapped features...')).not.toBeVisible();
  console.log('PUBLIC_SELECTION_SETTLED_MS', Date.now() - start);
}

test('review correction completes enlarged fallback and returns to settled handoff', async fixtures => {
  const { screen, device, app } = fixtures;
  try {
    await device.setPermission('location', 'reset');
    execFileSync('adb', ['-s', 'emulator-5558', 'shell', 'settings', 'put', 'system', 'font_scale', '1.3'], { windowsHide: true });
    await device.closeApp();
    await device.openLink('skillmatchmobile://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081');
    await selectPublicCourt(fixtures);
    await expect(screen.getByText('Exact street unavailable.')).toBeVisible({ timeout: 30000 });
    await expectVisibleConfirmation(screen);
    await app.screenshot('review-correction-final-fallback-1.3');
    await device.setPermission('location', 'grant');
    await screen.getByRole('button', 'Retry address').tap();
    await expect(screen.getByText('Exact street unavailable.')).not.toBeVisible({ timeout: 30000 });
    await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled();
  } finally {
    await device.setPermission('location', 'grant');
    execFileSync('adb', ['-s', 'emulator-5558', 'shell', 'settings', 'put', 'system', 'font_scale', '1.0'], { windowsHide: true });
  }
  await device.closeApp();
  await device.openLink('skillmatchmobile://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081');
  await selectPublicCourt(fixtures);
  await expectVisibleConfirmation(screen);
  await app.screenshot('review-correction-final-selected-1.0');
});

test('review correction shows settled public selection and geocoder fallback at both font scales', async fixtures => {
  const { screen, device, app } = fixtures;
  try {
    for (const scale of ['1.0', '1.3']) {
      execFileSync('adb', ['-s', 'emulator-5558', 'shell', 'settings', 'put', 'system', 'font_scale', scale], { windowsHide: true });
      await device.closeApp();
      await device.openLink('skillmatchmobile://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081');
      await selectPublicCourt(fixtures);
      await expect(screen.getByText('Service location', { exact: true })).not.toBeVisible();
      await expectVisibleConfirmation(screen);
      await app.screenshot(`review-correction-resolved-${scale}`);
      await device.setPermission('location', 'reset');
      await device.openLink('skillmatchmobile://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081');
      await selectPublicCourt(fixtures);
      await screen.swipe({ from: { x: 540, y: 850 }, to: { x: 525, y: 850 } });
      await expect(screen.getByText('Exact street unavailable.')).toBeVisible({ timeout: 30000 });
      await expect(screen.getByText('General area', { exact: true })).toBeVisible();
      await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled();
      await expectVisibleConfirmation(screen);
      await app.screenshot(`review-correction-fallback-${scale}`);
      await device.setPermission('location', 'grant');
      await screen.getByRole('button', 'Retry address').tap();
      await expect(screen.getByText('Exact street unavailable.')).not.toBeVisible({ timeout: 30000 });
      await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled();
    }
  } finally {
    await device.setPermission('location', 'grant');
    execFileSync('adb', ['-s', 'emulator-5558', 'shell', 'settings', 'put', 'system', 'font_scale', '1.0'], { windowsHide: true });
  }
  await device.closeApp();
  await device.openLink('skillmatchmobile://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081');
  await selectPublicCourt(fixtures);
  await expectVisibleConfirmation(screen);
  await app.screenshot('review-correction-final-resolved');
});

async function expectVisibleConfirmation(screen) {
  const box = await screen.getByRole('button', 'Confirm location').boundingBox();
  const size = execFileSync('adb', ['-s', 'emulator-5558', 'shell', 'wm', 'size'], { encoding: 'utf8', windowsHide: true });
  const height = Number([...size.matchAll(/(\d+)x(\d+)/g)].at(-1)[2]);
  const densityOutput = execFileSync('adb', ['-s', 'emulator-5558', 'shell', 'wm', 'density'], { encoding: 'utf8', windowsHide: true });
  const density = Number([...densityOutput.matchAll(/density: (\d+)/g)].at(-1)[1]) / 160;
  expect(box.y + box.height <= height - 40).toBe(true);
  expect(box.height >= 48 * density).toBe(true);
}

async function expectKeyboard(visible) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const state = execFileSync('adb', ['-s', 'emulator-5558', 'shell', 'dumpsys', 'input_method'], { encoding: 'utf8', windowsHide: true });
    if (state.includes(`mInputShown=${visible}`)) return;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`Android keyboard did not become ${visible ? 'visible' : 'hidden'}`);
}

test('passenger picker initial manual state and public in-area selection', async fixtures => {
  await openClientPicker(fixtures);
  const { screen, app } = fixtures;
  await expect(screen.getByRole('button', 'Search locations')).toBeVisible();
  await expect(screen.getByLabel('Search for location')).not.toBeVisible();
  await expect(screen.getByText(/Allow.*access.*location/i)).not.toBeVisible();
  await expect(screen.getByRole('button', 'Confirm location')).not.toBeEnabled();
  await app.screenshot('passenger-initial');
  console.log('INITIAL_ADDRESS', await screen.getByLabel('Selected location address').textContent());
  await screen.swipe({ from: { x: 540, y: 850 }, to: { x: 520, y: 850 } });
  await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 45000 });
  await expect(screen.getByRole('button', 'Clear recent locations')).not.toBeVisible();
  await expectVisibleConfirmation(screen);
  await app.screenshot('passenger-selected');
});

test('passenger confirmation remains inside the screen after manual panning', async ({ screen, device, app }) => {
  await device.setLocation({ latitude: 14.5444514, longitude: 121.07205067 });
  await screen.getByRole('button', 'Use My Location').tap();
  await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 45000 });
  await screen.swipe({ from: { x: 540, y: 850 }, to: { x: 520, y: 850 } });
  await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 45000 });
  await app.screenshot('passenger-snap-confirmation');
  await expectVisibleConfirmation(screen);
});

test('passenger search selects real Photon result and returns without confirming', async ({ screen, device, app }) => {
  await screen.getByRole('button', 'Search locations').tap();
  await screen.getByLabel('Search for location').fill('Santa Ana Covered Court');
  await screen.getByLabel('Search for location').tap();
  await app.screenshot('passenger-search-keyboard');
  await device.dismissKeyboard();
  const result = screen.getByRole('button', /^Search result /).first();
  await expect(result).toBeVisible({ timeout: 45000 });
  console.log('PUBLIC_SEARCH_RESULT', await result.textContent());
  await app.screenshot('passenger-search-results');
  await result.tap();
  await expect(screen.getByRole('button', 'Search locations')).toBeVisible();
  await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 45000 });
  await expect(screen.getByText('Step 1 of 4')).not.toBeVisible();
  await app.screenshot('passenger-public-destination');
  await screen.getByRole('button', 'Search locations').tap();
  await device.dismissKeyboard();
  await app.screenshot('passenger-search-recents');
  await device.back();
  await expect(screen.getByRole('button', 'Search locations')).toBeVisible();
  await expect(screen.getByLabel('Selected location address')).toBeVisible();
  await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled();
});

test('passenger denied permission keeps manual fallback confirmable and explicit GPS recovers', async fixtures => {
  const { screen, device, app } = fixtures;
  try {
    await device.setPermission('location', 'reset');
    await device.closeApp();
    await device.openLink('skillmatchmobile://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081');
    await openClientPicker(fixtures);
    await expect(screen.getByText(/Allow.*access.*location/i)).not.toBeVisible();
    await screen.getByRole('button', 'Use My Location').tap();
    const deny = screen.getByRole('button', /Don.t allow/);
    try { await expect(deny).toBeVisible({ timeout: 10000 }); } catch { /* Android may retain a denial. */ }
    if (await deny.isVisible()) { await app.screenshot('passenger-explicit-permission'); await deny.tap(); }
    await expect(screen.getByText('Location permission is off. You can still move the map under the center pin.')).toBeVisible();
    await screen.swipe({ from: { x: 540, y: 850 }, to: { x: 510, y: 850 } });
    await expect(screen.getByText('Exact street unavailable.')).toBeVisible({ timeout: 45000 });
    await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled();
    await expectVisibleConfirmation(screen);
    await app.screenshot('passenger-denied-general-area');
    await screen.getByRole('button', 'Confirm location').tap();
    await expect(screen.getByText('Step 1 of 4')).toBeVisible();
    await screen.getByRole('button', /^Change location/).tap();
    await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 45000 });
    await device.setPermission('location', 'grant');
    await device.setLocation({ latitude: 14.5444514, longitude: 121.07205067 });
    await screen.getByRole('button', 'Use My Location').tap();
    await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 60000 });
    await expect(screen.getByText('Exact street unavailable.')).not.toBeVisible();
    await app.screenshot('passenger-controlled-gps');
    await screen.getByRole('button', 'Search locations').tap();
    await device.dismissKeyboard();
    const recent = screen.getByRole('button', /^Recent location /).first();
    await expect(recent).toBeVisible();
    await expect(screen.getByRole('button', 'Clear recent locations')).toBeVisible();
    await recent.tap();
    await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 45000 });
    await expect(screen.getByRole('button', 'Back to Post Job')).toBeVisible();
  } finally { await device.setPermission('location', 'grant'); }
});

test('passenger layout at 100 and 130 percent keeps confirmation and search usable', async fixtures => {
  const { screen, device, app } = fixtures;
  try {
    for (const scale of ['1.0', '1.3']) {
      execFileSync('adb', ['-s', 'emulator-5558', 'shell', 'settings', 'put', 'system', 'font_scale', scale], { windowsHide: true });
      await device.closeApp();
      await device.openLink('skillmatchmobile://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081');
      await openClientPicker(fixtures);
      await device.setLocation({ latitude: 14.5444514, longitude: 121.07205067 });
      await screen.getByRole('button', 'Use My Location').tap();
      await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 45000 });
      await expectVisibleConfirmation(screen);
      await app.screenshot(`passenger-selected-font-${scale}`);
      await screen.getByRole('button', 'Search locations').tap();
      await screen.getByLabel('Search for location').tap();
      await expectKeyboard(true);
      await app.screenshot(`passenger-keyboard-font-${scale}`);
      await screen.getByLabel('Search for location').press('Enter');
      await expectKeyboard(false);
      await expect(screen.getByRole('button', 'Clear recent locations')).toBeVisible();
      await app.screenshot(`passenger-search-font-${scale}`);
      await device.back();
      await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled();
      await expectVisibleConfirmation(screen);
    }
  } finally {
    execFileSync('adb', ['-s', 'emulator-5558', 'shell', 'settings', 'put', 'system', 'font_scale', '1.0'], { windowsHide: true });
  }
});

test('passenger visual review leaves a public selected location at 100 percent', async fixtures => {
  const { screen, app } = fixtures;
  const scale = execFileSync('adb', ['-s', 'emulator-5558', 'shell', 'settings', 'get', 'system', 'font_scale'], { encoding: 'utf8', windowsHide: true });
  expect(Number(scale.trim())).toBe(1);
  if (!(await screen.getByLabel('Search for location').isVisible())) {
    await openClientPicker(fixtures);
    await screen.getByRole('button', 'Search locations').tap();
  }
  await screen.getByLabel('Search for location').pressSequentially('Santa Ana Covered Court');
  await expectKeyboard(true);
  await screen.getByLabel('Search for location').press('Enter');
  await expectKeyboard(false);
  const result = screen.getByRole('button', /^Search result Santa Ana Covered Court/).first();
  await expect(result).toBeVisible({ timeout: 45000 });
  await expect(screen.getByRole('button', 'Clear recent locations')).toBeVisible();
  await app.screenshot('map-ux03-after-search');
  await result.tap();
  await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 45000 });
  const exact = screen.getByRole('button', 'Use exact pin instead');
  if (await exact.isVisible()) await exact.tap();
  await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 45000 });
  await expect(screen.getByRole('button', 'Back to Post Job')).toBeVisible();
  await expectVisibleConfirmation(screen);
  await app.screenshot('map-ux03-after-selected');
});
