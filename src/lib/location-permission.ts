type Permission = { status: string; canAskAgain?: boolean };
type PermissionSource = {
  getForegroundPermissionsAsync(): Promise<Permission>;
  requestForegroundPermissionsAsync(): Promise<Permission>;
};
export type LocationPermissionState = 'granted' | 'request' | 'settings';

/** Inspection never prompts. Only the explicit address-permission action may request. */
export async function inspectLocationPermission(
  source: PermissionSource,
  explicitRequest = false,
): Promise<LocationPermissionState> {
  let permission = await source.getForegroundPermissionsAsync();
  if (permission.status !== 'granted' && permission.canAskAgain !== false && explicitRequest) {
    permission = await source.requestForegroundPermissionsAsync();
  }
  return permission.status === 'granted' ? 'granted'
    : permission.canAskAgain === false ? 'settings' : 'request';
}
