#!/usr/bin/env node
const { execSync } = require('child_process');
const os = require('os')
const cpuCount = os.cpus().length;

const args = require('args');
const { scripts, getExecutionDir, getData, getGlobalData, getFinalScript } = require('./utils');

args
  .option('root', 'Force run script from project root')
  .option('workspace', 'Workspace to run script on', '')
  .option('filter', 'Run script for match filter parallel', '')
  .option('params', 'Workspace to run script on', [])
  .option('concurrency', 'Number of parallel scripts', cpuCount)
  .option('sequential', 'Run script from all workspaces sequential', false)

async function exeCommand(name, xccData, flags) {
  try {
    let cwd = getExecutionDir(flags.w);

    const workspaceData = getData(cwd, name);
    const globalData = getGlobalData(flags);
    let script = await getFinalScript({ workspaceData, globalData, xccData });

    if (xccData.before) ({ script, cwd } = xccData.before(script, cwd, workspaceData));

    console.log('\n\033[32m', `running: '${script}', from: '${cwd}'`, '\033[0m\n');

    execSync(script, { cwd, encoding: 'utf8', stdio: 'inherit' });
  } catch (err) {
    console.log(err);
  }
}

Object.entries(scripts).forEach(([name, data]) => {
  if (data instanceof Object) {
    const [command, ...script] = data.script.split(' ');
    args.command(name, data.description || '', (a, b, flags) =>
      exeCommand(name, { script: script.join(' '), command, filter: data.filter, before: data.before }, flags),
    );
  } else {
    const [command, ...script] = data.split(' ');
    args.command(name, data, (a, b, flags) => {
      exeCommand(name, { script: script.join(' '), command }, flags);
    });
  }
});

const flags = args.parse(process.argv);
const scriptName = process.argv[process.argv.length - 1];
if (!scripts[scriptName]) exeCommand(scriptName, {}, flags);
