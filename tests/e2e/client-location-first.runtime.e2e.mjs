import { test, expect } from './runtime-tools.mjs';

// Compose exposes these dialog labels beside unnamed button nodes. Its label
// cannot own a semantic tap; use the visible label's observed native bounds.
async function tapDialogLabel(screen, locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  await screen.tapAt({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
}

test('Client starts with location and prepares local job details without posting', async ({ screen, device, app }) => {
  await expect(screen.getByRole('button', 'Post a job')).toBeEnabled({ timeout: 120000 });
  await screen.getByRole('button', 'Post a job').tap();
  await expect(screen.getByText('Step 1 of 4')).toBeVisible();
  await expect(screen.getByLabel('Description')).not.toBeVisible();
  await screen.getByRole('button', /^Choose location/).tap();
  await expect(screen.getByLabel('Loading job location map')).not.toBeVisible({ timeout: 45000 });
  await screen.swipe({ from: { x: 540, y: 850 }, to: { x: 660, y: 850 } });
  await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 45000 });
  if (await screen.getByRole('button', 'Use exact pin instead').isVisible()) await screen.getByRole('button', 'Use exact pin instead').tap();
  await screen.getByRole('button', 'Confirm location').tap();
  await expect(screen.getByText('Step 1 of 4')).toBeVisible();
  console.log('SCREENSHOT', await app.screenshot('v8-client-step-1-location'));
  await screen.getByRole('button', 'Next').tap();
  await expect(screen.getByText('Step 2 of 4')).toBeVisible();
  await screen.getByLabel('Description').fill('Preview only: repair the leaking kitchen sink pipe.');
  await device.dismissKeyboard();
  await screen.scrollUntilVisible(screen.getByRole('button', 'Choose skills'));
  await screen.getByRole('button', 'Choose skills').tap();
  await screen.scrollUntilVisible(screen.getByRole('checkbox', 'Plumbing'));
  await screen.getByRole('checkbox', 'Plumbing').tap();
  await screen.getByRole('button', 'Done').tap();
  await screen.scrollUntilVisible(screen.getByRole('button', 'Next'));
  await screen.getByRole('button', 'Next').tap();
  await screen.getByRole('button', /^Scheduled date/).tap();
});

test('Client resumes the existing draft schedule and edits location back to Review without posting', async ({ screen, device, app }) => {
  if (await screen.getByLabel('Change to next month').isVisible()) {
    await tapDialogLabel(screen, screen.getByLabel('Change to next month'));
    await tapDialogLabel(screen, screen.getByText(/, \w+ 15, \d{4}$/));
    await tapDialogLabel(screen, screen.getByText('OK', { exact: true }));
    await screen.getByRole('button', /^Scheduled time/).tap();
  }
  await tapDialogLabel(screen, screen.getByText('OK', { exact: true }));
  await screen.getByRole('radio', '₱500').tap();
  await screen.scrollUntilVisible(screen.getByRole('radio', 'Cash'));
  await screen.getByRole('radio', 'Cash').tap();
  await screen.scrollUntilVisible(screen.getByRole('button', 'Next'));
  await screen.getByRole('button', 'Next').tap();
  await screen.scrollUntilVisible(screen.getByText('Step 4 of 4'), { direction: 'up' });
  await expect(screen.getByText('Step 4 of 4')).toBeVisible();
  await expect(screen.getByRole('button', 'Post job')).toBeEnabled();
  console.log('SCREENSHOT', await app.screenshot('v8-client-step-4-review'));
  await screen.scrollUntilVisible(screen.getByRole('button', 'Edit location'));
  await screen.getByRole('button', 'Edit location').tap();
  await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 45000 });
  await device.back();
  await screen.scrollUntilVisible(screen.getByText('Step 4 of 4'), { direction: 'up' });
  await expect(screen.getByText('Step 4 of 4')).toBeVisible();
  await screen.scrollUntilVisible(screen.getByRole('button', 'Edit location'));
  await screen.getByRole('button', 'Edit location').tap();
  await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 45000 });
  console.log('SCREENSHOT', await app.screenshot('v8-client-review-edit-location'));
  await screen.swipe({ from: { x: 540, y: 850 }, to: { x: 440, y: 850 } });
  await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 45000 });
  await screen.getByRole('button', 'Confirm location').tap();
  await screen.scrollUntilVisible(screen.getByText('Step 4 of 4'), { direction: 'up' });
  await expect(screen.getByText('Step 4 of 4')).toBeVisible();
  await expect(screen.getByText('Preview only: repair the leaking kitchen sink pipe.')).toBeVisible();
  await expect(screen.getByRole('button', 'Post job')).toBeEnabled();
  console.log('SCREENSHOT', await app.screenshot('v8-client-edit-returned-to-review'));
});

test('Client preserves the existing draft through Android Back and Next to Review', async ({ screen, device, app }) => {
  await expect(screen.getByText('Step 4 of 4')).toBeVisible();
  for (const step of [3, 2, 1]) {
    await device.back();
    await screen.scrollUntilVisible(screen.getByText(`Step ${step} of 4`), { direction: 'up' });
    await expect(screen.getByText(`Step ${step} of 4`)).toBeVisible();
  }
  await expect(screen.getByRole('button', /^Change location/)).toBeVisible();
  await expect(screen.getByLabel('Description')).not.toBeVisible();
  console.log('SCREENSHOT', await app.screenshot('v8-client-step-1-preserved-location'));
  for (const step of [2, 3, 4]) {
    await screen.scrollUntilVisible(screen.getByRole('button', 'Next'));
    await screen.getByRole('button', 'Next').tap();
    await screen.scrollUntilVisible(screen.getByText(`Step ${step} of 4`), { direction: 'up' });
    await expect(screen.getByText(`Step ${step} of 4`)).toBeVisible();
  }
  await expect(screen.getByText('Preview only: repair the leaking kitchen sink pipe.')).toBeVisible();
  await expect(screen.getByText('Plumbing', { exact: true })).toBeVisible();
  await expect(screen.getByText('Cash', { exact: true })).toBeVisible();
  await expect(screen.getByRole('button', 'Post job')).toBeEnabled();
  console.log('SCREENSHOT', await app.screenshot('v8-client-preserved-review'));
});
