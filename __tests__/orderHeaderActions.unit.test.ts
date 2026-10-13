import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useOrderAction } from '../src/features/clientOrders/hooks/useOrderAction';
import fs from 'fs';
import path from 'path';

test('header feedback settles and actions use the latest committed draft', () => {
  let renders = 0;
  let submit!: () => void;
  let update!: (value: number) => void;
  const saved = jest.fn();
  const HeaderContext = React.createContext<React.Dispatch<React.SetStateAction<object>>>(() => {});
  function Editor({ quantity }: { quantity: number }) {
    if (++renders > 25) throw new Error('Header update loop');
    const setHeader = React.useContext(HeaderContext);
    // The actual workspace is a fresh object with each render too.
    const workspace = { submitOrder: () => saved(quantity) };
    submit = useOrderAction(() => workspace.submitOrder());
    const header = React.useMemo(() => ({ submit }), [submit]);
    React.useLayoutEffect(() => setHeader(header), [header, setHeader]);
    return null;
  }
  function Parent() {
    const [, setHeader] = React.useState<object>({});
    const [quantity, setQuantity] = React.useState(1);
    update = setQuantity;
    return React.createElement(HeaderContext.Provider, { value: setHeader }, React.createElement(Editor, { quantity }));
  }
  let view!: TestRenderer.ReactTestRenderer;
  act(() => { view = TestRenderer.create(React.createElement(Parent)); });
  const initialAction = submit;
  for (let n = 2; n <= 12; n++) act(() => update(n));
  expect(submit).toBe(initialAction);
  act(() => submit());
  expect(saved).toHaveBeenCalledWith(12);
  expect(renders).toBeLessThan(25);
  act(() => view.unmount());
});

test('all workspace-wide document header handlers use stable actions', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/features/clientOrders/ClientOrdersMobileScreen.tsx'), 'utf8');
  for (const name of ['removeOrCancel', 'deleteDocumentFromMenu', 'submitFromMenu', 'copyFromMenu']) {
    expect(source).toContain(`const ${name} = useOrderAction(`);
  }
  const boundary = fs.readFileSync(path.join(__dirname, '../src/features/clientOrders/screen/ClientOrdersScreen.tsx'), 'utf8');
  expect(boundary).toContain('captureException(error, { contexts: { react_native_context:');
});
