export { createNpc } from './AiNpc';
export { detectAffordances, classifySurface, DEFAULT_AFFORDANCE_CONFIG } from './affordances';
export { resolveBrain, resolveVoice } from './adapters';
export type {
  AiNpcOptions,
  AiNpcHandle,
  Brain,
  Voice,
  Speech,
  BrainConfig,
  VoiceConfig,
  ChatMessage,
  Affordance,
  AffordanceConfig,
  Anchor,
  Mood,
  Vec3,
} from './types';
