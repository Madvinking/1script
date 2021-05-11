#!/usr/bin/env node
const util = require('util');
const fs = require('fs');
const exec = util.promisify(require('child_process').exec);
const { execSync } = require('child_process');
const exists = util.promisify(require('fs').exists);
const { join } = require('path');
const { logger } = require('./logger');
const rootDir = require('app-root-path').path;

let max = 5;
const getWorkspacesRoot = dir => {
  const pkg = join(dir, 'package.json');
  let found = false;
  if (fs.existsSync(pkg)) found = true;
  if (found) return dir;
  if (max === 0) {
    logger.error('no workspace project found');
    process.exit(1);
  }
  max--;
  return getWorkspacesRoot(join(dir, '../'));
};

const workspaceFolder = getWorkspacesRoot(process.cwd());

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

let scriptsFile = (function getScritFile() {
  const indexOfScripts = process.argv.indexOf('--file');
  if (indexOfScripts > -1) {
    return process.argv[indexOfScripts + 1];
  } else if (fs.existsSync(`${rootDir}/scripts.json`)) {
    return `${rootDir}/scripts.json`;
  } else if (fs.existsSync(`${rootDir}/scripts.js`)) {
    return `${rootDir}/scripts.js`;
  } else {
    logger.error('no script file found, please create script.js(on) file');
    process.exit(1);
  }
})();

const scripts = require(scriptsFile);

function splitParams(params = []) {
  return params.reduce((acc, p) => {
    const [key, value] = p.split('=');
    acc[key] = value;
    return acc;
  }, {});
}

let workspaces;
if (fs.existsSync(join(rootDir, 'pnpm-workspace.yaml'))) {
  logger.debug('using pnpm manager');
  let workspacesList = execSync('pnpm list -r --depth -1', { cwd: rootDir }).toString();

  workspaces = workspacesList.split('\n').reduce((acc, w) => {
    if (w !== '') {
      let [name, location] = w.split(' ');
      acc.push({ name, location });
    }
    return acc;
  }, []);
} else if (fs.existsSync(join(rootDir, '.yarnrc'))) {
  logger.debug('using yarn manager');
  let workspacesList = JSON.parse(execSync('yarn --silent workspaces info --json', { cwd: rootDir }).toString());

  workspaces = Object.entries(workspacesList).reduce((acc, [name, { location }]) => {
    acc.push({ name, location: join(rootDir, location) });

    return acc;
  }, []);
}

function getExecutionDir(path) {
  let cwd = workspaceFolder;
  let workspace;
  if (path) {
    workspace = workspaces.find(({ name, location }) => name === path || location.endsWith(path));
    if (workspace) cwd = workspace.location;
  }

  if (!path || !workspace) {
    logger.warn(`no workspace found for ${path}`);
  }
  return cwd;
}

function getData(cwd, scriptName) {
  const data = { cwd };

  data.packageJson = require(join(cwd, 'package.json'));
  data.scripts = data.packageJson.scripts;

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

const indexOfRestParams = process.argv.indexOf('--');
let restGlobalParams;
if (indexOfRestParams > -1) {
  restGlobalParams = process.argv.splice(indexOfRestParams + 1).join(' ');
  process.argv = process.argv.splice(0, indexOfRestParams);
}

function getGlobalData(flags) {
  const data = {
    filter: flags.f,
    params: splitParams(flags.p),
    restParams: restGlobalParams,
  };

  return data;
}

async function getFinalScript({ workspaceData, globalData, xccData } = {}) {
  const command = workspaceData.command || xccData.command;
  if (!command) {
    logger.error('command not found in scripts file or in selected workspace folder');
    process.exit(1);
  }

  const params = { ...workspaceData.params, ...globalData.params };

  const restParams = `${workspaceData.restParams || ''} ${globalData.restParams || ''}`;

  const cwd = workspaceData.cwd;

  const commandExec = await getCommandPath(command, cwd);

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

module.exports = {
  scripts,
  getExecutionDir,
  getCommandPath,
  getData,
  getGlobalData,
  getFinalScript,
  rootDir,
  workspaceFolder,
  workspaces,
};
