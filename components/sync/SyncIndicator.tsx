import { subscribeSyncState, SyncState, runSync } from '../../lib/sync/syncEngine';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useAuth } from '../../hooks/useAuth';
import React, { useEffect, useState } from 'react';
import { Text, Pressable, ActivityIndicator } from 'react-native';
import { RefreshCw, CheckCircle2, CloudOff, AlertTriangle } from 'lucide-react-native';

const config: Record<SyncState, { icon: React.ReactNode; label: string; color: string }> = {
  idle: { icon: <CheckCircle2 size={16} color="#16A34A" />, label: 'Synced', color: '#16A34A' },
  syncing: { icon: <ActivityIndicator size="small" />, label: 'Syncing…', color: '#4F46E5' },
  synced: { icon: <CheckCircle2 size={16} color="#16A34A" />, label: 'Synced', color: '#16A34A' },
  failed: { icon: <AlertTriangle size={16} color="#DC2626" />, label: 'Sync failed', color: '#DC2626' },
  offline: { icon: <CloudOff size={16} color="#D97706" />, label: 'Offline', color: '#D97706' },
};

export function SyncIndicator({ activeJobId }: { activeJobId?: string }) {
  const { user } = useAuth();
  const [syncState, setSyncState] = useState<SyncState>('idle');

  const kickOff = () => {
    if (!user) return;
    runSync(user.id, activeJobId).catch(() => {});
  };

  const network = useNetworkStatus(() => {
    if (user) kickOff();
  });

  useEffect(() => subscribeSyncState(setSyncState), []);

  const effective: SyncState = network === 'offline' ? 'offline' : syncState;
  const { icon, label, color } = config[effective];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Sync status: ${label}. Tap to sync now.`}
      onPress={kickOff}
      className="flex-row items-center px-3 py-1.5 rounded-full bg-surface border border-border"
    >
      {icon}
      <Text className="text-xs font-medium ml-1.5" style={{ color }}>
        {label}
      </Text>
      {effective !== 'syncing' && <RefreshCw size={12} color={color} style={{ marginLeft: 6 }} />}
    </Pressable>
  );
}
