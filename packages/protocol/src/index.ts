export * from './types';

/** Profils vocaux disponibles (timbre/pitch/débit). Voir VoiceBackend côté client. */
export const VOICE_PROFILES = [
  { name: 'grave-lent', pitch: 0.8, rate: 0.9 },
  { name: 'medium', pitch: 1.0, rate: 1.0 },
  { name: 'aigu-vif', pitch: 1.3, rate: 1.1 },
  { name: 'posé', pitch: 0.95, rate: 0.85 },
  { name: 'enjoué', pitch: 1.15, rate: 1.05 },
  { name: 'rauque', pitch: 0.7, rate: 0.95 },
] as const;

export const PROTOCOL_VERSION = 1;
