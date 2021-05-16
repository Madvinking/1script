#!/usr/bin/env node

const os = require('os');
const { exec } = require('child_process');
const cpuCount = os.cpus().length;
const pLimit = require('p-limit');

const { Command, Option } = require('commander');

const {
  getScripts,
  getWorkspacesToRunOn,
  getWorkspaceData,
  getGlobalData,
  getFinalScript,
  getCwdToRun,
  getNpmBin,
} = require('./utils');

async function init() {
  const program = new Command();
  program.version('0.0.1', '-v, --version', 'output the current version');
  program
    .option('-r, --root', 'Force run script from project root', false)
    .option('-w, --workspace <name|path>', 'Workspace to run script on')
    .option('-f, --filter <reg>', 'Run script for match filter parallel')
    .addOption(new Option('-l, --log-level <type>', '1script loggeer level', 'info').choices(['silent', 'debug', 'info']))
    .option('-d, --disable-stdout', 'Disable script output', false)
    .option('-a, --all', 'run script on all workspaces', false)
    .option('-p, --params [list...]', 'Workspace to run script on')
    .option('-c --concurrency <number>', `Number of parallel scripts`, cpuCount)
    .option('-s, --sequential', 'Run script from all workspaces sequential', false);

  async function runCommand({ workspaceData, globalData, xccData, cwd }) {
    try {
      var script = await getFinalScript({ workspaceData, globalData, xccData });

      if (xccData.before) ({ script, cwd } = xccData.before(script, cwd, workspaceData));
    } catch (err) {
      console.error(err);
      throw err;
    }
    const npmFolder = await getNpmBin(cwd);
    console.log('npmFolder: ', npmFolder);

    return new Promise((resolve, reject) => {
      console.log(process.env);
      const execute = exec(script, {
        env: {
          ...process.env,
          PATH: `${npmFolder}:${process.env.PATH}`,
        },
        cwd,
        encoding: 'utf8',
      });

      let printOne = false;

      execute.stdout.on('data', function (data) {
        if (!printOne) {
          console.log(`${workspaceData.name}: ${script}`);
          printOne = true;
        }
        console.log(`${workspaceData.name}: ${data.toString()}`);
      });

      execute.stderr.on('data', function (data) {
        if (!printOne) {
          console.log(`${workspaceData.name}: ${script}`);
          printOne = true;
        }
        console.log(`${workspaceData.name}: ${data.toString()}`);
      });

      execute.on('exit', function (code) {
        if (code.toString() === 0) resolve();
        else reject();
      });
    });
  }

  async function calculateCommand(name, xccData) {
    const flags = program.opts();

    try {
      if (flags.logLevel === 'silent') {
        console.log = () => { };
      }
      const globalData = getGlobalData(flags);
      if (flags.all || flags.filter) {
        const limit = pLimit(cpuCount);
        const worksapcesListPromises = getWorkspacesToRunOn(flags).map(({ location }) =>
          limit(() => runCommand({ globalData, workspaceData: getWorkspaceData(location, name), xccData, cwd: location })),
        );
        console.log(`running ${name} on ${worksapcesListPromises.length} workspaces`);
        await Promise.all(worksapcesListPromises);
      } else {
        let cwd = getCwdToRun(flags);
        await runCommand({ globalData, workspaceData: getWorkspaceData(cwd, name), xccData, cwd });
      }
    } catch (err) {
      console.error(err);
    }
  }

  const scripts = getScripts();

  if (scripts) {
    Object.entries(scripts).forEach(([name, data]) => {
      if (data instanceof Object) {
        const [command, ...script] = data.script.split(' ');
        program
          .command(name)
          .description(data.description || data.script)
          .action(() => calculateCommand(name, { script: script.join(' '), command, filter: data.filter, before: data.before }));
      } else {
        const [command, ...script] = data.split(' ');
        program
          .command(name)
          .description(data)
          .action(() => calculateCommand(name, { script: script.join(' '), command }));
      }
    });
  }

  program.parse();
  const scriptName = process.argv[process.argv.length - 1];

  if (!scripts[scriptName]) calculateCommand(scriptName, {});
}

init();
