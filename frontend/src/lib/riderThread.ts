import type { Conversation, ConversationType } from '../types';

const RIDER_TYPES: ConversationType[] = ['rider_seller', 'rider_buyer', 'rider_hub'];

/** Rider delivery threads (feature 2.10) share the inbox with shop chats but look and behave differently. */
export function isRiderThread(conversation: Pick<Conversation, 'type'>): boolean {
  return RIDER_TYPES.includes(conversation.type);
}
