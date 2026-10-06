const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

// pnpm workspace: packages are symlinks into the root store, so Metro has to watch the repo root
// and follow symlinks.
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');
const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [path.join(projectRoot, 'node_modules'), path.join(workspaceRoot, 'node_modules')];
config.resolver.unstable_enableSymlinks = true;
config.resolver.unstable_enablePackageExports = false;
module.exports = config;
