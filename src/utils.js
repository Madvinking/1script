#!/usr/bin/env node
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const { join } = require('path');
const fs = require('fs');

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

async function getBinScriptIfExist(binScriptName) {
  const currentFolderNodeModules = exec('npm root', { cwd: currentFolder });

  const rootDirNodeModules = exec('npm root', { cwd: rootDir });
  const globalNodeModules = exec('npm root -g');
  const [{ stdout: current }, { stdout: root }, { stdout: globalFolder }] = await Promise.all([
    currentFolderNodeModules,
    rootDirNodeModules,
    globalNodeModules,
  ]);

  if (fs.existsSync(`${current.trimEnd()}/.bin/${binScriptName}`)) {
    return `${current.trimEnd()}/.bin/${binScriptName}`;
  } else if (fs.existsSync(`${root.trimEnd()}/.bin/${binScriptName}`)) {
    return `${root.trimEnd()}/.bin/${binScriptName}`;
  } else if (fs.existsSync(`${globalFolder.trimEnd()}/.bin/${binScriptName}`)) {
    return `${globalFolder.trimEnd()}/.bin/${binScriptName}`;
  }
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

module.exports = {
  scripts,
  getBinScriptIfExist,
  rootDir,
  currentFolder,
  getWorkspacesRoot,
};
