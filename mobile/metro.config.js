// Workspace-aware Metro config.
//
// The monorepo keeps design tokens in `packages/tokens`, which npm workspaces links
// into the root `node_modules`. Metro does not follow that by default: it needs the
// workspace root added as a watch folder, and both node_modules directories on its
// resolution path. Without this the app cannot resolve `@xspeeria/tokens`.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
