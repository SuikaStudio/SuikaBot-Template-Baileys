import { describe, it, expect, afterEach } from 'bun:test';
import { initSchedules } from '@/schedules/index';
import { CronService } from '@/infra/cron';

describe('schedules/index', () => {
  afterEach(() => {
    CronService.stopAll();
  });

  it('initSchedules auto-loads schedules from src/schedules/ folder', async () => {
    await initSchedules();

    const schedule = CronService.get('hourly-health-check');
    expect(schedule).not.toBeUndefined();
  });
});
