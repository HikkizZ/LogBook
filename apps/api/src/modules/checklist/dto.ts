import type { ChecklistItemDto } from 'shared';
import type { ChecklistItem } from '../../entities/index.js';

export function toChecklistItemDto(item: ChecklistItem): ChecklistItemDto {
  return { id: item.id, text: item.text, done: item.done, position: item.position };
}
