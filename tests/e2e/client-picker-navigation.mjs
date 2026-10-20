import { expect } from './runtime-tools.mjs';

export async function openClientPicker({ screen }) {
  if (await screen.getByLabel('Selected location address').isVisible()) return;
  const existingDraft = screen.getByRole('button', /^Choose location|^Change location/);
  if (await existingDraft.isVisible()) {
    await existingDraft.tap();
    await expect(screen.getByLabel('Selected location address')).toBeVisible();
    return;
  }
  await expect(screen.getByRole('button', 'Post a job')).toBeEnabled({ timeout: 120000 });
  await screen.getByRole('button', 'Post a job').tap();
  if (await existingDraft.isVisible()) {
    await existingDraft.tap();
    await expect(screen.getByLabel('Selected location address')).toBeVisible();
    return;
  }
  await expect(screen.getByText('Step 1 of 4')).toBeVisible();
  await screen.getByRole('button', /^Choose location|^Change location/).tap();
  await expect(screen.getByLabel('Selected location address')).toBeVisible();
  await expect(screen.getByLabel('Loading job location map')).not.toBeVisible({ timeout: 45000 });
}

export async function panToValidPin({ screen }) {
  await screen.swipe({ from: { x: 550, y: 750 }, to: { x: 490, y: 750 } });
  await expect(screen.getByRole('button', 'Confirm location')).toBeEnabled({ timeout: 45000 });
}
