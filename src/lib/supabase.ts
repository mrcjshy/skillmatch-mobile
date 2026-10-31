import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { toByteArray } from 'base64-js';
import { Platform } from 'react-native';

import { withAuthRequestTimeout } from '@/lib/auth-request-timeout';

// Expo inlines EXPO_PUBLIC_* variables only when read with static dot notation.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

function resolveSupabaseUrl(): string {
  if (!supabaseUrl) {
    throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL. See .env.example.');
  }
  return supabaseUrl;
}

function resolveClientKey(): string {
  if (publishableKey && anonKey) {
    throw new Error(
      'Ambiguous Supabase client configuration: set exactly one of ' +
        'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY or EXPO_PUBLIC_SUPABASE_ANON_KEY.'
    );
  }
  const key = publishableKey || anonKey;
  if (!key) {
    throw new Error(
      'Missing Supabase client key: set EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ' +
        '(preferred) or EXPO_PUBLIC_SUPABASE_ANON_KEY. See .env.example.'
    );
  }
  // Configuration screening only, never JWT verification or caller authorization.
  // Legacy public keys carry role=anon; service_role and server secrets belong only on the server.
  let isPublicKey = /^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
  if (!isPublicKey && key.length <= 32768) {
    try {
      const parts = key.split('.');
      if (parts.length === 3 && parts.every(part => /^[A-Za-z0-9_-]+$/.test(part))) {
        const payload = parts[1];
        const bytes = toByteArray(payload + '='.repeat((4 - payload.length % 4) % 4));
        const claims = JSON.parse(decodeURIComponent(Array.from(bytes, byte => '%' + byte.toString(16).padStart(2, '0')).join('')));
        isPublicKey = claims !== null && !Array.isArray(claims) && claims.role === 'anon';
      }
    } catch { /* Malformed configuration is rejected below without exposing the key. */ }
  }
  if (!isPublicKey) {
    throw new Error('Configure the public Supabase client with a publishable or legacy anon key only.');
  }
  return key;
}

const url = resolveSupabaseUrl();

// Low-privilege client only. Never configure a service or secret key here.
export const supabase = createClient(url, resolveClientKey(), {
  auth: {
    ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  // Bounds Auth requests only, so a refresh that is never answered cannot stall the
  // session for good; every other request is passed through unchanged.
  global: { fetch: withAuthRequestTimeout(url) },
});
