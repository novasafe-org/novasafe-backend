/**
 * Cross-module domain event bus — placeholder.
 * Folder is named `domain-events` (not `events`) to avoid shadowing Node's built-in `events` module under tsx.
 */

export type DomainEventName = string;

export interface DomainEvent<T = unknown> {
  name: DomainEventName;
  payload: T;
  occurredAt: Date;
}

export const publishEvent = async (_event: DomainEvent): Promise<void> => {
  // No-op until event infrastructure is implemented
};
