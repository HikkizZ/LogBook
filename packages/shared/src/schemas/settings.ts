import { z } from 'zod';

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

// TODO(spec): la spec no fija rangos; se acotan a lo razonable (wip como `project.wip_limit`).
const timezoneSchema = z.string().refine(isTimeZone, 'zona horaria IANA inválida');
const doneDaysVisibleSchema = z.number().int().min(1).max(365);
const wipDefaultSchema = z.number().int().min(0).max(32767);

/** `GET /settings` y respuesta de `PATCH /settings` (§4.12). */
export const settingsSchema = z.object({
  timezone: timezoneSchema,
  doneDaysVisible: doneDaysVisibleSchema,
  wipDefault: wipDefaultSchema,
});
export type SettingsDto = z.infer<typeof settingsSchema>;

/** `PATCH /settings`: cualquier subconjunto (al menos una clave); claves desconocidas son 400. */
export const updateSettingsBodySchema = z
  .strictObject({
    timezone: timezoneSchema.optional(),
    doneDaysVisible: doneDaysVisibleSchema.optional(),
    wipDefault: wipDefaultSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'indica al menos un ajuste');
export type UpdateSettingsBody = z.infer<typeof updateSettingsBodySchema>;
