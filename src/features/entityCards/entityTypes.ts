export type {
  EntityTarget, EntityValue, EntityField, EntityTable, EntityCardData,
} from '@/src/shared/entityLinks';

export type EntityCardErrorKind = 'connect' | 'denied' | 'not-found' | 'unsupported' | 'unavailable' | 'session';

/** Safe UI errors, independent of raw provider diagnostics. */
export class EntityCardError extends Error {
  constructor(public readonly kind: EntityCardErrorKind, public readonly code: string, message: string) {
    super(message);
    this.name = 'EntityCardError';
  }
}
