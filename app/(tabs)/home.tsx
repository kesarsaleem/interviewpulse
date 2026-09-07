import React from 'react';
import { View, Text, FlatList, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Briefcase, Users } from 'lucide-react-native';

import { useAuth } from '../../hooks/useAuth';
import { useJobs } from '../../hooks/useJobs';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { SyncIndicator } from '../../components/sync/SyncIndicator';

export default function HomeScreen() {
  const { user } = useAuth();
  const { data: jobs = [], isLoading } = useJobs();

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="px-4 pt-2 pb-4 flex-row justify-between items-start">
        <View>
          <Text className="text-text-secondary text-sm">
            {greeting()}, <Text className="font-semibold text-text-primary">{user?.name}</Text>
          </Text>
          <Text className="text-text-muted text-xs capitalize mt-0.5">{user?.role}</Text>
        </View>
        <SyncIndicator />
      </View>

      <FlatList
        data={jobs}
        keyExtractor={(j) => j.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        ListEmptyComponent={
          !isLoading ? (
            <EmptyState
              icon={Briefcase}
              title="No open jobs yet"
              description={user?.role === 'admin' ? 'Create your first job opening to get started.' : 'Ask an admin to add you to a job panel.'}
            />
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/jobs/${item.id}`)}>
            <Card className="mb-3">
              <View className="flex-row justify-between items-start">
                <View className="flex-1 pr-2">
                  <Text className="font-semibold text-text-primary text-base">{item.title}</Text>
                  <Text className="text-text-secondary text-sm">{item.department}</Text>
                </View>
                <Badge
                  label={item.status}
                  tone={item.status === 'open' ? 'success' : item.status === 'closed' ? 'neutral' : 'warning'}
                />
              </View>
              <View className="flex-row items-center mt-3">
                <Users size={14} color="#9CA3AF" />
                <Text className="text-text-muted text-xs ml-1">{item.candidate_count ?? 0} candidates</Text>
              </View>
            </Card>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
