#!/usr/bin/env node
const util = require('util');
const fs = require('fs');
const exec = util.promisify(require('child_process').exec);
const { execSync } = require('child_process');
const exists = util.promisify(require('fs').exists);
const { join } = require('path');

let max = 5;
const getWorkspacesRoot = dir => {
  const pkg = join(dir, 'package.json');
  let found = false;
  if (fs.existsSync(pkg)) found = true;
  if (found) return dir;
  if (max === 0) {
    console.log('no workspace project found');
    process.exit(1);
  }
  max--;
  return getWorkspacesRoot(join(dir, '../'));
};

const currentFolder = getWorkspacesRoot(process.cwd());
const rootDir = require('app-root-path').path;

async function getBinScriptIfExist(binScriptName, cwd) {
  const currentFolderNodeModules = exec('npm root', { cwd });
  const rootDirNodeModules = exec('npm root', { cwd: rootDir });
  const globalNodeModules = exec('npm root -g');

  const [{ stdout: current }, { stdout: root }, { stdout: globalFolder }] = await Promise.all([
    currentFolderNodeModules,
    rootDirNodeModules,
    globalNodeModules,
  ]);
  const [a, b, c] = await Promise.all([
    exists(`${current.trimEnd()}/.bin/${binScriptName}`),
    exists(`${root.trimEnd()}/.bin/${binScriptName}`),
    exists(`${globalFolder.trimEnd()}/.bin/${binScriptName}`),
  ]);
  if (a) return `${current.trimEnd()}/.bin/${binScriptName}`;
  else if (b) return `${root.trimEnd()}/.bin/${binScriptName}`;
  else if (c) return `${globalFolder.trimEnd()}/.bin/${binScriptName}`;

  return binScriptName;
}

let scriptsFile = (function getScritFile() {
  const indexOfScripts = process.argv.indexOf('--file');
  if (indexOfScripts > -1) {
    return process.argv[indexOfScripts + 1];
  } else if (fs.existsSync(`${rootDir}/scripts.json`)) {
    return `${rootDir}/scripts.json`;
  } else if (fs.existsSync(`${rootDir}/scripts.js`)) {
    return `${rootDir}/scripts.js`;
  } else {
    console.log('no script file found');
    process.exit(1);
  }
})();

const scripts = require(scriptsFile);
let workspaces;
let client = 'npm run';
if (fs.existsSync(join(rootDir, 'pnpm-workspace.yaml'))) {
  client = 'pnpm run';
  let workspacesList = execSync('pnpm list -r --depth -1', { cwd: rootDir }).toString();

  workspaces = workspacesList.split('\n').reduce((acc, w) => {
    if (w !== '') {
      let [name, location] = w.split(' ');
      acc.push({ name, location });
    }
    return acc;
  }, []);
} else if (fs.existsSync(join(rootDir, '.yarnrc'))) {
  let workspacesList = JSON.parse(execSync('yarn --silent workspaces info --json', { cwd: rootDir }).toString());

  workspaces = Object.entries(workspacesList).reduce((acc, [name, { location }]) => {
    acc.push({ name, location });

    return acc;
  }, []);
}
module.exports = {
  scripts,
  getBinScriptIfExist,
  rootDir,
  currentFolder,
  getWorkspacesRoot,
  workspaces,
  client,
};
