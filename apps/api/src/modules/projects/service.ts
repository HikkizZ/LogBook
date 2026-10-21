import type {
  CardCounts,
  CreateProjectBody,
  ProjectDto,
  ProjectWithCountsDto,
  UpdateProjectBody,
} from 'shared';
import { IsNull } from 'typeorm';
import { getDataSource } from '../../db/client.js';
import { CARD_STATUSES, Project } from '../../entities/index.js';
import type { CardStatus } from '../../entities/index.js';
import { AppError } from '../../http/errors.js';
import { now } from '../../lib/clock.js';
import { uniqueViolation } from '../../lib/pg-errors.js';
import { slugify } from '../../lib/slug.js';
import { getSettings } from '../settings/service.js';

const NAME_INDEX = 'UQ_project_name_active';
const SLUG_INDEX = 'UQ_project_slug';
const SLUG_ATTEMPTS = 5;
const DUPLICATE_NAME = 'Ya existe un proyecto activo con ese nombre';

export function toProjectDto(p: Project): ProjectDto {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    color: p.color,
    githubRepo: p.githubRepo,
    wipLimit: p.wipLimit,
    archivedAt: p.archivedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

const repo = () => getDataSource().getRepository(Project);

/** Convierte la violación del índice de nombre único entre activos en 409 (RF-01, §4.2). */
function rethrowDuplicateName(err: unknown): never {
  if (uniqueViolation(err) === NAME_INDEX) throw new AppError('CONFLICT', DUPLICATE_NAME);
  throw err;
}

/** El slug se genera del nombre y es único también entre archivados: si choca se añade `-2`, `-3`… */
async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name, 70) || 'proyecto';
  const rows = await repo()
    .createQueryBuilder('p')
    .select('p.slug', 'slug')
    .where('p.slug = :base OR p.slug LIKE :prefix', { base, prefix: `${base}-%` })
    .getRawMany<{ slug: string }>();
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
  }
}

export async function findProjectBySlug(slug: string): Promise<Project> {
  const project = await repo().findOneBy({ slug });
  if (!project) throw new AppError('NOT_FOUND', 'Proyecto no encontrado');
  return project;
}

function emptyCounts(): CardCounts {
  return Object.fromEntries(CARD_STATUSES.map((s) => [s, 0])) as CardCounts;
}

export async function listProjects(includeArchived: boolean): Promise<ProjectWithCountsDto[]> {
  const projects = await repo().find({
    where: includeArchived ? {} : { archivedAt: IsNull() },
    order: { createdAt: 'ASC', id: 'ASC' },
  });
  const rows = await getDataSource().query<{ project_id: string; status: CardStatus; n: number }[]>(
    `SELECT project_id, status, count(*)::int AS n FROM card WHERE archived_at IS NULL GROUP BY project_id, status`,
  );
  const byProject = new Map<string, CardCounts>();
  for (const row of rows) {
    const counts = byProject.get(row.project_id) ?? emptyCounts();
    counts[row.status] = row.n;
    byProject.set(row.project_id, counts);
  }
  return projects.map((p) => ({
    ...toProjectDto(p),
    cardCounts: byProject.get(p.id) ?? emptyCounts(),
  }));
}

export async function createProject(body: CreateProjectBody): Promise<ProjectDto> {
  // Sin `wipLimit`, el proyecto nuevo recibe el `wipDefault` de `/settings` (RF-13, #14).
  const wipLimit = body.wipLimit ?? (await getSettings()).wipDefault;
  for (let attempt = 1; ; attempt++) {
    const project = repo().create({
      name: body.name,
      slug: await uniqueSlug(body.name),
      color: body.color,
      githubRepo: body.githubRepo ?? null,
      wipLimit,
    });
    try {
      return toProjectDto(await repo().save(project));
    } catch (err) {
      // Otra alta simultánea tomó el mismo slug entre el cálculo y el INSERT: se recalcula (-2, -3…).
      // Si además el nombre era el mismo, el reintento choca con el índice de nombre y da 409.
      if (uniqueViolation(err) === SLUG_INDEX && attempt < SLUG_ATTEMPTS) continue;
      return rethrowDuplicateName(err);
    }
  }
}

export async function updateProject(slug: string, body: UpdateProjectBody): Promise<ProjectDto> {
  const project = await findProjectBySlug(slug);
  if (body.name !== undefined) project.name = body.name;
  if (body.color !== undefined) project.color = body.color;
  if (body.githubRepo !== undefined) project.githubRepo = body.githubRepo;
  if (body.wipLimit !== undefined) project.wipLimit = body.wipLimit;
  try {
    return toProjectDto(await repo().save(project));
  } catch (err) {
    return rethrowDuplicateName(err);
  }
}

/** RF-04 / RF-05: archivar; 409 si es el único proyecto activo. Idempotente si ya estaba archivado. */
export async function archiveProject(slug: string): Promise<ProjectDto> {
  return getDataSource().transaction(async (manager) => {
    // Bloquea los activos para que dos archivados simultáneos no dejen la app sin ninguno.
    const active = await manager.query<{ id: string }[]>(
      `SELECT id FROM project WHERE archived_at IS NULL FOR UPDATE`,
    );
    const project = await manager.findOneBy(Project, { slug });
    if (!project) throw new AppError('NOT_FOUND', 'Proyecto no encontrado');
    if (project.archivedAt) return toProjectDto(project);
    if (active.length <= 1) {
      throw new AppError('CONFLICT', 'No se puede archivar el único proyecto activo');
    }
    project.archivedAt = now();
    return toProjectDto(await manager.save(project));
  });
}

/** Desarchivar; 409 si ya hay un proyecto activo con el mismo nombre. Idempotente. */
export async function unarchiveProject(slug: string): Promise<ProjectDto> {
  const project = await findProjectBySlug(slug);
  if (!project.archivedAt) return toProjectDto(project);
  project.archivedAt = null;
  try {
    return toProjectDto(await repo().save(project));
  } catch (err) {
    return rethrowDuplicateName(err);
  }
}
