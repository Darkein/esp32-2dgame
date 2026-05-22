import { VOICE_PROFILES } from '@game/protocol';

/**
 * TTS navigateur (Web Speech). Chaque IA a un profil vocal distinct (voix + pitch + débit).
 * Limite : l'API navigateur sérialise la parole ; la vraie lecture simultanée multi-canaux
 * arrive avec le backend Piper côté serveur (phase 6). Dégradation propre si indisponible.
 */
export class VoiceManager {
  private enabled = false;
  private frVoices: SpeechSynthesisVoice[] = [];
  private supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  constructor() {
    if (!this.supported) return;
    const load = () => {
      const all = speechSynthesis.getVoices();
      this.frVoices = all.filter((v) => v.lang.toLowerCase().startsWith('fr'));
      if (this.frVoices.length === 0) this.frVoices = all.slice(0, 4);
    };
    load();
    speechSynthesis.onvoiceschanged = load;
  }

  /** Doit être appelé suite à une interaction utilisateur (politique audio des navigateurs). */
  toggle(): boolean {
    this.enabled = this.supported && !this.enabled;
    if (!this.enabled) speechSynthesis.cancel();
    return this.enabled;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  speak(text: string, profileIndex: number): void {
    if (!this.enabled || !text) return;
    // Évite l'accumulation si beaucoup d'IA parlent en rafale.
    if (speechSynthesis.pending && speechSynthesis.speaking) return;
    const profile = VOICE_PROFILES[profileIndex % VOICE_PROFILES.length]!;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'fr-FR';
    u.pitch = profile.pitch;
    u.rate = profile.rate;
    if (this.frVoices.length > 0) u.voice = this.frVoices[profileIndex % this.frVoices.length]!;
    speechSynthesis.speak(u);
  }
}
