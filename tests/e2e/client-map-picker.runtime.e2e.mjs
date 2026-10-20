import { test, expect } from './runtime-tools.mjs';
import { execFileSync } from 'node:child_process';
import { openClientPicker, panToValidPin } from './client-picker-navigation.mjs';

test('actual full-screen picker renders without automatically requesting GPS', async fixtures => {
  await openClientPicker(fixtures);
  const { screen, app } = fixtures;
  await expect(screen.getByText(/Allow.*access.*location/i)).not.toBeVisible();
  await expect(screen.getByRole('button', 'Back to Post Job')).toBeVisible();
  await expect(screen.getByRole('button', 'Use My Location')).toBeVisible();
  await expect(screen.getByRole('button', 'Search locations')).toBeVisible();
  const box = await screen.getByLabel('Job location map').boundingBox();
  console.log('ACTUAL_MAP_BOUNDS', JSON.stringify(box));
  expect(box.height > 1900).toBe(true);
  await app.screenshot('ride-hailing-map-entry');
});

test('actual manual pin confirms to the draft and survives closing and reopening the picker', async fixtures => {
  const { screen, app } = fixtures;
  await panToValidPin(fixtures);
  await app.screenshot('ride-hailing-manual-location-ready');
  await screen.getByRole('button', 'Confirm location').tap();
  await expect(screen.getByText('Step 1 of 4')).toBeVisible();
  await expect(screen.getByRole('button', /^Change location/)).toBeVisible();
  console.log('DRAFT_LOCATION', await screen.getByRole('button', /^Change location/).textContent());
  await screen.getByRole('button', /^Change location/).tap();
  await expect(screen.getByLabel('Selected location address')).toBeVisible();
  await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 45000 });
  await screen.getByRole('button', 'Back to Post Job').tap();
  await expect(screen.getByRole('button', /^Change location/)).toBeVisible();
  await screen.getByRole('button', /^Change location/).tap();
  await screen.getByRole('button', 'Search locations').tap();
  await screen.scrollUntilVisible(screen.getByRole('button', /^Recent location /).first());
  await expect(screen.getByRole('button', /^Recent location /).first()).toBeVisible();
  await app.screenshot('ride-hailing-draft-restored');
});

test('actual network search stays in the map workflow', async ({ screen, device, app }) => {
  if (await screen.getByRole('button', 'Search locations').isVisible()) await screen.getByRole('button', 'Search locations').tap();
  await screen.scrollUntilVisible(screen.getByLabel('Search for location'));
  await screen.getByLabel('Search for location').fill('Santa Ana Pateros');
  await device.dismissKeyboard();
  const result = screen.getByRole('button', /^Search result /).first();
  try { await expect(result).toBeVisible({ timeout: 45000 }); }
  catch {
    await expect(screen.getByText('Search unavailable. Retry search or choose on the map.')).toBeVisible();
    await screen.getByRole('button', 'Back to map').tap();
    await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled();
    console.log('ACTUAL_SEARCH_FAILURE_PIN_RETAINED');
    return;
  }
  console.log('ACTUAL_SEARCH_RESULT', await result.textContent());
  await result.tap();
  await expect(screen.getByLabel('Selected location address')).toBeVisible();
  await expect(screen.getByRole('button', 'Back to Post Job')).toBeVisible();
  await app.screenshot('ride-hailing-search-camera-move');
});

test('actual accessibility controls retain 48dp targets and a persistent confirmation action', async ({ screen, app }) => {
  const density = execFileSync('adb', ['-s', 'emulator-5558', 'shell', 'wm', 'density'], { encoding: 'utf8', windowsHide: true });
  const values = [...density.matchAll(/density:\s*(\d+)/g)];
  const scale = Number(values.at(-1)[1]) / 160;
  for (const name of ['Back to Post Job', 'Use My Location', 'Confirm location']) {
    const control = screen.getByRole('button', name);
    await expect(control).toBeVisible();
    const box = await control.boundingBox();
    expect(box.width / scale >= 48 && box.height / scale >= 48).toBe(true);
  }
  await expect(screen.getByRole('button', 'Search locations')).toBeVisible();
  await expect(screen.getByLabel('Selected location address')).toBeVisible();
  await expect(screen.getByLabel('Center service location pin')).not.toBeVisible();
  await app.screenshot('ride-hailing-accessible-controls');
});
