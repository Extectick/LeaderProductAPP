const actions = ['picker_open', 'search_changed', 'search_cleared', 'page_load', 'page_append',
  'quantity_plus', 'quantity_minus', 'quantity_input', 'editor_open', 'editor_close'] as const;

export type PickerAction = typeof actions[number];
const limit = 12;
const allowed = new Set<string>(actions);
let activeOwner: number | null = null;
let recent: PickerAction[] = [];

export function setPickerActionOwner(owner: number | null) {
  if (activeOwner === owner) return;
  activeOwner = owner;
  recent = [];
}

export function recordPickerAction(owner: number, action: PickerAction) {
  if (!activeOwner || owner !== activeOwner || !allowed.has(action)) return;
  if (action === 'picker_open') recent = [];
  if (recent.length === limit) recent.shift();
  recent.push(action);
}

export function recentPickerActions(owner: number | null | undefined) {
  if (owner === activeOwner && recent.length) return recent.slice();
}

export function isPickerActionList(value: unknown): value is PickerAction[] {
  return Array.isArray(value) && value.length > 0 && value.length <= limit &&
    value.every(action => typeof action === 'string' && allowed.has(action));
}
