import Constants from 'expo-constants';
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import WebView, { WebViewMessageEvent, WebViewProps } from 'react-native-webview';
import { useTheme } from '../../context/ThemeContext';

type SessionStatus = 'loading' | 'connected' | 'error' | 'disconnected';

interface AnamMessage {
  status?: SessionStatus;
  message?: string;
}

interface AnamInterviewSessionProps {
  candidateId?: string;
}

interface PermissionRequestEvent {
  nativeEvent: {
    resources: string[];
    grant: (resources: string[]) => void;
  };
}

const CAMERA_PERMISSION = 'android.webkit.resource.VIDEO_CAPTURE';
const MICROPHONE_PERMISSION = 'android.webkit.resource.AUDIO_CAPTURE';

type WebViewWithPermissionProps = WebViewProps & {
  onPermissionRequest?: (event: PermissionRequestEvent) => void;
};

const WebViewWithPermissions = React.forwardRef<WebView, WebViewWithPermissionProps>(
  (props, ref) =>
    React.createElement(WebView, {
      ...props,
      ref,
    } as WebViewWithPermissionProps & { ref: React.Ref<WebView> })
);

export default function AnamInterviewSession({ candidateId }: AnamInterviewSessionProps) {
  const { colors } = useTheme();
  const webViewRef = useRef<WebView>(null);
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [statusMessage, setStatusMessage] = useState('Loading interview session...');
  const apiKey = Constants.expoConfig?.extra?.anamApiKey || '';
  const personaId = Constants.expoConfig?.extra?.anamPersonaId || '';

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as AnamMessage;
      if (message.status) setStatus(message.status);
      if (message.message) setStatusMessage(message.message);
    } catch {
      setStatus('error');
      setStatusMessage('Received an invalid session status.');
    }
  }, []);

  const sendSessionConfig = useCallback(() => {
    webViewRef.current?.postMessage(JSON.stringify({
      apiKey,
      personaConfig: {
        personaId,
        name: 'InterviewPulse AI Interviewer',
        systemPrompt: candidateId
          ? `Conduct a practice interview for candidate ${candidateId}.`
          : 'Conduct a friendly practice interview for the candidate.',
      },
    }));
  }, [apiKey, candidateId]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <WebViewWithPermissions
        ref={webViewRef}
        source={{ uri: 'https://enchanting-starship-2343e1.netlify.app' }}
        style={styles.webView}
        javaScriptEnabled
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        allowsFullscreenVideo
        originWhitelist={['*']}
        onLoad={sendSessionConfig}
        onMessage={handleMessage}
        onPermissionRequest={(event) => {
          const requestedResources = event.nativeEvent.resources.filter(
            (resource) => resource === CAMERA_PERMISSION || resource === MICROPHONE_PERMISSION
          );
          if (requestedResources.length > 0) {
            event.nativeEvent.grant(requestedResources);
          }
        }}
        onError={() => {
          setStatus('error');
          setStatusMessage('The interview session could not be loaded.');
        }}
        onContentProcessDidTerminate={() => {
          setStatus('disconnected');
          setStatusMessage('The interview session disconnected.');
        }}
      />
      {status !== 'connected' && (
        <View style={styles.statusOverlay}>
          {status === 'loading' && <ActivityIndicator color={colors.primary} />}
          <Text style={[styles.statusText, { color: colors.text }]}>{statusMessage}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webView: { flex: 1, backgroundColor: 'transparent' },
  statusOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusText: { flex: 1, fontSize: 14 },
});
