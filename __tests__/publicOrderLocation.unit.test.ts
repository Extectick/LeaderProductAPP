import { shareTokenFromLocation } from '../public-order/shareLocation';

describe('public order location compatibility', () => {
  it.each([12, 43])('keeps %i-character capability on both path and legacy links', length => {
    const token = 'x'.repeat(length);
    expect(shareTokenFromLocation({ pathname: '/order/', hash: '#' + token })).toBe(token);
    expect(shareTokenFromLocation({ pathname: '/order/' + token, hash: '' })).toBe(token);
    expect(shareTokenFromLocation({ pathname: '/order/' + token + '/', hash: '' })).toBe(token);
  });
  it.each(['/order/', '/order/no-code', '/order/' + 'x'.repeat(13), '/order/assets/app.js', '/other/' + 'x'.repeat(12), '/order/%3Cscript%3E'])('rejects malformed path %s', pathname => {
    expect(shareTokenFromLocation({ pathname, hash: '' })).toBeNull();
  });
  it('does not fall back to a different order if an explicit fragment is invalid', () => {
    expect(shareTokenFromLocation({ pathname: '/order/' + 'x'.repeat(12), hash: '#broken' })).toBeNull();
  });
});
