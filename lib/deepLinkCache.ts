import * as Linking from 'expo-linking';

// expo-router resolves the app's initial deep link internally (to decide
// which route to open) before any individual screen mounts. By the time a
// screen's own useEffect calls Linking.getInitialURL(), the answer can come
// back empty/null on some builds. Capturing it here, at module import time
// (which happens before the navigator or any screen renders), avoids that
// race: whoever asks first gets the same cached promise/value.

let cachedInitialUrl: string | null | undefined;
const initialUrlPromise: Promise<string | null> = Linking.getInitialURL().then((url) => {
  cachedInitialUrl = url;
  if (__DEV__) console.log('[DeepLink] COLD START RAW URL:', url);
  return url;
});

let latestUrl: string | null = null;
const listeners = new Set<(url: string) => void>();

Linking.addEventListener('url', ({ url }) => {
  latestUrl = url;
  if (__DEV__) console.log('[DeepLink] WARM RAW URL:', url);
  listeners.forEach((listener) => listener(url));
});

export async function getEarlyInitialUrl(): Promise<string | null> {
  if (cachedInitialUrl !== undefined) return cachedInitialUrl;
  return initialUrlPromise;
}

export function getLatestUrl(): string | null {
  return latestUrl;
}

export function onDeepLinkUrl(listener: (url: string) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
