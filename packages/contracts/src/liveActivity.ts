import { z } from 'zod';

/** Canonical Live Activity shape (BACKEND_SETUP §8); mirrored in targets/widgets/BlockActivityAttributes.swift. */
export const NextBlock = z.object({
  title: z.string(),
  startsAt: z.iso.datetime(),
  durationMin: z.number().int(),
});
export const BlockActivityAttributes = z.object({
  blockKey: z.string(),
  title: z.string(),
  categoryColorHex: z.string(),
  startsAt: z.iso.datetime(),
});
export const BlockActivityContentState = z.object({
  endsAt: z.iso.datetime(),
  next: z.array(NextBlock).max(2),
});
