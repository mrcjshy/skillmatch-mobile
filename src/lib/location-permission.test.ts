import { describe, expect, it, vi } from 'vitest';
import { inspectLocationPermission } from './location-permission';

describe('foreground address permission', () => {
  it('never prompts during inspection', async () => {
    const location = { getForegroundPermissionsAsync: vi.fn().mockResolvedValue({ status: 'undetermined', canAskAgain: true }), requestForegroundPermissionsAsync: vi.fn() };
    expect(await inspectLocationPermission(location)).toBe('request');
    expect(location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });
  it('requests only from an explicit action', async () => {
    const location = { getForegroundPermissionsAsync: vi.fn().mockResolvedValue({ status: 'denied', canAskAgain: true }), requestForegroundPermissionsAsync: vi.fn().mockResolvedValue({ status: 'granted' }) };
    expect(await inspectLocationPermission(location, true)).toBe('granted');
    expect(location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  });
  it('directs permanent denial to settings without prompting', async () => {
    const location = { getForegroundPermissionsAsync: vi.fn().mockResolvedValue({ status: 'denied', canAskAgain: false }), requestForegroundPermissionsAsync: vi.fn() };
    expect(await inspectLocationPermission(location, true)).toBe('settings');
    expect(location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });
  it('uses an existing grant without requesting again', async () => {
    const location = { getForegroundPermissionsAsync: vi.fn().mockResolvedValue({ status: 'granted' }), requestForegroundPermissionsAsync: vi.fn() };
    expect(await inspectLocationPermission(location, true)).toBe('granted');
    expect(location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });
});
