import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app, client } from '../../test/helpers.js';
import type { TestClient } from '../../test/helpers.js';

interface Item {
  id: string;
  text: string;
  done: boolean;
  position: number;
}

async function setup() {
  const api = await client();
  await api.post('/projects').send({ name: 'Alfa', color: 'violeta' });
  const card = await api.post('/cards').send({ project: 'alfa', title: 'Tarjeta' });
  return { api, ref: (card.body as { ref: string }).ref };
}

async function addItems(api: TestClient, ref: string, texts: string[]): Promise<Item[]> {
  const items: Item[] = [];
  for (const text of texts) {
    const res = await api.post(`/cards/${ref}/checklist`).send({ text });
    expect(res.status).toBe(201);
    items.push(res.body as Item);
  }
  return items;
}

async function order(api: TestClient, ref: string): Promise<[string, number][]> {
  const res = await api.get(`/cards/${ref}`);
  return (res.body as { checklist: Item[] }).checklist.map((i) => [i.text, i.position]);
}

describe('checklist (RF-24)', () => {
  it('RF-24 crear ítems los deja al final con posiciones 0..n-1 y done=false', async () => {
    const { api, ref } = await setup();
    const items = await addItems(api, ref, ['a', 'b', 'c']);
    expect(items.map((i) => [i.text, i.done, i.position])).toEqual([
      ['a', false, 0],
      ['b', false, 1],
      ['c', false, 2],
    ]);
  });

  it('RF-24 la tarjeta muestra 2/5 tras marcar dos de cinco ítems', async () => {
    const { api, ref } = await setup();
    const items = await addItems(api, ref, ['1', '2', '3', '4', '5']);
    for (const item of items.slice(0, 2)) {
      const res = await api.patch(`/checklist/${item.id}`).send({ done: true });
      expect(res.status).toBe(200);
      expect((res.body as Item).done).toBe(true);
    }
    const card = (await api.get(`/cards/${ref}`)).body as {
      checklistDone: number;
      checklistTotal: number;
    };
    expect([card.checklistDone, card.checklistTotal]).toEqual([2, 5]);
    const listed = (await api.get('/cards?project=alfa')).body as {
      items: { checklistDone: number; checklistTotal: number }[];
    };
    expect([listed.items[0]?.checklistDone, listed.items[0]?.checklistTotal]).toEqual([2, 5]);

    await api.patch(`/checklist/${items[0]?.id}`).send({ done: false });
    const again = (await api.get(`/cards/${ref}`)).body as { checklistDone: number };
    expect(again.checklistDone).toBe(1);
  });

  it('RF-24 editar el texto de un ítem', async () => {
    const { api, ref } = await setup();
    const [item] = await addItems(api, ref, ['viejo']);
    const res = await api.patch(`/checklist/${item?.id}`).send({ text: '  nuevo  ' });
    expect(res.status).toBe(200);
    expect((res.body as Item).text).toBe('nuevo');
  });

  it('RF-24 reordenar deja posiciones consecutivas sin huecos ni repetidos', async () => {
    const { api, ref } = await setup();
    const items = await addItems(api, ref, ['a', 'b', 'c', 'd']);

    await api.patch(`/checklist/${items[3]?.id}`).send({ position: 0 });
    expect(await order(api, ref)).toEqual([
      ['d', 0],
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);

    await api.patch(`/checklist/${items[3]?.id}`).send({ position: 2 });
    expect(await order(api, ref)).toEqual([
      ['a', 0],
      ['b', 1],
      ['d', 2],
      ['c', 3],
    ]);

    // Más allá del final se acota al último lugar.
    const res = await api.patch(`/checklist/${items[0]?.id}`).send({ position: 99 });
    expect((res.body as Item).position).toBe(3);
    expect(await order(api, ref)).toEqual([
      ['b', 0],
      ['d', 1],
      ['c', 2],
      ['a', 3],
    ]);
  });

  it('RF-24 borrar un ítem compacta las posiciones y actualiza el contador', async () => {
    const { api, ref } = await setup();
    const items = await addItems(api, ref, ['a', 'b', 'c']);
    expect((await api.delete(`/checklist/${items[0]?.id}`)).status).toBe(204);
    expect(await order(api, ref)).toEqual([
      ['b', 0],
      ['c', 1],
    ]);
    expect((await api.get(`/cards/${ref}`)).body).toMatchObject({ checklistTotal: 2 });
    expect((await api.delete(`/checklist/${items[0]?.id}`)).status).toBe(404);
  });

  it('RF-24 los checklists de dos tarjetas no se mezclan al reordenar', async () => {
    const { api, ref } = await setup();
    const other = (await api.post('/cards').send({ project: 'alfa', title: 'Otra' })).body as {
      ref: string;
    };
    const a = await addItems(api, ref, ['a1', 'a2']);
    await addItems(api, other.ref, ['b1', 'b2']);
    await api.patch(`/checklist/${a[1]?.id}`).send({ position: 0 });
    expect(await order(api, other.ref)).toEqual([
      ['b1', 0],
      ['b2', 1],
    ]);
  });

  it('RF-24 valida el cuerpo y las referencias', async () => {
    const { api, ref } = await setup();
    const [item] = await addItems(api, ref, ['a']);
    expect((await api.post(`/cards/${ref}/checklist`).send({ text: '   ' })).status).toBe(400);
    expect((await api.post(`/cards/${ref}/checklist`).send({ text: 'x'.repeat(301) })).status).toBe(
      400,
    );
    expect((await api.post('/cards/T-999/checklist').send({ text: 'x' })).status).toBe(404);
    expect((await api.patch(`/checklist/${item?.id}`).send({ position: -1 })).status).toBe(400);
    expect((await api.patch(`/checklist/${item?.id}`).send({ cardId: 'x' })).status).toBe(400);
    expect((await api.patch('/checklist/no-es-uuid').send({ done: true })).status).toBe(400);
    expect(
      (await api.patch('/checklist/0198a000-0000-7000-8000-000000000000').send({ done: true }))
        .status,
    ).toBe(404);
  });

  it('RF-24 sin credencial responde 401', async () => {
    const application = app();
    const res = await request(application).post('/api/v1/cards/T-1/checklist').send({ text: 'x' });
    expect(res.status).toBe(401);
    expect((await request(application).delete('/api/v1/checklist/x')).status).toBe(401);
  });
});
