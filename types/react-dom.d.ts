declare module 'react-dom' {
  export function createPortal(children: any, container: Element | DocumentFragment): any;
  const ReactDOM: {
    createPortal: typeof createPortal;
  };
  export default ReactDOM;
}

