import { describe, it, expect } from 'vitest';
import { formatPhone, messages } from '../../supabase/functions/make-server-283d8046/email-confirmation.ts';
import { emailHtml } from '../../supabase/functions/make-server-283d8046/email-template.ts';

describe('email formatting', () => {
  it('writes phone numbers the way people read them', () => {
    expect(formatPhone('5125550199')).toBe('(512) 555-0199');
    expect(formatPhone('15125550199')).toBe('(512) 555-0199');
    expect(formatPhone('+442079460958')).toBe('+442079460958');
    expect(formatPhone('12345')).toBe('12345');
  });
  it('shows formatted numbers in the church digest, both new and current', () => {
    const html = emailHtml(messages.ownerDigest('Grace', 'https://x.test', [{ field: 'phone', value: '5125550199', current: '5125550123' }], 14));
    expect(html).toContain('(512) 555-0199'); expect(html).toContain('Currently: (512) 555-0123');
  });
});
