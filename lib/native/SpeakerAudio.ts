import { NativeModules, Platform } from 'react-native';

interface SpeakerAudioModule {
  setSpeakerOn(): void;
  reset(): void;
}

const nativeSpeakerAudio = NativeModules.SpeakerAudio as SpeakerAudioModule | undefined;

export function setSpeakerAudioRoute() {
  if (Platform.OS === 'android') {
    if (!nativeSpeakerAudio) {
      throw new Error('SpeakerAudio native module is unavailable. Rebuild the Android app.');
    }
    nativeSpeakerAudio.setSpeakerOn();
  }
}

export function resetSpeakerAudioRoute() {
  if (Platform.OS === 'android') {
    nativeSpeakerAudio?.reset();
  }
}
