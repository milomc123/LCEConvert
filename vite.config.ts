import { defineConfig } from 'vite';

const inGitHubActions = process.env.GITHUB_ACTIONS === 'true';
const repository = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? '';
const isUserOrOrgPagesRepo = repository.endsWith('.github.io');
const ghPagesBase = repository && !isUserOrOrgPagesRepo ? `/${repository}/` : '/';

export default defineConfig({
  base: inGitHubActions ? ghPagesBase : '/',
  server: {
    port: 5173,
  },
});
