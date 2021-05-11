#!/usr/bin/env node
const util = require('util');
const { execSync } = require('child_process');
const os = require('os');
const fs = require('fs');
const exec = util.promisify(require('child_process').exec);
const cpuCount = os.cpus().length;
const { LogLevel } = require('@logzio-node-toolbox/logger');
const { logger, transporter } = require('./logger');
const pLimit = require('p-limit');

const args = require('args');
const { scripts, getExecutionDir, getData, getGlobalData, getFinalScript, rootDir, workspaces } = require('./utils');

args
  .option('root', 'Force run script from project root')
  .option('workspace', 'Workspace to run script on', '')
  .option('filter', 'Run script for match filter parallel', '')
  .option('logLevel', '1script loggeer level (silent, warn, info, error, debug)', 'info')
  .option('disable-stdout', 'Disable script output')
  .option('all', 'run script on all workspaces')
  .option('params', 'Workspace to run script on', [])
  .option('concurrency', 'Number of parallel scripts', cpuCount)
  .option('sequential', 'Run script from all workspaces sequential');

async function runCommand({ workspaceData, globalData, xccData, cwd }) {
  try {
    let script = await getFinalScript({ workspaceData, globalData, xccData });

    if (xccData.before) ({ script, cwd } = xccData.before(script, cwd, workspaceData));

    logger.log(`running: '${script}', from: '${cwd}'`);

    //TODO need to color output maybe use spwn instead
    const { stdout } = await exec(script, {
      cwd,
      encoding: 'utf8',
    });

    console.log(stdout);
  } catch (err) {
    console.log(err.stdout ? err.stdout : err);
  }
}

async function exeCommand(name, xccData, flags) {
  try {
    let cwd = flags.r ? rootDir : getExecutionDir(flags.w);

    const globalData = getGlobalData(flags);
    if (flags.a) {
      const limit = pLimit(cpuCount);
      const worksapcesListPromises = workspaces.map(({ location }) => {
        return limit(() => runCommand({ globalData, workspaceData: getData(location, name), xccData, cwd: location }));
      });

      await Promise.all(worksapcesListPromises);
    } else if (flags.f) {
      const limit = pLimit(cpuCount);
      const worksapcesListPromises = workspaces
        .filter(({ name, location }) => {
          const reg = new RegExp(flags.f);
          return reg.test(name) || reg.test(location);
        })
        .map(({ location }) => {
          return limit(() => runCommand({ globalData, workspaceData: getData(location, name), xccData, cwd: location }));
        });

      await Promise.all(worksapcesListPromises);
    } else {
      await runCommand({ globalData, workspaceData: getData(cwd, name), xccData, cwd });
    }
  } catch (err) {
    logger.error(err);
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
transporter.logLevel = LogLevel[flags.l.toUpperCase()];
const scriptName = process.argv[process.argv.length - 1];
if (!scripts[scriptName]) exeCommand(scriptName, {}, flags);
