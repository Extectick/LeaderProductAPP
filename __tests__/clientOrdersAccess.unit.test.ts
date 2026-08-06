import { isClientOrdersOnecUserLinked } from '../src/features/clientOrders/lib/clientOrdersAccess';

describe('client orders 1C access', () => {
  it('allows a user with a mapped 1C user', () => {
    expect(isClientOrdersOnecUserLinked({ employeeProfile: { onecUserGuid: ' user-guid ' } })).toBe(true);
  });

  it.each([
    null,
    {},
    { employeeProfile: null },
    { employeeProfile: { onecUserGuid: null } },
    { employeeProfile: { onecUserGuid: '   ' } },
  ])('blocks a user without a mapped 1C user: %p', (profile) => {
    expect(isClientOrdersOnecUserLinked(profile)).toBe(false);
  });
});
