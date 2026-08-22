import { describe, test, expect } from 'bun:test';
import { Formatter } from '@/utils/formatter';

describe('utils/formatter', () => {
  test('Formatter.bytes converts bytes into human-readable strings', () => {
    expect(Formatter.bytes(0)).toBe('0 B');
    expect(Formatter.bytes(1024)).toBe('1 KB');
    expect(Formatter.bytes(1048576)).toBe('1 MB');
    expect(Formatter.bytes(1073741824)).toBe('1 GB');
  });

  test('Formatter.uptime calculates uptime correctly', () => {
    const uptime90s = Formatter.uptime(90); // 90 seconds (1m 30s)
    expect(uptime90s).toBe('1m 30s');

    const defaultUptime = Formatter.uptime();
    expect(defaultUptime).toMatch(/\d+s/);
  });

  test('Formatter.date formats Date objects, numbers, and strings using date-fns', () => {
    const fixedDate = new Date(2026, 7, 16, 11, 40, 30); // 2026-08-16 11:40:30
    expect(Formatter.date(fixedDate, 'yyyy-MM-dd')).toBe('2026-08-16');
    expect(Formatter.date(fixedDate, 'HH:mm:ss')).toBe('11:40:30');
    expect(Formatter.date(fixedDate, 'dd/MM/yyyy')).toBe('16/08/2026');
    expect(Formatter.date()).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  test('Formatter.capitalize formats string first letter to uppercase', () => {
    expect(Formatter.capitalize('hello')).toBe('Hello');
    expect(Formatter.capitalize('WORLD')).toBe('WORLD');
    expect(Formatter.capitalize('')).toBe('');
  });

  test('Formatter.truncate limits string length with ellipsis', () => {
    expect(Formatter.truncate('Hello World!', 20)).toBe('Hello World!');
    expect(Formatter.truncate('Hello World!', 5)).toBe('Hell…');
  });

  test('Formatter.slugify converts string to clean URL and namespace slug', () => {
    expect(Formatter.slugify('SuikaBot')).toBe('suikabot');
    expect(Formatter.slugify('Suika Bot V2:Dev')).toBe('suika-bot-v2-dev');
    expect(Formatter.slugify('  @Bot#Name!!  ')).toBe('botname');
  });

  test('Formatter.box formats title and lines into structured WhatsApp card', () => {
    const output = Formatter.box('INFO', ['Line 1', 'Line 2', undefined, false, 'Line 3']);
    expect(output).toContain('╭───「 *INFO* 」───');
    expect(output).toContain('│ Line 1');
    expect(output).toContain('│ Line 2');
    expect(output).toContain('│ Line 3');
    expect(output).toContain('╰────────────────────');
    expect(output).not.toContain('undefined');
  });

  test('Formatter.list formats array of items into bullet list', () => {
    const list = Formatter.list(['Apple', 'Banana'], '•');
    expect(list).toBe('• Apple\n• Banana');
  });

  test('Formatter.quote formats multi-line text with WhatsApp blockquote prefix', () => {
    const quote = Formatter.quote('First line\nSecond line');
    expect(quote).toBe('> First line\n> Second line');
  });

  test('Formatter.mono wraps text in monospace code block', () => {
    expect(Formatter.mono('bun test')).toBe('```bun test```');
  });
});

