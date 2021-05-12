#!/usr/bin/env node
const util = require('util');
const fs = require('fs');
const exec = util.promisify(require('child_process').exec);
const { execSync } = require('child_process');
const exists = util.promisify(require('fs').exists);
const { join } = require('path');
const rootDir = require('app-root-path').path;

let workspaceRoot;
function getWorkspaceRoot() {
  if (workspaceRoot) return workspaceRoot;
  let max = 5;
  const aaa = dir => {
    const pkg = join(dir, 'package.json');
    let found = false;
    if (fs.existsSync(pkg)) found = true;
    if (found) return dir;
    if (max === 0) {
      console.error('no workspace project found');
      process.exit(1);
    }
    max--;
    return aaa(join(dir, '../'));
  };

  workspaceRoot = aaa(process.cwd());
  return workspaceRoot;
}

async function getCommandPath(command, cwd) {
  const workspaceFolderNodeModules = exec('npm root', { cwd });
  const rootDirNodeModules = exec('npm root', { cwd: rootDir });
  const globalNodeModules = exec('npm root -g');

  const [{ stdout: current }, { stdout: root }, { stdout: globalFolder }] = await Promise.all([
    workspaceFolderNodeModules,
    rootDirNodeModules,
    globalNodeModules,
  ]);
  const [a, b, c] = await Promise.all([
    exists(`${current.trimEnd()}/.bin/${command}`),
    exists(`${root.trimEnd()}/.bin/${command}`),
    exists(`${globalFolder.trimEnd()}/.bin/${command}`),
  ]);
  if (a) return `${current.trimEnd()}/.bin/${command}`;
  else if (b) return `${root.trimEnd()}/.bin/${command}`;
  else if (c) return `${globalFolder.trimEnd()}/.bin/${command}`;

  return command;
}

let scripts;
function getScripts() {
  let file;
  const indexOfScripts = process.argv.indexOf('--file');
  if (indexOfScripts > -1) {
    file = process.argv[indexOfScripts + 1];
  } else if (fs.existsSync(`${rootDir}/scripts.json`)) {
    file = `${rootDir}/scripts.json`;
  } else if (fs.existsSync(`${rootDir}/scripts.js`)) {
    file = `${rootDir}/scripts.js`;
  } else {
    console.error('no script file found, please create script.js(on) file');
    process.exit(1);
  }
  scripts = require(file);
  return scripts;
}

function splitParams(params = []) {
  return params.reduce((acc, p) => {
    const [key, value] = p.split('=');
    acc[key] = value;
    return acc;
  }, {});
}

let workspaces;
let client = 'npx';

function getClient() {
  return client;
}
function getWorkspaces() {
  if (workspaces) return workspaces;
  if (fs.existsSync(join(rootDir, 'pnpm-workspace.yaml'))) {
    console.log('using pnpm manager');
    client = 'pnpx';
    let workspacesList = execSync('pnpm list -r --depth -1', { cwd: rootDir }).toString();

    workspaces = workspacesList.split('\n').reduce((acc, w) => {
      if (w !== '') {
        let [name, location] = w.split(' ');
        acc.push({ name, location });
      }
      return acc;
    }, []);
  } else if (fs.existsSync(join(rootDir, '.yarnrc'))) {
    console.log('using yarn manager');
    let workspacesList = JSON.parse(execSync('yarn --silent workspaces info --json', { cwd: rootDir }).toString());

    workspaces = Object.entries(workspacesList).reduce((acc, [name, { location }]) => {
      acc.push({ name, location: join(rootDir, location) });

      return acc;
    }, []);
  } else {
    console.error('must have package manager installed');
    process.exit(1);
  }
  return workspaces;
}

function getWorkspaceData(cwd, scriptName) {
  const data = { cwd };

  data.packageJson = require(join(cwd, 'package.json'));
  data.scripts = data.packageJson.scripts;
  data.name = data.packageJson.name;

  if (data.scripts[scriptName]) {
    data.script = data.scripts[scriptName];
    const [commandAndParams, restParams] = data.script.split(' -- ');
    let [command, ...script] = commandAndParams.split(' ');
    data.script = script.join(' ');
    if (command.startsWith('xxc') || command.startsWith('1script')) {
      data.restParams = restParams;
      data.params = splitParams(script.filter(p => p.includes('=')));
    } else {
      data.command = command;
    }
  }

  return data;
}

let globalData;
const indexOfRestParams = process.argv.indexOf('--');
let restGlobalParams;
if (indexOfRestParams > -1) {
  restGlobalParams = process.argv.splice(indexOfRestParams + 1).join(' ');
  process.argv = process.argv.splice(0, indexOfRestParams);
}
function getGlobalData(flags) {
  if (globalData) return globalData;

  globalData = {
    filter: flags.filter,
    params: splitParams(flags.params),
    restParams: restGlobalParams,
  };

  return globalData;
}

async function getFinalScript({ workspaceData, globalData, xccData } = {}) {
  const command = workspaceData.command || xccData.command;
  if (!command) {
    console.error('command not found in scripts file or in selected workspace folder');
    process.exit(1);
  }

  const params = { ...workspaceData.params, ...globalData.params };

  const restParams = `${workspaceData.restParams || ''} ${globalData.restParams || ''}`;

  const commandExec = `${getClient()} ${command}`;

  let script;

  if (workspaceData.command) {
    script = workspaceData.script;
  } else {
    script = xccData.script;

    // inject parmas to xcc-sciprt
    Object.entries(params).forEach(([key, value]) => {
      const reg = new RegExp(`{{${key}.*?}}`, 'g');
      script = script.replace(reg, value);
    });

    // fill defaults and remove unused
    script
      .split(/ +/)
      .filter(p => /\{\{.+?\}\}/.test(p))
      .forEach(param => {
        if (param.includes('=')) {
          const [key, value] = param.replace(/(\{|\})/g, '').split('=');
          script = script.replace(param, value);
        } else {
          script = script.replace(param, '');
        }
      });
  }

  return `${commandExec} ${script} ${restParams}`;
}

function getWorkspacesToRunOn(flags) {
  let workspaceList = getWorkspaces();
  if (flags.filter) {
    workspaceList = workspaceList.filter(({ name, location }) => {
      const reg = new RegExp(flags.filter);
      return reg.test(name) || reg.test(location);
    });
  }
  return workspaceList;
}

function getCwdToRun(flags) {
  let cwd;
  if (flags.root) cwd = rootDir;
  else if (flags.workspace) {
    const workspace = getWorkspaces().find(({ name, location }) => name === flags.workspace || location.endsWith(flags.workspace));
    if (workspace) cwd = workspace.location;
    else {
      console.error(`didn't found workspace for ${flags.workspace}`);
      process.exit(1);
    }
  } else {
    cwd = getWorkspaceRoot();
  }
  return cwd;
}

module.exports = {
  getCwdToRun,
  getScripts,
  getCommandPath,
  getWorkspaceData,
  getWorkspacesToRunOn,
  getGlobalData,
  getFinalScript,
  getClient,
};
