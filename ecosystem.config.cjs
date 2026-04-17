const path = require('path');

const rootDir = __dirname;

module.exports = {
  apps: [
    {
      name: 'match-api',
      cwd: rootDir,
      script: 'pnpm',
      args: '--filter @match/api run start',
      env: {
        NODE_ENV: 'production',
        PORT: '3001',
      },
      autorestart: true,
      max_restarts: 10,
    },
    {
      name: 'match-web',
      cwd: rootDir,
      script: 'pnpm',
      args: '--filter @match/web run start -- -p 3000',
      env: {
        NODE_ENV: 'production',
      },
      autorestart: true,
      max_restarts: 10,
    },
  ],
};
