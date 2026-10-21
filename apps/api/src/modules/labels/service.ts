import type { CreateLabelBody, LabelDto, UpdateLabelBody } from 'shared';
import { getDataSource } from '../../db/client.js';
import { Label } from '../../entities/index.js';
import { AppError } from '../../http/errors.js';
import { uniqueViolation } from '../../lib/pg-errors.js';

const NAME_INDEX = 'UQ_label_name_lower';

export function toLabelDto(l: Label): LabelDto {
  return { id: l.id, name: l.name, color: l.color, createdAt: l.createdAt.toISOString() };
}

const repo = () => getDataSource().getRepository(Label);

/** Unicidad case-insensitive (RF-23): la garantiza el índice sobre `lower(name)`. */
function rethrowDuplicate(err: unknown): never {
  if (uniqueViolation(err) === NAME_INDEX) {
    throw new AppError('CONFLICT', 'Ya existe una etiqueta con ese nombre');
  }
  throw err;
}

async function findLabel(id: string): Promise<Label> {
  const label = await repo().findOneBy({ id });
  if (!label) throw new AppError('NOT_FOUND', 'Etiqueta no encontrada');
  return label;
}

export async function listLabels(): Promise<LabelDto[]> {
  const labels = await repo().find({ order: { createdAt: 'ASC', id: 'ASC' } });
  return labels.map(toLabelDto);
}

export async function createLabel(body: CreateLabelBody): Promise<LabelDto> {
  try {
    return toLabelDto(await repo().save(repo().create(body)));
  } catch (err) {
    return rethrowDuplicate(err);
  }
}

export async function updateLabel(id: string, body: UpdateLabelBody): Promise<LabelDto> {
  const label = await findLabel(id);
  if (body.name !== undefined) label.name = body.name;
  if (body.color !== undefined) label.color = body.color;
  try {
    return toLabelDto(await repo().save(label));
  } catch (err) {
    return rethrowDuplicate(err);
  }
}

/** RF-23: borrar quita la etiqueta de todas las tarjetas (`card_label` cae en cascada). */
export async function deleteLabel(id: string): Promise<void> {
  const result = await repo().delete({ id });
  if (!result.affected) throw new AppError('NOT_FOUND', 'Etiqueta no encontrada');
}
