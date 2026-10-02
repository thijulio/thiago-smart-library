import { importerCli } from './import-cli';
importerCli('verify').then((code) => {
  process.exitCode = code;
});
