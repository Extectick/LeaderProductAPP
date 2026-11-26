import {productPickerReadError} from '../src/features/clientOrders/lib/productPickerReadError';

test.each([0, 50])('a forbidden product read at offset %d points to the order context', offset => {
  const failure = productPickerReadError(403, offset);
  expect(failure).toMatchObject({kind: 'forbidden', retryOffset: 0});
  expect(failure.message).toContain('доступ');
});

test('an expired session requires a new login even if the first page was visible', () => {
  expect(productPickerReadError(401, 100)).toMatchObject({kind: 'unauthorized', retryOffset: 0});
});

test.each([0, 50, 120])('a transient failure retries the same offset %d', offset => {
  expect(productPickerReadError(503, offset)).toMatchObject({kind: 'retry', retryOffset: offset});
});
