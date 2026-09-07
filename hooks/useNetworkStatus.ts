import { useEffect, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

export type NetworkState = 'online' | 'offline' | 'reconnecting';

/**
 * Tracks connectivity and exposes a transient "reconnecting" state right
 * after we come back online, so callers (e.g. the sync engine) can kick
 * off an automatic sync exactly once per reconnection.
 */
export function useNetworkStatus(onReconnect?: () => void) {
  const [state, setState] = useState<NetworkState>('online');
  const wasOffline = useRef(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((netState) => {
      const isConnected = Boolean(netState.isConnected && netState.isInternetReachable !== false);

      if (!isConnected) {
        wasOffline.current = true;
        setState('offline');
        return;
      }

      if (wasOffline.current) {
        setState('reconnecting');
        onReconnect?.();
        wasOffline.current = false;
        // Brief transitional state for the UI, then settle.
        setTimeout(() => setState('online'), 1500);
      } else {
        setState('online');
      }
    });

    return () => unsubscribe();
  }, [onReconnect]);

  return state;
}
