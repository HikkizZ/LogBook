import type { SettingsDto, UpdateSettingsBody } from 'shared';
import { getDataSource } from '../../db/client.js';
import { AppSetting } from '../../entities/index.js';

// Clave de la tabla `app_setting` (snake_case) ↔ campo de la API (camelCase), spec §3 y §4.12.
const KEYS = {
  timezone: 'timezone',
  doneDaysVisible: 'done_days_visible',
  wipDefault: 'wip_default',
} as const satisfies Record<keyof SettingsDto, string>;

// Los mismos valores que siembra la migración, por si alguien borra una fila.
const DEFAULTS: SettingsDto = { timezone: 'America/Santiago', doneDaysVisible: 14, wipDefault: 3 };

export async function getSettings(): Promise<SettingsDto> {
  const rows = await getDataSource().getRepository(AppSetting).find();
  const stored = new Map(rows.map((r) => [r.key, r.value]));
  const read = <K extends keyof SettingsDto>(field: K): SettingsDto[K] =>
    (stored.get(KEYS[field]) as SettingsDto[K] | undefined) ?? DEFAULTS[field];
  return {
    timezone: read('timezone'),
    doneDaysVisible: read('doneDaysVisible'),
    wipDefault: read('wipDefault'),
  };
}

/**
 * Guarda solo las claves recibidas.
 * TODO(spec): `timezone` se guarda pero los días de `/log` y `/summary` siguen usando `APP_TIMEZONE`.
 */
export async function updateSettings(body: UpdateSettingsBody): Promise<SettingsDto> {
  const rows = (Object.keys(KEYS) as (keyof SettingsDto)[]).flatMap((field) =>
    body[field] === undefined ? [] : [{ key: KEYS[field], value: body[field] }],
  );
  await getDataSource().getRepository(AppSetting).save(rows);
  return getSettings();
}
