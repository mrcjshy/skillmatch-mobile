// @ts-expect-error -- Node-only offline build-input boundary; not a native import.
import { readFileSync } from 'node:fs';
// @ts-expect-error -- Node-only loading of the actual Expo configuration.
import { createRequire } from 'node:module';
import { expect, it } from 'vitest';

const config = createRequire(import.meta.url)('../../app.config.js').expo as {
  android: { package: string; googleServicesFile?: string };
};

it('binds the existing QA package to an explicit Firebase native configuration input', () => {
  expect(config.android.package).toBe('com.mrcjshy.skillmatch.uiv3qa');
  expect(config.android.googleServicesFile).toBe('./google-services.json');
});

it('has exactly one Firebase registration for the QA package in the existing project', () => {
  const firebase = JSON.parse(readFileSync(config.android.googleServicesFile ?? './google-services.json', 'utf8'));
  expect(firebase.project_info.project_id).toBe('skillmatch-livelihood');
  const matches = firebase.client.filter((entry: { client_info: { android_client_info: { package_name: string } } }) =>
    entry.client_info.android_client_info.package_name === config.android.package);
  expect(matches.length).toBe(1);
});
