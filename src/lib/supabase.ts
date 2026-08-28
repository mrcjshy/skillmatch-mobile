import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

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
  return key;
}

// Low-privilege client only. Never configure a service or secret key here.
export const supabase = createClient(resolveSupabaseUrl(), resolveClientKey(), {
  auth: {
    ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
