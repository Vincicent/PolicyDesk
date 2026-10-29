import { RequestTypePipe } from './request-type.pipe';

describe('RequestTypePipe', () => {
  const pipe = new RequestTypePipe(); // a pipe is a plain class: no TestBed needed

  it.each([
    ['fund_switch', 'Fund switch'],
    ['partial_surrender', 'Partial surrender'],
    ['extra_premium', 'Extra premium'],
  ] as const)('%s → %s', (type, label) => {
    expect(pipe.transform(type)).toBe(label);
  });
});
