import type { Cron } from 'croner';

export interface Schedule {
  name: string;
  pattern: string | Date;
  enabled?: boolean;
  run: (job?: Cron) => Promise<void> | void;
}
