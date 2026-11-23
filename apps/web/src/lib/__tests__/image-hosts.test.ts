import { describe, expect, it } from 'vitest';

import { canOptimizeImage } from '../image-hosts';

describe('canOptimizeImage', () => {
  it('optimizes local /public assets and the API host', () => {
    expect(canOptimizeImage('/brand/mealawe-logo-dark.png')).toBe(true);
    expect(canOptimizeImage('https://api.mealawe.com/images/dish.jpg')).toBe(true);
  });

  it('loads unknown hosts, protocol mismatches, private IPs and previews directly', () => {
    expect(canOptimizeImage('https://example.com/a.jpg')).toBe(false);
    expect(canOptimizeImage('http://api.mealawe.com/images/dish.jpg')).toBe(false);
    expect(canOptimizeImage('//api.mealawe.com/images/dish.jpg')).toBe(false);
    expect(canOptimizeImage('http://localhost:3000/images/a.jpg')).toBe(false);
    expect(canOptimizeImage('http://192.168.1.5/images/a.jpg')).toBe(false);
    expect(canOptimizeImage('blob:http://localhost:3000/1234')).toBe(false);
    expect(canOptimizeImage('data:image/png;base64,AAAA')).toBe(false);
    expect(canOptimizeImage('not a url')).toBe(false);
  });
});
