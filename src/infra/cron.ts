import { Cron, type CronOptions } from 'croner';
import config from '@/config';
import logger from '@/utils/logger';

interface CronScheduleOptions extends CronOptions {
  timezone?: string;
  protect?: boolean;
}

export class CronService {
  private static tasks = new Map<string, Cron>();

  /**
   * Schedule a periodic cron task using standard cron pattern (e.g. '0 7 * * *', '0 * * * *', '@hourly', or Date).
   */
  static schedule(
    name: string,
    pattern: string | Date,
    taskFn: (job: Cron) => Promise<void> | void,
    options?: CronScheduleOptions
  ): Cron {
    if (this.tasks.has(name)) {
      this.cancel(name);
    }

    const timezone = options?.timezone ?? config.tz ?? 'Asia/Jakarta';

    const job = new Cron(
      pattern,
      {
        name,
        timezone,
        protect: options?.protect ?? true,
        ...options,
      },
      async (jobInstance) => {
        try {
          await taskFn(jobInstance);
        } catch (err) {
          logger.error({ err, taskName: name }, '[CronService] Error executing scheduled task');
        }
      }
    );

    this.tasks.set(name, job);
    logger.info(
      { taskName: name, pattern: typeof pattern === 'string' ? pattern : pattern.toISOString(), timezone },
      '[CronService] Task scheduled'
    );
    return job;
  }

  /**
   * Cancel / stop a scheduled task by name.
   */
  static cancel(name: string): boolean {
    const job = this.tasks.get(name);
    if (job) {
      job.stop();
      this.tasks.delete(name);
      logger.info({ taskName: name }, '[CronService] Task cancelled');
      return true;
    }
    return false;
  }

  /**
   * Retrieve an active Cron instance by name.
   */
  static get(name: string): Cron | undefined {
    return this.tasks.get(name);
  }

  /**
   * Stop all scheduled tasks on shutdown.
   */
  static stopAll(): void {
    for (const [name, job] of this.tasks.entries()) {
      job.stop();
      logger.debug({ taskName: name }, '[CronService] Stopped task');
    }
    this.tasks.clear();
    logger.info('[CronService] All scheduled tasks stopped');
  }
}
