import { describe, test, expect, afterEach } from 'bun:test';
import { CronService } from '@/infra/cron';
import { sleep } from '@/utils/delay';

describe('infra/cron', () => {
  afterEach(() => {
    CronService.stopAll();
  });

  test('schedule() creates and triggers a cron task', async () => {
    let runs = 0;
    const taskName = 'test-schedule';

    // 6-part cron: runs every second (* * * * * *)
    const job = CronService.schedule(taskName, '* * * * * *', async () => {
      runs += 1;
    });

    expect(job).not.toBeUndefined();
    expect(CronService.get(taskName)).toBe(job);

    // Trigger manually to test execution without waiting 1s
    job.trigger();
    expect(runs).toBe(1);
  });

  test('cancel() stops specific scheduled task by name', async () => {
    let runs = 0;
    const taskName = 'test-cancel';

    const job = CronService.schedule(taskName, '* * * * * *', async () => {
      runs += 1;
    });

    job.trigger();
    expect(runs).toBe(1);

    const cancelled = CronService.cancel(taskName);
    expect(cancelled).toBe(true);
    expect(CronService.get(taskName)).toBeUndefined();
  });

  test('stopAll() cancels all scheduled tasks', async () => {
    let task1Runs = 0;
    let task2Runs = 0;

    const j1 = CronService.schedule('task-1', '0 * * * *', () => {
      task1Runs += 1;
    });
    const j2 = CronService.schedule('task-2', '0 * * * *', () => {
      task2Runs += 1;
    });

    j1.trigger();
    j2.trigger();

    expect(task1Runs).toBe(1);
    expect(task2Runs).toBe(1);

    CronService.stopAll();
    expect(CronService.get('task-1')).toBeUndefined();
    expect(CronService.get('task-2')).toBeUndefined();
  });
});
