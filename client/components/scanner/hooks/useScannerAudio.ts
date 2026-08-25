import { useEffect, useRef, useCallback } from "react";

export type SoundType = "beep" | "success" | "error" | "focus";

/**
 * Scanner audio feedback system with haptic support
 */
export function useScannerAudio() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const soundsRef = useRef<Record<SoundType, AudioBuffer | null>>({
    beep: null,
    success: null,
    error: null,
    focus: null,
  });

  /**
   * Initialize audio context and preload sounds
   */
  useEffect(() => {
    // Create audio context on user interaction
    const initAudio = () => {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
        preloadSounds();
      }
    };

    // Initialize on first interaction
    document.addEventListener("click", initAudio, { once: true });
    document.addEventListener("touchstart", initAudio, { once: true });

    return () => {
      // Only close if context exists and is not already closed
      if (
        audioContextRef.current &&
        audioContextRef.current.state !== "closed"
      ) {
        audioContextRef.current.close().catch((err) => {
          console.warn("AudioContext close error:", err);
        });
      }
    };
  }, []);

  /**
   * Preload all sound effects
   */
  const preloadSounds = async () => {
    if (!audioContextRef.current) return;

    try {
      soundsRef.current = {
        beep: await createBeep(800, 50),
        success: await createChime([523, 659, 784], 150),
        error: await createBeep(200, 200),
        focus: await createBeep(1000, 30),
      };
    } catch (error) {
      console.error("Failed to preload sounds:", error);
    }
  };

  /**
   * Create beep tone
   */
  const createBeep = async (
    frequency: number,
    duration: number,
  ): Promise<AudioBuffer> => {
    if (!audioContextRef.current) {
      throw new Error("AudioContext not initialized");
    }

    const sampleRate = audioContextRef.current.sampleRate;
    const buffer = audioContextRef.current.createBuffer(
      1,
      (sampleRate * duration) / 1000,
      sampleRate,
    );
    const data = buffer.getChannelData(0);

    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      // Simple sine wave with envelope
      const envelope = Math.exp(-t * 5); // Exponential decay
      data[i] = Math.sin(2 * Math.PI * frequency * t) * 0.3 * envelope;
    }

    return buffer;
  };

  /**
   * Create pleasant chord
   */
  const createChime = async (
    frequencies: number[],
    duration: number,
  ): Promise<AudioBuffer> => {
    if (!audioContextRef.current) {
      throw new Error("AudioContext not initialized");
    }

    const sampleRate = audioContextRef.current.sampleRate;
    const buffer = audioContextRef.current.createBuffer(
      1,
      (sampleRate * duration) / 1000,
      sampleRate,
    );
    const data = buffer.getChannelData(0);

    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      let sample = 0;

      frequencies.forEach((freq) => {
        sample += Math.sin(2 * Math.PI * freq * t);
      });

      // Average and apply envelope
      const envelope = Math.exp(-t * 3);
      data[i] = (sample / frequencies.length) * 0.3 * envelope;
    }

    return buffer;
  };

  /**
   * Play sound effect
   */
  const playSound = useCallback((type: SoundType) => {
    // Check if context exists and is not closed
    if (
      !audioContextRef.current ||
      audioContextRef.current.state === "closed"
    ) {
      console.warn("AudioContext not available or closed");
      return;
    }

    if (!soundsRef.current[type]) {
      console.warn(`Sound "${type}" not available`);
      return;
    }

    try {
      const source = audioContextRef.current.createBufferSource();
      source.buffer = soundsRef.current[type];
      source.connect(audioContextRef.current.destination);
      source.start();

      // Trigger haptic feedback
      triggerHaptic(type);
    } catch (error) {
      console.error("Failed to play sound:", error);
    }
  }, []);

  /**
   * Trigger haptic feedback (vibration)
   */
  const triggerHaptic = (type: SoundType) => {
    if (!("vibrate" in navigator)) return;

    const patterns: Record<SoundType, number | number[]> = {
      beep: [20],
      success: [50, 50, 50],
      error: [200],
      focus: [10],
    };

    navigator.vibrate(patterns[type]);
  };

  /**
   * Speak instruction using Web Speech API
   */
  const speak = useCallback((text: string) => {
    if (!("speechSynthesis" in window)) {
      console.warn("Speech synthesis not supported");
      return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.1; // Slightly faster
    utterance.pitch = 1.0;
    utterance.volume = 0.8;

    window.speechSynthesis.speak(utterance);
  }, []);

  return {
    playSound,
    speak,
  };
}
