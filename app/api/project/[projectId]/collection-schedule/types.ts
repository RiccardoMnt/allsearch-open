import { z } from 'zod';
import {
  MAX_CUSTOM_EVERY_DAYS,
  MAX_MONTH_DAY,
  MIN_CUSTOM_EVERY_DAYS,
} from '@/libs/collection/schedule';

export const SetCollectionScheduleBodySchema = z.object({
  schedule: z
    .discriminatedUnion('frequency', [
      z.object({ frequency: z.literal('daily') }),
      z.object({ frequency: z.literal('weekly'), weekday: z.number().int().min(0).max(6) }),
      z.object({
        frequency: z.literal('monthly'),
        monthDay: z.number().int().min(1).max(MAX_MONTH_DAY),
      }),
      z.object({
        frequency: z.literal('custom'),
        everyDays: z.number().int().min(MIN_CUSTOM_EVERY_DAYS).max(MAX_CUSTOM_EVERY_DAYS),
      }),
    ])
    .nullable(),
});
