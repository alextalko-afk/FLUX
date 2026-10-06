import { describe, it, expect } from 'vitest';
import { isFetchableUrl, isPrivateAddress } from '../../../apps/server/src/link-preview/ssrf.util';

describe('link preview SSRF guard', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254',
    '0.0.0.0', '100.64.0.1', '::1', '::', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', 'not-an-ip',
  ])('blocks %s', (address) => expect(isPrivateAddress(address)).toBe(true));

  it.each(['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111'])('allows %s', (address) =>
    expect(isPrivateAddress(address)).toBe(false),
  );

  it('accepts only plain http(s) urls on default ports without credentials', () => {
    expect(isFetchableUrl('https://example.com/a?b=1')).not.toBeNull();
    for (const bad of ['file:///etc/passwd', 'ftp://x.com', 'javascript:alert(1)', 'http://u:p@x.com', 'http://x.com:6379', 'nope'])
      expect(isFetchableUrl(bad)).toBeNull();
  });
});
