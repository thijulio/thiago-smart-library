import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { localPool } from '../../libs/database/src/connection';
import { migrate, assertMarker } from '../../libs/database/src/migrate';
import { validateLibraryTarget, validateInstanceId } from '../../libs/database/src/target';
import { privateOutput, privateWrite, requirePrivate } from '../../libs/importer/src/private-files';

const container = 'smart-library-local';
const database = 'smart_library_local';
const image = 'postgres:16.15';
function docker(args: string[]): string {
  const result = spawnSync('docker', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) throw new Error('LOCAL_LIBRARY_DOCKER_FAILED');
  return result.stdout;
}
function inspect(directory: string) {
  const info = JSON.parse(docker(['inspect', container]))[0];
  const bindings = info.HostConfig.PortBindings;
  const mounts: { Type: string; Source: string; Destination: string; RW: boolean }[] = info.Mounts;
  if (
    info.Config.Image !== image ||
    info.Config.Labels?.['smart-library.purpose'] !== 'private-local' ||
    Object.keys(bindings).join() !== '5432/tcp' ||
    bindings['5432/tcp']?.length !== 1 ||
    bindings['5432/tcp'][0].HostIp !== '127.0.0.1' ||
    bindings['5432/tcp'][0].HostPort !== '55434' ||
    mounts.length !== 2 ||
    !mounts.some(
      (m) =>
        m.Type === 'bind' &&
        m.Source === join(directory, 'data') &&
        m.Destination === '/var/lib/postgresql/data' &&
        m.RW,
    ) ||
    !mounts.some(
      (m) =>
        m.Type === 'bind' &&
        m.Source === join(directory, 'admin-password') &&
        m.Destination === '/run/secrets/pgpass' &&
        !m.RW,
    )
  )
    throw new Error('UNSAFE_LIBRARY_CONTAINER');
}
function url(role: string, password: string) {
  const value = new URL(`postgresql://127.0.0.1:55434/${database}`);
  value.username = role;
  value.password = password;
  return validateLibraryTarget(value.toString(), process.env).url;
}
async function init(directory: string) {
  const out = await privateOutput(directory);
  const adminPassword = randomBytes(32).toString('hex');
  const importPassword = randomBytes(32).toString('hex');
  const readerPassword = randomBytes(32).toString('hex');
  await privateWrite(join(out, 'admin-password'), adminPassword);
  await mkdir(join(out, 'data'), { mode: 0o700 });
  // No stop, remove, prune, overwrite, or deletion path exists in this command.
  docker([
    'run',
    '--detach',
    '--name',
    container,
    '--label',
    'smart-library.purpose=private-local',
    '--restart',
    'unless-stopped',
    '--publish',
    '127.0.0.1:55434:5432',
    '--mount',
    `type=bind,src=${join(out, 'data')},dst=/var/lib/postgresql/data`,
    '--mount',
    `type=bind,src=${join(out, 'admin-password')},dst=/run/secrets/pgpass,readonly`,
    '--env',
    'POSTGRES_USER=sl_local_admin',
    '--env',
    `POSTGRES_DB=${database}`,
    '--env',
    'POSTGRES_PASSWORD_FILE=/run/secrets/pgpass',
    image,
  ]);
  inspect(out);
  const adminUrl = url('sl_local_admin', adminPassword);
  // Retain bootstrap access privately even if a later provisioning step fails.
  await privateWrite(join(out, 'bootstrap.json'), JSON.stringify({ adminUrl }));
  const db = localPool(adminUrl);
  try {
    let ready = false;
    for (let i = 0; i < 30; i++) {
      try {
        await db.query('SELECT 1');
        ready = true;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    if (!ready) throw new Error('LOCAL_LIBRARY_NOT_READY');
    const client = await db.connect();
    let instanceId: string;
    try {
      await client.query("SELECT set_config('smart_library.purpose','staging',false)");
      await migrate(client, 'libs/database/migrations', 'staging');
      instanceId = (await assertMarker(client, undefined, 'staging')).instance_id;
      await client.query(
        `CREATE ROLE sl_local_importer LOGIN PASSWORD '${importPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT library_importer TO sl_local_importer`,
      );
      await client.query(
        `CREATE ROLE sl_local_reader LOGIN PASSWORD '${readerPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT library_private_reader,library_editor TO sl_local_reader`,
      );
      await client.query(
        'REVOKE CONNECT ON DATABASE smart_library_local FROM PUBLIC; GRANT CONNECT ON DATABASE smart_library_local TO sl_local_importer,sl_local_reader',
      );
    } finally {
      client.release();
    }
    await privateWrite(
      join(out, 'connections.json'),
      JSON.stringify(
        {
          version: 1,
          instanceId,
          adminUrl,
          importUrl: url('sl_local_importer', importPassword),
          ownerUrl: url('sl_local_reader', readerPassword),
        },
        null,
        2,
      ),
    );
    console.log(
      JSON.stringify({
        status: 'initialized',
        database,
        host: '127.0.0.1',
        port: 55434,
        instanceId,
      }),
    );
  } finally {
    await db.end();
  }
}
async function main() {
  const [operation, flag, path] = process.argv.slice(2);
  if (operation === '--help' && !flag) {
    console.log(
      'Usage: pnpm db:library init|status|backup --directory PRIVATE_DIRECTORY (persistent local storage; never deletes data; credentials stay private)',
    );
    return;
  }
  if (
    !['init', 'status', 'backup'].includes(operation) ||
    flag !== '--directory' ||
    !path ||
    process.argv.slice(2).length !== 3
  )
    throw new Error('INVALID_USAGE');
  if (operation === 'init') return init(resolve(path));
  await requirePrivate(path, true);
  const directory = await realpath(path);
  await requirePrivate(join(directory, 'connections.json'));
  const config = JSON.parse(await readFile(join(directory, 'connections.json'), 'utf8'));
  inspect(directory);
  const db = localPool(validateLibraryTarget(config.adminUrl, process.env).url);
  try {
    await assertMarker(db, validateInstanceId(config.instanceId), 'staging');
    if (operation === 'status') {
      const count = (await db.query('SELECT count(*) FROM library.books')).rows[0].count;
      console.log(JSON.stringify({ status: 'ready', books: count, instanceId: config.instanceId }));
    } else {
      const backup = join(directory, `backup-${Date.now()}.dump`);
      const result = spawnSync(
        'docker',
        ['exec', container, 'pg_dump', '-U', 'sl_local_admin', '-d', database, '-Fc'],
        { maxBuffer: 128 * 1024 * 1024 },
      );
      if (result.status !== 0) throw new Error('BACKUP_FAILED');
      await privateWrite(backup, result.stdout);
      const check = spawnSync('docker', ['exec', '-i', container, 'pg_restore', '--list'], {
        input: result.stdout,
        maxBuffer: 8 * 1024 * 1024,
      });
      if (check.status !== 0) throw new Error('BACKUP_INVALID');
      console.log(
        JSON.stringify({ status: 'backup-created', path: backup, bytes: result.stdout.length }),
      );
    }
  } finally {
    await db.end();
  }
}
main().catch(() => {
  console.error('LOCAL_LIBRARY_OPERATION_FAILED');
  process.exitCode = 1;
});
