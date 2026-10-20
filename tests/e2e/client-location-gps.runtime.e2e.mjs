import { test, expect } from './runtime-tools.mjs';
import { openClientPicker } from './client-picker-navigation.mjs';

test('actual foreground GPS moves the camera to a controlled Santa Ana emulator location', async fixtures => {
  if (process.env.SKILLMATCH_RUNTIME_CURRENT_PICKER !== '1') await openClientPicker(fixtures);
  const { screen, device, app } = fixtures;
  await device.setLocation({ latitude: 14.5444514, longitude: 121.07205067 });
  await screen.getByRole('button', 'Use My Location').tap();
  const permission = screen.getByRole('button', /While using the app/i);
  try { await expect(permission).toBeVisible({ timeout: 10000 }); }
  catch { /* A preceding controlled run may already have granted permission. */ }
  if (await permission.isVisible()) await permission.tap();
  // Google Play emulators may require a separate device-accuracy setting.
  const accuracy = screen.getByRole('button', 'Turn on');
  try { await expect(accuracy).toBeVisible({ timeout: 10000 }); }
  catch { /* Already enabled: permission remains the only dialog. */ }
  if (await accuracy.isVisible()) await accuracy.tap();
  await device.setLocation({ latitude: 14.5444514, longitude: 121.07205067 });
  await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 60000 });
  await expect(screen.getByRole('button', 'Use My Location')).toBeEnabled();
  await app.screenshot('ride-hailing-emulator-gps-ready');
});
