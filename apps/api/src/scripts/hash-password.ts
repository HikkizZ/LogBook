import { hashPassword } from '../auth/password.js';

/** Lee la contraseña sin eco desde un TTY (Enter termina, Ctrl-C cancela). */
function readHidden(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    process.stderr.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = (chunk: string): void => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n' || ch === '\u0004') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stderr.write('\n');
          resolve(value);
          return;
        }
        if (ch === '\u0003') {
          stdin.setRawMode(false);
          process.stderr.write('\n');
          reject(new Error('Cancelado'));
          return;
        }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

async function readStdin(): Promise<string> {
  let data = '';
  for await (const chunk of process.stdin) data += String(chunk);
  return data.replace(/\r?\n$/, '');
}

const password = process.stdin.isTTY ? await readHidden('Contraseña: ') : await readStdin();
if (password.length === 0) {
  process.stderr.write('La contraseña no puede estar vacía\n');
  process.exit(1);
}
// Solo el hash va a stdout; la contraseña nunca se imprime.
process.stdout.write(`${await hashPassword(password)}\n`);
