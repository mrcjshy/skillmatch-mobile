import { test, expect } from './runtime-tools.mjs';
import { execFileSync } from 'node:child_process';
import { openClientPicker } from './client-picker-navigation.mjs';

test('actual street map entry and rendered landmark context', async fixtures => {
  if (await fixtures.screen.getByRole('button', 'Done').isVisible()) {
    await fixtures.device.dismissKeyboard();
    await fixtures.screen.scrollUntilVisible(fixtures.screen.getByRole('checkbox', 'Plumbing'));
    await fixtures.screen.getByRole('checkbox', 'Plumbing').tap();
    await fixtures.screen.getByRole('button', 'Done').tap();
    await fixtures.screen.scrollUntilVisible(fixtures.screen.getByRole('button', 'Next'));
    await fixtures.screen.getByRole('button', 'Next').tap();
  }
  await openClientPicker(fixtures);
  const { screen, app } = fixtures;
  await expect(screen.getByRole('button', 'Search locations')).toBeVisible();
  await app.screenshot('street-picker-entry');
  console.log('SELECTED_ADDRESS', await screen.getByLabel('Selected location address').textContent());
  await screen.getByRole('button', 'Search locations').tap();
  const nearby = screen.getByLabel('Nearby landmarks');
  console.log('ACTUAL_NEARBY_VISIBLE', await nearby.isVisible());
  if (await nearby.isVisible()) console.log('ACTUAL_NEARBY', await nearby.textContent());
  await screen.getByRole('button', 'Back to map').tap();
});

test('actual street map pan settles address and landmarks without confirmation', async ({ screen, device, app }) => {
  await device.setLocation({ latitude: 14.5444514, longitude: 121.07205067 });
  await screen.getByRole('button', 'Use My Location').tap();
  await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 60000 });
  await app.screenshot('street-picker-controlled-gps');
  await screen.swipe({ from: { x: 540, y: 850 }, to: { x: 540, y: 750 } });
  await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 45000 });
  await app.screenshot('street-picker-pan');
  console.log('PAN_ADDRESS', await screen.getByLabel('Selected location address').textContent());
  await screen.getByRole('button', 'Search locations').tap();
  const nearby = screen.getByLabel('Nearby landmarks');
  console.log('PAN_NEARBY_VISIBLE', await nearby.isVisible());
  if (await nearby.isVisible()) console.log('PAN_NEARBY', await screen.getByRole('button', /^Move map to /).first().textContent());
  await screen.getByRole('button', 'Back to map').tap();
});

test('actual Photon street selection collapses search and stays in picker', async ({ screen, device, app }) => {
  await screen.getByRole('button', 'Search locations').tap();
  await screen.getByLabel('Search for location').fill('Santa Ana Covered Court');
  await device.dismissKeyboard();
  const result = screen.getByRole('button', /^Search result /).first();
  await expect(result).toBeVisible({ timeout: 45000 });
  console.log('PHOTON_PUBLIC_RESULT', await result.textContent());
  await result.tap();
  await expect(result).not.toBeVisible();
  await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 45000 });
  await expect(screen.getByRole('button', 'Back to Post Job')).toBeVisible();
  await app.screenshot('street-picker-photon');
  await screen.getByRole('button', 'Search locations').tap();
  const landmark = screen.getByRole('button', 'Move map to Santa Ana Covered Court');
  await expect(landmark).toBeVisible();
  await landmark.tap();
  await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 45000 });
  await expect(screen.getByRole('button', 'Back to Post Job')).toBeVisible();
  await app.screenshot('street-picker-real-landmark-tap');
});


test('actual font scales keep location context and confirmation readable', async fixtures => {
  const { screen, device, app } = fixtures;
  try {
    for (const scale of ['1.0', '1.3']) {
      const back = screen.getByRole('button', 'Back to Post Job');
      if (await back.isVisible()) await back.tap();
      execFileSync('adb', ['-s', 'emulator-5558', 'shell', 'settings', 'put', 'system', 'font_scale', scale], { windowsHide: true });
      await device.closeApp();
      await device.openLink('skillmatchmobile://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081');
      await openClientPicker(fixtures);
      await device.setLocation({ latitude: 14.547, longitude: 121.0717 });
      await screen.getByRole('button', 'Use My Location').tap();
      await expect(screen.getByRole('button', 'Search locations')).toBeVisible();
      await expect(screen.getByLabel('Selected location address')).toBeVisible();
      await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 45000 });
      const box = await screen.getByRole('button', 'Confirm location').boundingBox();
      expect(box.y + box.height < 2400).toBe(true);
      await app.screenshot(`street-picker-font-${scale}`);
      console.log('FONT_SCALE_CTA', scale, JSON.stringify(box));
      const nearby = screen.getByRole('button', /^Move map to /).first();
      if (await nearby.isVisible()) {
        const row = await nearby.boundingBox();
        console.log('FONT_SCALE_NEARBY', scale, JSON.stringify(row));
      }
    }
  } finally {
    const back = screen.getByRole('button', 'Back to Post Job');
    if (await back.isVisible()) await back.tap();
    execFileSync('adb', ['-s', 'emulator-5558', 'shell', 'settings', 'put', 'system', 'font_scale', '1.0'], { windowsHide: true });
  }
});

test('actual enlarged sheet scrolls to recents and retains accessible controls', async fixtures => {
  const { screen, device, app } = fixtures;
  try {
    execFileSync('adb', ['-s', 'emulator-5558', 'shell', 'settings', 'put', 'system', 'font_scale', '1.3'], { windowsHide: true });
    await device.closeApp();
    await device.openLink('skillmatchmobile://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081');
    await openClientPicker(fixtures);
    await device.setLocation({ latitude: 14.547, longitude: 121.0717 });
    await screen.getByRole('button', 'Use My Location').tap();
    await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 45000 });
    await screen.getByRole('button', 'Search locations').tap();
    await device.dismissKeyboard();
    const recent = screen.getByRole('button', /^Recent location /).first();
    await screen.scrollUntilVisible(recent);
    await recent.tap();
    await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 45000 });
    await expect(screen.getByRole('button', 'Back to Post Job')).toBeVisible();
    const density = execFileSync('adb', ['-s', 'emulator-5558', 'shell', 'wm', 'density'], { encoding: 'utf8', windowsHide: true });
    const scale = Number([...density.matchAll(/density:\s*(\d+)/g)].at(-1)[1]) / 160;
    for (const name of ['Back to Post Job', 'Use My Location', 'Confirm location']) {
      const control = screen.getByRole('button', name);
      await expect(control).toBeVisible();
      const box = await control.boundingBox();
      expect(box.width / scale >= 48 && box.height / scale >= 48).toBe(true);
    }
    await expect(screen.getByLabel('Selected location address')).toBeVisible();
    await expect(screen.getByLabel('Center service location pin')).not.toBeVisible();
    await app.screenshot('street-picker-enlarged-recents-accessibility');
  } finally {
    const back = screen.getByRole('button', 'Back to Post Job');
    if (await back.isVisible()) await back.tap();
    execFileSync('adb', ['-s', 'emulator-5558', 'shell', 'settings', 'put', 'system', 'font_scale', '1.0'], { windowsHide: true });
  }
});
