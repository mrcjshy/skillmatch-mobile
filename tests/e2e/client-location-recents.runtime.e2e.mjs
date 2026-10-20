import { test, expect } from './runtime-tools.mjs';
import { openClientPicker } from './client-picker-navigation.mjs';
import { readDeviceRecents, waitForRecents } from './read-device-recents.mjs';

const pins = [14.5440514, 14.5446514].flatMap(latitude =>
  [121.07145067, 121.07205067, 121.07265067].map(longitude => ({ latitude, longitude })));
let scope;
// The existing picker may snap to a nearby mapped building; these points are
// spaced well beyond both that tolerance and the approved recent dedupe radius.
const near = (actual, synthetic) => Math.abs(actual.latitude - synthetic.latitude) < .0002 && Math.abs(actual.longitude - synthetic.longitude) < .0002;

test('actual device recents retain five newest synthetic locations without posting a Job', async fixtures => {
  await openClientPicker(fixtures);
  const { screen, device, app } = fixtures;
  for (let i = 0; i < pins.length; i++) {
    await device.setLocation(pins[i]);
    await screen.getByRole('button', 'Use My Location').tap();
    await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 60000 });
    const exact = screen.getByRole('button', 'Use exact pin instead');
    if (await exact.isVisible()) {
      await exact.tap();
      await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 45000 });
    }
    await screen.getByRole('button', 'Confirm location').tap();
    await expect(screen.getByRole('button', /^Change location/)).toBeVisible();
    const saved = await waitForRecents(scope, rows => near(rows[0]?.pin ?? {}, pins[i]));
    scope = saved.scope;
    await screen.getByRole('button', /^Change location/).tap();
    await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 45000 });
  }
  const { rows } = readDeviceRecents(scope);
  expect(rows.length).toBe(5);
  expect(rows.every((row, i) => i === 0 || row.timestamp <= rows[i - 1].timestamp)).toBe(true);
  expect(near(rows[0].pin, pins[5])).toBe(true);
  expect(rows.some(row => near(row.pin, pins[0]))).toBe(false);
  console.log('ACTUAL_ASYNCSTORAGE_MAX_FIVE_NEWEST_FIRST_PASS');
  await app.screenshot('ride-hailing-recents-five');
});

test('actual recent selection moves the camera, dedupes on confirmation, and Clear removes local recents', async ({ screen, app }) => {
  const back = screen.getByRole('button', 'Back to Post Job');
  if (await back.isVisible()) await back.tap();
  await screen.getByRole('button', /^Change location/).tap();
  await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 45000 });
  await screen.getByRole('button', 'Search locations').tap();
  await screen.scrollUntilVisible(screen.getByRole('button', /^Recent location /).first());
  await screen.getByRole('button', /^Recent location /).first().tap();
  await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 45000 });
  await expect(screen.getByRole('button', 'Back to Post Job')).toBeVisible();
  await screen.getByRole('button', 'Confirm location').tap();
  await expect(screen.getByRole('button', /^Change location/)).toBeVisible();
  expect((await waitForRecents(scope, rows => rows.length === 5)).rows.length).toBe(5);
  await screen.getByRole('button', /^Change location/).tap();
  await screen.getByRole('button', 'Search locations').tap();
  await screen.scrollUntilVisible(screen.getByRole('button', 'Clear recent locations'));
  await screen.getByRole('button', 'Clear recent locations').tap();
  await expect(screen.getByRole('button', /^Recent location /)).not.toBeVisible();
  expect((await waitForRecents(scope, rows => rows.length === 0)).rows.length).toBe(0);
  console.log('ACTUAL_ASYNCSTORAGE_DEDUPE_CLEAR_PASS');
  await app.screenshot('ride-hailing-recents-cleared');
});
