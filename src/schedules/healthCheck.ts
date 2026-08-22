import type { Schedule } from '@/types/schedule';
import logger from '@/utils/logger';

const healthCheckSchedule: Schedule = {
  name: 'hourly-health-check',
  pattern: '0 * * * *',
  run() {
    logger.info('[Schedules] Periodic health check — SuikaBot is running smoothly');
  },
};

export default healthCheckSchedule;
