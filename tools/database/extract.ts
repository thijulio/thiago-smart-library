import { importerCli } from './import-cli';
importerCli('extract').then((code) => {
  process.exitCode = code;
});
