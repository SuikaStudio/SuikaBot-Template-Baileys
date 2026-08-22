import { format } from 'date-fns';

export class Formatter {
  /**
   * Format uptime seconds into human readable duration string (e.g. 1d 2h 30m 15s).
   * Defaults to current process.uptime().
   */
  static uptime(seconds = process.uptime()): string {
    const totalSeconds = Math.floor(seconds);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${secs}s`);

    return parts.join(' ');
  }

  /**
   * Format bytes number into human-readable memory string (e.g. 1.5 MB).
   */
  static bytes(bytes: number, decimals = 2): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  }

  /**
   * Format a Date object, timestamp, or ISO string using date-fns format tokens.
   * Defaults to current timestamp if no date is provided.
   */
  static date(
    date: Date | number | string = new Date(),
    pattern = 'yyyy-MM-dd HH:mm:ss'
  ): string {
    return format(date, pattern);
  }

  /**
   * Capitalize first letter of string.
   */
  static capitalize(str: string): string {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Truncate string to specified max length with ellipsis.
   */
  static truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.slice(0, maxLength - 1) + '…';
  }

  /**
   * Convert a string into a clean, URL/namespace-friendly slug (lowercase, colons & spaces to hyphens).
   */
  static slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[:\s]+/g, '-')
      .replace(/[^a-z0-9_-]/g, '');
  }

  /**
   * Format lines into a styled WhatsApp box/card layout.
   */
  static box(title: string, lines: (string | undefined | null | false)[]): string {
    const validLines = lines.filter((l): l is string => Boolean(l));
    const header = `╭───「 *${title}* 」───`;
    const body = validLines.map((line) => `│ ${line}`).join('\n');
    const footer = '╰────────────────────';

    return validLines.length > 0 ? `${header}\n${body}\n${footer}` : `${header}\n${footer}`;
  }

  /**
   * Format an array of strings into a bullet list.
   */
  static list(items: string[], bullet = '•'): string {
    return items.map((item) => `${bullet} ${item}`).join('\n');
  }

  /**
   * Format text as a WhatsApp blockquote (> line).
   */
  static quote(text: string): string {
    return text
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');
  }

  /**
   * Wrap text in a monospace code block (```text```).
   */
  static mono(text: string): string {
    return `\`\`\`${text}\`\`\``;
  }
}

