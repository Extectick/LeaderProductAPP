/** Ownership of the shared reference-picker rows. Only successful product
 * loads are restorable. Opening another reference invalidates ownership even
 * when the user closes it without selecting anything. */
export class ProductPickerSnapshot {
  private signature = '';

  open(kind: string, context: string) {
    const restore = kind === 'product' && this.matches(context);
    if (!restore) this.invalidate();
    return restore;
  }

  invalidate() { this.signature = ''; }
  loaded(context: string) { this.signature = context; }
  matches(context: string) { return !!context && this.signature === context; }
}
