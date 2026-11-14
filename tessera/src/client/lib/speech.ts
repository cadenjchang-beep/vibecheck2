/** Text-to-speech through the browser's built-in speech synthesis. */

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  const wanted = lang.toLowerCase();
  const base = wanted.split('-')[0]!;
  return (
    voices.find((v) => v.lang.toLowerCase() === wanted) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(`${base}-`) && v.localService) ??
    voices.find((v) => v.lang.toLowerCase().split(/[-_]/)[0] === base)
  );
}

export interface SpeakOptions {
  rate?: number;
  onEnd?: () => void;
  onError?: () => void;
}

/** Speaks `text` in `lang`, replacing anything already being spoken. */
export function speak(text: string, lang: string, options: SpeakOptions = {}): void {
  if (!canSpeak() || !text.trim()) {
    options.onEnd?.();
    return;
  }
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  const voice = pickVoice(lang);
  if (voice) utterance.voice = voice;
  utterance.rate = options.rate ?? 1;
  utterance.onend = () => options.onEnd?.();
  utterance.onerror = (event) => {
    // "interrupted" and "canceled" are our own stop(), not failures.
    if (event.error === 'interrupted' || event.error === 'canceled') return;
    (options.onError ?? options.onEnd)?.();
  };
  synth.speak(utterance);
}

export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
}

export function hasVoiceFor(lang: string): boolean {
  return canSpeak() && Boolean(pickVoice(lang));
}
