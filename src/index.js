#!/usr/bin/env node
const { execSync } = require('child_process');
const args = require('args');
const { join } = require('path');
const { scripts, rootDir, getBinScriptIfExist, currentFolder, workspaces } = require('./utils');

args
  .option('file', 'path to scripts file', `${rootDir}/scripts.json`)
  .option('root', 'project root', rootDir)
  .option('workspace', 'workspace to run script on', '')
  .option('filter', 'workspace to run script on', []);

async function exeCommand({ name, script, excludes = null, flags }) {
  try {
    let cwd = currentFolder;

    if (flags.w) {
      let workspace = workspaces.find(({ name, location }) => name === flags.w || location.endsWith(flags.w));
      if (workspace) cwd = join(rootDir, workspace.location);
    }

    // if (excludes && excludes.some(path => currentFolder.includes(path))) {
    //   console.log(`${name} excluded in ${currentFolder}`);
    // }

    let [scriptName, ...rest] = script.split(' ');
    let endParams = rest.join(' ');
    scriptName = await getBinScriptIfExist(scriptName, cwd);

    const { scripts: currentScripts } = require(join(cwd, 'package.json'));

    if (currentScripts[name] && (currentScripts[name].startsWith('xxc') || currentScripts[name].startsWith('1script'))) {
      const [currnet, restParams] = currentScripts[name].split(' -- ');

      const [ss, ...middleParams] = currnet.split(/ +/);

      middleParams.forEach(param => {
        const [k, v] = param.split('=');
        endParams = endParams.replace(`{{${k}}}`, v);
      });
      endParams = endParams.replace(/\{\{.+?\}\}/g, '');
      endParams += ' ' + restParams;
    } else if (currentScripts[name]) {
      scriptName = currentScripts[name];
    }
    console.log(`${scriptName} ${endParams}`);
    execSync(`${scriptName} ${endParams}`, { cwd, encoding: 'utf8', stdio: 'inherit' });
  } catch (err) {
    // console.log(err);
  }
}

Object.entries(scripts).forEach(([name, data]) => {
  if (data instanceof Object) {
    args.command(name, data.description || '', () => exeCommand({ name, script: data.script, excludes: data.excludes }));
  } else {
    args.command(name, data, (a, b, flags) => {
      exeCommand({ name, script: data, flags });
    });
  }
});

args.parse(process.argv);
