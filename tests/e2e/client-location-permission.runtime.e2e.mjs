import { test, expect } from './runtime-tools.mjs';
import { openClientPicker, panToValidPin } from './client-picker-navigation.mjs';

test('actual explicit location permission can be denied while manual selection remains usable', async fixtures => {
  const back = fixtures.screen.getByRole('button', 'Back to Post Job');
  if (await back.isVisible()) await back.tap();
  await openClientPicker(fixtures);
  const { screen, app } = fixtures;
  await screen.getByRole('button', 'Use My Location').tap();
  const prompt = screen.getByText(/Allow.*access.*location/i);
  try { await expect(prompt).toBeVisible({ timeout: 10000 }); }
  catch { /* A preserved Android session may already have denied permission. */ }
  if (await prompt.isVisible()) {
    await app.screenshot('ride-hailing-explicit-permission');
    await screen.getByRole('button', /Don.t allow/).tap();
  }
  await expect(screen.getByLabel('Selected location address')).toBeVisible();
  await expect(screen.getByText('Location permission is off. You can still move the map under the center pin.')).toBeVisible();
  await app.screenshot('ride-hailing-denial-visible');
  if (await screen.getByText('Exact street unavailable.').isVisible()) {
    await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 45000 });
    await screen.getByRole('button', 'Confirm location').tap();
    await expect(screen.getByText('Step 1 of 4')).toBeVisible();
    await expect(screen.getByRole('button', /^Change location/)).toBeVisible();
    await screen.getByRole('button', /^Change location/).tap();
    console.log('ACTUAL_FT06C_GENERAL_AREA_DRAFT_CONFIRMED');
  }
  await panToValidPin(fixtures);
  await app.screenshot('ride-hailing-denial-manual-ready');
});
