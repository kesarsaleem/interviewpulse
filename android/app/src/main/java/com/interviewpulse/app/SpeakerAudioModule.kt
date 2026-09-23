package com.interviewpulse.app

import android.content.Context
import android.media.AudioManager
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class SpeakerAudioModule(
  reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

  private val audioManager =
    reactContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  private var previousMode = AudioManager.MODE_NORMAL
  private var previousSpeakerphoneState = false
  private var hasSavedAudioState = false

  override fun getName(): String = "SpeakerAudio"

  @ReactMethod
  fun setSpeakerOn() {
    if (!hasSavedAudioState) {
      previousMode = audioManager.mode
      previousSpeakerphoneState = audioManager.isSpeakerphoneOn
      hasSavedAudioState = true
    }

    audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
    audioManager.isSpeakerphoneOn = true
  }

  @ReactMethod
  fun reset() {
    if (!hasSavedAudioState) return

    audioManager.isSpeakerphoneOn = previousSpeakerphoneState
    audioManager.mode = previousMode
    hasSavedAudioState = false
  }
}
