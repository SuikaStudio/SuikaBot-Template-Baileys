import { readdirSync } from 'fs';
import { join } from 'path';

import { CronService } from '@/infra/cron';

import type { Schedule } from '@/types/schedule';

import config from '@/config';

import logger from '@/utils/logger';

export const initSchedules = async (): Promise<void> => {
  if (!config.schedules.enabled) {
    logger.info('[Schedules] Scheduled cron jobs are disabled (ENABLE_SCHEDULES=false)');
    return;
  }

  const schedulesDir = import.meta.dir;
  const entries = readdirSync(schedulesDir);

  let loadedCount = 0;

  for (const entry of entries) {
    if (
      entry.endsWith('.ts') &&
      !entry.endsWith('.test.ts') &&
      !entry.endsWith('.spec.ts') &&
      entry !== 'index.ts'
    ) {
      const fullPath = join(schedulesDir, entry);
      try {
        const module = await import(fullPath);
        const schedule = (module.default ?? module) as Schedule;

        if (schedule && schedule.name && schedule.pattern && typeof schedule.run === 'function') {
          if (schedule.enabled !== false) {
            CronService.schedule(schedule.name, schedule.pattern, schedule.run);
            loadedCount += 1;
          }
        }
      } catch (err) {
        logger.error({ err, file: entry }, '[Schedules] Failed to load schedule module');
      }
    }
  }

  logger.info({ count: loadedCount }, '[Schedules] All scheduled cron jobs registered');
};
