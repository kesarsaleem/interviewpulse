import { createClient, AnamEvent, type AnamClient } from '@anam-ai/js-sdk';
import Constants from 'expo-constants';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { mediaDevices, RTCView, type MediaStream as NativeMediaStream } from 'react-native-webrtc';
import { Button } from '../ui/Button';
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../lib/supabase/client';
import { resetSpeakerAudioRoute, setSpeakerAudioRoute } from '../../lib/native/SpeakerAudio';

interface AnamInterviewSessionProps {
  candidateId?: string;
}

interface SessionTokenResponse {
  sessionToken?: string;
}

interface TranscriptMessage {
  id: string;
  content: string;
  role: 'user' | 'persona';
}

const personaName = 'Anam';

export default function AnamInterviewSession({ candidateId: _candidateId }: AnamInterviewSessionProps) {
  const { colors } = useTheme();
  const clientRef = useRef<AnamClient | null>(null);
  const audioStreamRef = useRef<NativeMediaStream | null>(null);
  const transcriptRef = useRef<ScrollView | null>(null);
  const startInFlightRef = useRef(false);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [status, setStatus] = useState('Ready to start the interview.');
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isActive, setIsActive] = useState(false);

  const stopAudioRoute = () => {
    resetSpeakerAudioRoute();
  };

  const stopAudioTracks = () => {
    audioStreamRef.current?.getTracks().forEach((track) => track.stop());
    audioStreamRef.current = null;
  };

  const cleanupSession = async () => {
    const client = clientRef.current;
    clientRef.current = null;
    setStreamUrl(null);
    setIsActive(false);
    stopAudioTracks();
    stopAudioRoute();
    if (client) await client.stopStreaming();
  };

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active' && clientRef.current) {
        void cleanupSession().catch((cleanupError) => {
          if (__DEV__) console.warn('Background cleanup failed:', cleanupError);
        });
      }
    });

    return () => {
      subscription.remove();
      void cleanupSession().catch((cleanupError) => {
        if (__DEV__) console.warn('Interview cleanup failed:', cleanupError);
      });
    };
  }, []);

  useEffect(() => {
    transcriptRef.current?.scrollToEnd({ animated: true });
  }, [transcript]);

  const fetchSessionToken = async () => {
    const { data, error: functionError } =
      await supabase.functions.invoke<SessionTokenResponse>('anam-session-token');

    if (functionError) throw new Error(`Could not get session token: ${functionError.message}`);
    if (!data?.sessionToken) throw new Error('Session token function returned no token.');
    return data.sessionToken;
  };

  const requestAudioStream = async () => {
    if (Platform.OS === 'android') {
      const permission = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: 'Microphone permission',
          message: 'InterviewPulse needs microphone access for the AI interview.',
          buttonPositive: 'Allow',
          buttonNegative: 'Deny',
        },
      );
      if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
        throw new Error('Microphone permission was denied.');
      }
    }

    if (Platform.OS === 'android') {
      setSpeakerAudioRoute();
    }

    const audioStream = await mediaDevices.getUserMedia({ audio: true, video: false });
    if (audioStream.getAudioTracks().length === 0) {
      audioStream.getTracks().forEach((track) => track.stop());
      throw new Error('Microphone capture returned no audio track.');
    }
    audioStreamRef.current = audioStream;
    return audioStream;
  };

  const updateStreamTranscript = (message: TranscriptMessage) => {
    setTranscript((current) => {
      const existingIndex = current.findIndex((item) => item.id === message.id);
      if (existingIndex < 0) return [...current, message];
      const next = [...current];
      next[existingIndex] = message;
      return next;
    });
  };

  const startInterview = async () => {
    if (startInFlightRef.current || clientRef.current) return;
    startInFlightRef.current = true;
    setIsStarting(true);
    setError(null);
    setTranscript([]);
    setStatus('Connecting...');

    try {
      const token = await fetchSessionToken();
      setStatus('Requesting microphone permission...');
      const audioStream = await requestAudioStream();
      const client = createClient(token, { disableInputAudio: false });
      clientRef.current = client;

      client.addListener(AnamEvent.MESSAGE_HISTORY_UPDATED, (messages) => {
        setTranscript(
          messages.map((message) => ({
            id: message.id,
            content: message.content,
            role: message.role,
          })),
        );
      });
      client.addListener(AnamEvent.MESSAGE_STREAM_EVENT_RECEIVED, (messageEvent) => {
        updateStreamTranscript({
          id: messageEvent.id,
          content: messageEvent.content,
          role: messageEvent.role,
        });
      });

      setStatus('Starting interview stream...');
      const streams = await client.stream(audioStream as unknown as globalThis.MediaStream);
      const videoStream = streams.find((stream) => stream.getVideoTracks().length > 0);
      if (!videoStream) throw new Error('Anam returned no video stream.');

      const nativeVideoStream = videoStream as typeof videoStream & { toURL(): string };
      setStreamUrl(nativeVideoStream.toURL());
      setIsActive(true);
      setStatus('Interview connected.');
    } catch (startError) {
      await cleanupSession().catch((cleanupError) => {
        if (__DEV__) console.warn('Failed-start cleanup failed:', cleanupError);
      });
      const message = startError instanceof Error ? startError.message : String(startError);
      setError(message);
      setStatus('Could not start interview.');
    } finally {
      startInFlightRef.current = false;
      setIsStarting(false);
    }
  };

  const endInterview = async () => {
    if (startInFlightRef.current) return;
    setStatus('Ending interview...');
    try {
      await cleanupSession();
      setStatus('Interview ended.');
    } catch (endError) {
      const message = endError instanceof Error ? endError.message : String(endError);
      setError(`Could not end interview cleanly: ${message}`);
      setStatus('Interview ended with a cleanup warning.');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.videoContainer, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        {streamUrl ? (
          <RTCView streamURL={streamUrl} style={styles.video} objectFit="contain" mirror={false} />
        ) : (
          <View style={styles.videoPlaceholder}>
            {isStarting ? <ActivityIndicator color={colors.primary} /> : null}
            <Text style={[styles.status, { color: colors.secondaryText }]}>{status}</Text>
          </View>
        )}
      </View>

      <Text style={[styles.status, { color: error ? colors.danger : colors.secondaryText }]}>
        {error ?? status}
      </Text>

      <View style={[styles.transcriptPanel, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <Text
          style={[
            styles.transcriptTitle,
            { color: colors.text, borderBottomColor: colors.divider },
          ]}
        >
          Live transcript
        </Text>
        <ScrollView ref={transcriptRef} contentContainerStyle={styles.transcriptContent}>
          {transcript.length === 0 ? (
            <Text style={[styles.emptyTranscript, { color: colors.mutedText }]}>
              Conversation messages will appear here.
            </Text>
          ) : (
            transcript.map((message) => (
              <Text key={message.id} style={[styles.message, { color: colors.text }]}>
                <Text style={styles.messageLabel}>
                  {message.role === 'user' ? 'You' : personaName}:
                </Text>{' '}
                {message.content}
              </Text>
            ))
          )}
        </ScrollView>
      </View>

      {!isActive ? (
        <Button label={isStarting ? 'Connecting...' : 'Start Interview'} onPress={startInterview} disabled={isStarting} fullWidth />
      ) : (
        <Button label="End Interview" onPress={endInterview} variant="danger" fullWidth />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  videoContainer: { width: '100%', aspectRatio: 16 / 9, borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  video: { flex: 1, backgroundColor: '#000' },
  videoPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 10 },
  status: { fontSize: 14, lineHeight: 20 },
  transcriptPanel: { flex: 1, minHeight: 140, borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  transcriptTitle: { fontSize: 16, fontWeight: '800', padding: 12, borderBottomWidth: 1 },
  transcriptContent: { padding: 12, gap: 10 },
  emptyTranscript: { fontSize: 14 },
  message: { fontSize: 14, lineHeight: 20 },
  messageLabel: { fontWeight: '800' },
});
