#!/usr/bin/env node
const { execSync } = require('child_process');
const args = require('args');
// const { join } = require('path');
const { scripts, rootDir, getExecutionDir, getData, getGlobalData, getFinalScript } = require('./utils');

args
  .option('file', 'path to scripts file', `${rootDir}/scripts.json`)
  .option('root', 'project root', rootDir)
  .option('workspace', 'workspace to run script on', '')
  .option('filter', 'workspace to run script on', '')
  .option('params', 'workspace to run script on', []);

async function exeCommand(name, xccData, flags) {
  try {
    let cwd = getExecutionDir(flags.w);

    const workspaceData = getData(cwd, name);
    const globalData = getGlobalData(flags);
    let script = await getFinalScript({ workspaceData, globalData, xccData });

    if (xccData.before) {
      ({ script, cwd } = xccData.before(script, cwd, workspaceData));
    }
    console.log('cwd: ', cwd);
    console.log('script: ', script);

    execSync(script, { cwd, encoding: 'utf8', stdio: 'inherit' });
  } catch (err) {
    console.log(err);
  }
}

Object.entries(scripts).forEach(([name, data]) => {
  if (data instanceof Object) {
    const [command, ...script] = data.script.split(' ');
    args.command(name, data.description || '', (a, b, flags) =>
      exeCommand(name, { script: script.join(' '), command, excludes: data.excludes, before: data.before }, flags),
    );
  } else {
    const [command, ...script] = data.split(' ');
    args.command(name, data, (a, b, flags) => {
      exeCommand(name, { script: script.join(' '), command }, flags);
    });
  }
});

args.parse(process.argv);
