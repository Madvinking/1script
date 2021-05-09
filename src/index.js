#!/usr/bin/env node

const { execSync } = require('child_process');
const args = require('args');

const { scripts, rootDir, getBinScriptIfExist, currentFolder } = require('./utils');

args.option('file', 'path to scripts file', `${rootDir}/scripts.json`).option('root', 'project root', rootDir);

async function exeCommand({ name, script, excludes = null }) {
  if (excludes && excludes.some(path => currentFolder.includes(path))) {
    console.log(`${name} excluded in ${currentFolder}`);
  }

  try {
    let [scriptName, ...rest] = script.split(' ');
    scriptName = await getBinScriptIfExist(scriptName);
    execSync(`${scriptName} ${rest.join(' ')}`, { cwd: currentFolder, encoding: 'utf8', stdio: 'inherit' });
  } catch (err) {
    console.log(err);
  }
}

Object.entries(scripts).forEach(([name, data]) => {
  if (data instanceof Object) {
    args.command(name, data.description || '', () => exeCommand({ name, script: data.script, excludes: data.excludes }));
  } else {
    args.command(name, data, () => exeCommand({ name, script: data }));
  }
});

let flags = args.parse(process.argv);
