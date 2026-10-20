import { execFileSync } from 'node:child_process';
import { test, expect } from './runtime-tools.mjs';

const QUALIFY_NOTICE = 'You can see this exact location because you currently qualify. Access may end if your eligibility changes.';

// The framework snapshot holds only on-screen nodes, so each target is scrolled to itself rather
// than to a heading that may already be visible. Its swipe does not move every React Native list;
// a bounded adb swipe is the fallback. The swipe starts above the footer, so it never touches Accept.
async function reveal(screen, locator) {
  if (await locator.isVisible()) return;
  try { await screen.scrollUntilVisible(locator); } catch { /* fall back to adb below */ }
  const serial = process.env.SKILLMATCH_RUNTIME_SERIAL;
  for (let swipes = 0; swipes < 6 && !(await locator.isVisible()); swipes++) {
    if (!serial) throw new Error('SKILLMATCH_RUNTIME_SERIAL is required for the adb scroll fallback');
    execFileSync('adb', ['-s', serial, 'shell', 'input', 'swipe', '540', '1600', '540', '900', '400'], { windowsHide: true, timeout: 15000 });
  }
}

test('existing eligible Worker inspects the saved exact destination without accepting', async ({ screen, app }) => {
  const opportunity = screen.getByRole('button', /View job opportunity details/).first();
  await expect(opportunity).toBeVisible({ timeout: 120000 });
  await opportunity.tap();
  await expect(screen.getByRole('button', /^Accept /)).toBeEnabled({ timeout: 45000 });
  const notice = screen.getByText(QUALIFY_NOTICE);
  await reveal(screen, notice);
  await expect(notice).toBeVisible();
  const map = screen.getByLabel('Exact job opportunity location');
  await reveal(screen, map);
  await expect(map).toBeVisible();
  await expect(screen.getByLabel('Loading job location map')).not.toBeVisible({ timeout: 45000 });
  console.log('SCREENSHOT', await app.screenshot('v8-worker-exact-location-before-accept'));
  // Accept is checked, never pressed.
  await expect(screen.getByRole('button', /^Accept /)).toBeEnabled();
});
