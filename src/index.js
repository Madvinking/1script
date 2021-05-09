#!/usr/bin/env node
const { execSync } = require('child_process');
const { join } = require('path');

const fs = require('fs');

const args = require('args');
const rootDir = require('app-root-path').path;

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

args.option('file', 'path to scripts file', `${rootDir}/scripts.json`).option('root', 'project root', rootDir);

function exeCommand({ name, script, excludes = null }) {
  if (excludes && excludes.some(path => currentFolder.includes(path))) {
    console.log(`${name} excluded in ${currentFolder}`);
  }

  console.log(`name: ${name}\nscirpt: ${script}\ncurrent: ${currentFolder}\nroot: ${rootDir}`);
  try {
    execSync(script, { cwd: currentFolder, encoding: 'utf8', stdio: 'inherit' }).toString();
  } catch (err) { }
}

Object.entries(scripts).forEach(([name, data]) => {
  if (data instanceof Object) {
    args.command(name, data.description || '', () => exeCommand({ name, script: data.script, excludes: data.excludes }));
  } else {
    args.command(name, data, () => exeCommand({ name, script: data }));
  }
});

let flags = args.parse(process.argv);
