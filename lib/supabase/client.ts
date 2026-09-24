import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl as string;
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase configuration. Set EXPO_PUBLIC_SUPABASE_URL and ' +
      'EXPO_PUBLIC_SUPABASE_ANON_KEY in your environment / app.config.ts.'
  );
}

/**
 * Expo SecureStore enforces a 2048-byte (2 KB) maximum value size limit.
 * Supabase auth sessions (containing JWT access tokens, refresh tokens, and user metadata)
 * frequently exceed 2 KB, which triggers runtime warnings or storage failures.
 *
 * To safely support sessions of any size:
 * 1. Values are split into chunks of CHUNK_SIZE (1024 chars), safely below the 2048-byte limit.
 * 2. Key naming convention:
 *    - Chunk count manifest: `${key}_chunk_count`
 *    - Individual chunk keys: `${key}_chunk_${index}` (e.g. `..._chunk_0`, `..._chunk_1`)
 * 3. Backward compatibility:
 *    - If `${key}_chunk_count` is absent, `getItem` falls back to reading `${key}` directly,
 *      ensuring existing users with un-chunked sessions are not logged out.
 * 4. Cleanup:
 *    - When updating, leftover chunks from older larger values are deleted.
 *    - `removeItem` deletes all chunks, the count key, and any legacy un-chunked key.
 * 5. Web fallback:
 *    - SecureStore is native-only; AsyncStorage is used on web where no 2 KB limit exists.
 */
const CHUNK_SIZE = 1024;

const getSecureStoreItem = async (key: string): Promise<string | null> => {
  const countStr = await SecureStore.getItemAsync(`${key}_chunk_count`);
  if (countStr !== null) {
    const count = parseInt(countStr, 10);
    if (isNaN(count) || count <= 0) {
      return null;
    }

    let reconstructed = '';
    for (let i = 0; i < count; i++) {
      const chunk = await SecureStore.getItemAsync(`${key}_chunk_${i}`);
      if (chunk === null) {
        // A missing chunk indicates corrupted or incomplete data
        return null;
      }
      reconstructed += chunk;
    }
    return reconstructed;
  }

  // Graceful fallback for un-chunked values from previous versions
  return await SecureStore.getItemAsync(key);
};

const setSecureStoreItem = async (key: string, value: string): Promise<void> => {
  // Check previous chunk count to clean up any excess keys if the new value is smaller
  const previousCountStr = await SecureStore.getItemAsync(`${key}_chunk_count`);
  const previousCount = previousCountStr ? parseInt(previousCountStr, 10) : 0;

  const count = Math.max(1, Math.ceil(value.length / CHUNK_SIZE));

  for (let i = 0; i < count; i++) {
    const chunk = value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    await SecureStore.setItemAsync(`${key}_chunk_${i}`, chunk);
  }

  // Delete leftover chunks if the previous stored value used more chunks
  if (!isNaN(previousCount) && previousCount > count) {
    for (let i = count; i < previousCount; i++) {
      await SecureStore.deleteItemAsync(`${key}_chunk_${i}`);
    }
  }

  // Save the chunk count manifest
  await SecureStore.setItemAsync(`${key}_chunk_count`, String(count));

  // Remove any legacy un-chunked key to avoid duplicate/stale data
  await SecureStore.deleteItemAsync(key).catch(() => {});
};

const removeSecureStoreItem = async (key: string): Promise<void> => {
  const countStr = await SecureStore.getItemAsync(`${key}_chunk_count`);
  if (countStr !== null) {
    const count = parseInt(countStr, 10);
    if (!isNaN(count)) {
      for (let i = 0; i < count; i++) {
        await SecureStore.deleteItemAsync(`${key}_chunk_${i}`);
      }
    }
    await SecureStore.deleteItemAsync(`${key}_chunk_count`);
  }

  // Ensure any legacy un-chunked key is also cleaned up
  await SecureStore.deleteItemAsync(key).catch(() => {});
};

/** SecureStore with chunking on native; AsyncStorage on web. */
const authStorage = {
  getItem: (key: string) =>
    Platform.OS === 'web' ? AsyncStorage.getItem(key) : getSecureStoreItem(key),
  setItem: (key: string, value: string) =>
    Platform.OS === 'web' ? AsyncStorage.setItem(key, value) : setSecureStoreItem(key, value),
  removeItem: (key: string) =>
    Platform.OS === 'web' ? AsyncStorage.removeItem(key) : removeSecureStoreItem(key),
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
