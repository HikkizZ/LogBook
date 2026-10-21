import type { SearchQuery, SearchResultDto } from 'shared';
import { In } from 'typeorm';
import { getDataSource } from '../../db/client.js';
import { LogEntry } from '../../entities/index.js';
import { loadCardDtos } from '../cards/service.js';
import { toLogEntryDto } from '../log/dto.js';

const REF = /^T-(\d+)$/;
const MAX_INT4 = 2147483647;

// Opciones de `ts_headline`: <mark> para lo encontrado; el resto del texto se escapa antes (`escaped`).
const HEADLINE =
  "'StartSel=<mark>, StopSel=</mark>, MaxWords=30, MinWords=12, MaxFragments=1, FragmentDelimiter= … '";
const escaped = (text: string) =>
  `replace(replace(replace(${text}, '&', '&amp;'), '<', '&lt;'), '>', '&gt;')`;
// El stemmer `spanish` ya ignora tildes en la mayoría de las palabras ("migración" = "migracion"), pero
// no en todas ("facturación" ≠ "facturacion"); el respaldo ILIKE las pliega para cubrir ese hueco.
const folded = (text: string) => `translate(lower(${text}), 'áéíóúü', 'aeiouu')`;

/** Escapa `%`, `_` y `\` para usar el texto como literal dentro de un patrón LIKE. */
function likeLiteral(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

interface Hit {
  id: string;
  snippet: string;
}

interface EntryHit extends Hit {
  card_id: string;
}

/**
 * Tarjetas: `search @@ plainto_tsquery('spanish', q)` o, de respaldo, subcadena sin tildes (RF-52).
 * Primero las que casan por texto completo, por `ts_rank`; luego las del respaldo, las más recientes antes.
 */
async function searchCards(pattern: string, q: string, limit: number, exclude: number) {
  const text = `c.title || ' ' || c.description`;
  return getDataSource().query<Hit[]>(
    `SELECT c.id, ts_headline('spanish', ${escaped(text)}, query, ${HEADLINE}) AS snippet
     FROM card c, plainto_tsquery('spanish', $1) AS query
     WHERE c.number <> $4 AND (c.search @@ query OR ${folded(text)} LIKE ${folded('$2')})
     ORDER BY (c.search @@ query) DESC, ts_rank(c.search, query) DESC, c.updated_at DESC, c.id
     LIMIT $3`,
    [q, pattern, limit, exclude],
  );
}

async function searchEntries(pattern: string, q: string, limit: number) {
  return getDataSource().query<EntryHit[]>(
    `SELECT l.id, l.card_id, ts_headline('spanish', ${escaped('l.body')}, query, ${HEADLINE}) AS snippet
     FROM log_entry l, plainto_tsquery('spanish', $1) AS query
     WHERE l.search @@ query OR ${folded('l.body')} LIKE ${folded('$2')}
     ORDER BY (l.search @@ query) DESC, ts_rank(l.search, query) DESC, l.occurred_at DESC, l.id
     LIMIT $3`,
    [q, pattern, limit],
  );
}

/** La tarjeta buscada por `T-<n>`, con el inicio de su texto como fragmento (sin resaltado). */
async function exactCard(number: number): Promise<Hit | undefined> {
  const rows = await getDataSource().query<Hit[]>(
    `SELECT c.id, ${escaped(`left(c.title || ' ' || c.description, 200)`)} AS snippet
     FROM card c WHERE c.number = $1`,
    [number],
  );
  return rows[0];
}

/** `GET /search` (§4.8, RF-50..52). Tarjetas primero (la exacta `T-<n>` de todas), luego entradas de bitácora. */
export async function search({ q, limit }: SearchQuery): Promise<SearchResultDto> {
  const ref = REF.exec(q);
  const number = ref ? Number(ref[1]) : NaN;
  // `T-99999999999` no cabe en integer: no hay tarjeta exacta, no un error.
  const exact = ref && number <= MAX_INT4 ? await exactCard(number) : undefined;
  const pattern = `%${likeLiteral(q)}%`;

  const [cardHits, entryHits] = await Promise.all([
    searchCards(pattern, q, exact ? limit - 1 : limit, exact ? number : -1),
    searchEntries(pattern, q, limit),
  ]);
  const allCardHits = exact ? [exact, ...cardHits] : cardHits;

  const manager = getDataSource().manager;
  const cardIds = [
    ...new Set([...allCardHits.map((h) => h.id), ...entryHits.map((h) => h.card_id)]),
  ];
  const cards = new Map((await loadCardDtos(manager, cardIds)).map((c) => [c.id, c]));
  const entryRows =
    entryHits.length > 0
      ? await manager.find(LogEntry, { where: { id: In(entryHits.map((h) => h.id)) } })
      : [];
  const entries = new Map(entryRows.map((e) => [e.id, e]));

  return {
    cards: allCardHits.flatMap((h) => {
      const card = cards.get(h.id);
      return card ? [{ card, snippet: h.snippet }] : [];
    }),
    entries: entryHits.flatMap((h) => {
      const entry = entries.get(h.id);
      const card = cards.get(h.card_id);
      return entry && card
        ? [{ entry: toLogEntryDto(entry, card.number), card, snippet: h.snippet }]
        : [];
    }),
  };
}
