import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app, newBearer } from '../test/helpers.js';

const HTML = '<!doctype html><html><body><div id="root"></div></body></html>';
let dir: string;
let withWeb: Express;

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'logbook-web-'));
  mkdirSync(path.join(dir, 'assets'));
  writeFileSync(path.join(dir, 'index.html'), HTML);
  writeFileSync(path.join(dir, 'assets', 'index-abc123.js'), 'console.log(1);');
  writeFileSync(path.join(dir, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  withWeb = app({ webDistDir: dir });
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('RD-03 web servida por Express', () => {
  it('/assets/* se cachea un año como immutable', async () => {
    const res = await request(withWeb).get('/assets/index-abc123.js');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('index.html va sin caché, tanto en / como en /index.html', async () => {
    for (const url of ['/', '/index.html']) {
      const res = await request(withWeb).get(url);
      expect(res.status).toBe(200);
      expect(res.text).toBe(HTML);
      expect(res.headers['cache-control']).toBe('no-cache');
    }
  });

  it('una ruta del SPA cae a index.html sin caché', async () => {
    const res = await request(withWeb).get('/projects/mi-proyecto/board');
    expect(res.status).toBe(200);
    expect(res.text).toBe(HTML);
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('un archivo estático fuera de /assets no es immutable', async () => {
    const res = await request(withWeb).get('/favicon.svg');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).not.toContain('immutable');
  });

  it('un asset inexistente es 404, no el HTML del SPA', async () => {
    const res = await request(withWeb).get('/assets/index-viejo.js');
    expect(res.status).toBe(404);
    expect(res.text).not.toContain('<div id="root">');
  });

  it('/api/v1 desconocido sigue dando el JSON de la API, no el fallback', async () => {
    const anon = await request(withWeb).get('/api/v1/no-existe');
    expect(anon.status).toBe(401);
    expect(anon.headers['content-type']).toMatch(/json/);
    expect(anon.text).not.toContain('<div id="root">');
  });

  it('/api/v1 desconocido con credencial da el 404 JSON', async () => {
    const auth = await newBearer();
    const res = await request(withWeb).get('/api/v1/no-existe').set('Authorization', auth);
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/json/);
  });

  it('un método distinto de GET fuera de la API no cae al fallback', async () => {
    const res = await request(withWeb).post('/projects');
    expect(res.text).not.toContain('<div id="root">');
  });

  it('RS-08: la CSP y el resto de cabeceras de seguridad también salen en el HTML', async () => {
    const res = await request(withWeb).get('/');
    const csp = res.headers['content-security-policy'];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(res.headers['permissions-policy']).toBe('camera=(), microphone=(), geolocation=()');
  });

  it('sin carpeta (o sin index.html) solo se sirve la API', async () => {
    for (const webDistDir of [path.join(dir, 'no-existe'), path.join(dir, 'assets')]) {
      const res = await request(app({ webDistDir })).get('/');
      expect(res.status).toBe(404);
    }
  });
});
