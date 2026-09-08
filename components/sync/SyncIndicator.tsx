import { subscribeSyncState, SyncState, runSync } from '../../lib/sync/syncEngine';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useAuth } from '../../hooks/useAuth';
import React, { useEffect, useState } from 'react';
import { Text, Pressable, ActivityIndicator } from 'react-native';
import { RefreshCw, CheckCircle2, CloudOff, AlertTriangle } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';

export function SyncIndicator({ activeJobId }: { activeJobId?: string }) {
  const { user } = useAuth();
  const { colors } = useTheme();
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
  const color = {
    idle: colors.success,
    syncing: colors.primary,
    synced: colors.success,
    failed: colors.danger,
    offline: colors.warning,
  }[effective];
  const icon = effective === 'failed'
    ? <AlertTriangle size={16} color={color} />
    : effective === 'offline'
      ? <CloudOff size={16} color={color} />
      : effective === 'syncing'
        ? <ActivityIndicator size="small" color={color} />
        : <CheckCircle2 size={16} color={color} />;
  const label = effective === 'failed'
    ? 'Sync failed'
    : effective === 'offline'
      ? 'Offline'
      : effective === 'syncing'
        ? 'Syncing…'
        : 'Synced';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Sync status: ${label}. Tap to sync now.`}
      onPress={kickOff}
      className="flex-row items-center px-3 py-1.5 rounded-full border"
      style={{ backgroundColor: colors.card, borderColor: colors.border }}
    >
      {icon}
      <Text className="text-xs font-medium ml-1.5" style={{ color }}>
        {label}
      </Text>
      {effective !== 'syncing' && <RefreshCw size={12} color={color} style={{ marginLeft: 6 }} />}
    </Pressable>
  );
}
