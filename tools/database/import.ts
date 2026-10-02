import { importerCli } from './import-cli';
importerCli('import').then((code) => {
  process.exitCode = code;
});
