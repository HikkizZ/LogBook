import type { SettingsDto, UpdateSettingsBody } from 'shared';
import type { EntityManager } from 'typeorm';
import { getDataSource } from '../../db/client.js';
import { AppSetting } from '../../entities/index.js';
import { initialTimezone } from '../../lib/clock.js';

// Clave de la tabla `app_setting` (snake_case) ↔ campo de la API (camelCase), spec §3 y §4.12.
const KEYS = {
  timezone: 'timezone',
  doneDaysVisible: 'done_days_visible',
  wipDefault: 'wip_default',
} as const satisfies Record<keyof SettingsDto, string>;

// Los mismos valores que siembra la migración, por si alguien borra una fila. La zona horaria, en cambio, parte
// de `APP_TIMEZONE` (solo su valor inicial, #13).
const defaults = (): SettingsDto => ({
  timezone: initialTimezone(),
  doneDaysVisible: 14,
  wipDefault: 3,
});

export async function getSettings(
  m: EntityManager = getDataSource().manager,
): Promise<SettingsDto> {
  const rows = await m.find(AppSetting);
  const stored = new Map(rows.map((r) => [r.key, r.value]));
  const fallback = defaults();
  const read = <K extends keyof SettingsDto>(field: K): SettingsDto[K] =>
    (stored.get(KEYS[field]) as SettingsDto[K] | undefined) ?? fallback[field];
  return {
    timezone: read('timezone'),
    doneDaysVisible: read('doneDaysVisible'),
    wipDefault: read('wipDefault'),
  };
}

/**
 * Zona horaria que agrupa los días de `/log` y `/summary` y define "hoy" en RF-15 (#13). Se lee de
 * `app_setting` en cada operación que la necesita (una consulta por clave primaria), sin caché: así un
 * `PATCH /settings` rige de inmediato y no hay estado que invalidar.
 */
export async function getTimezone(m: EntityManager = getDataSource().manager): Promise<string> {
  const row = await m.findOneBy(AppSetting, { key: KEYS.timezone });
  return typeof row?.value === 'string' ? row.value : initialTimezone();
}

/** Guarda solo las claves recibidas. */
export async function updateSettings(body: UpdateSettingsBody): Promise<SettingsDto> {
  const rows = (Object.keys(KEYS) as (keyof SettingsDto)[]).flatMap((field) =>
    body[field] === undefined ? [] : [{ key: KEYS[field], value: body[field] }],
  );
  await getDataSource().getRepository(AppSetting).save(rows);
  return getSettings();
}
