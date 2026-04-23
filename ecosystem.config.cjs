const rootDir = __dirname;
const webPort = process.env.WEB_PORT || '3100';
const apiPort = process.env.API_PORT || '3001';
const apiCwd = `${rootDir}/apps/api`;
const webCwd = `${rootDir}/apps/web`;

module.exports = {
  apps: [
    {
      name: 'match-api',
      cwd: apiCwd,
      script: 'node',
      args: 'dist/src/main.js',
      env: {
        NODE_ENV: 'production',
        PORT: apiPort,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: apiPort,
      },
      max_memory_restart: '512M',
      autorestart: true,
      max_restarts: 20,
      restart_delay: 3000,
    },
    {
      name: 'match-web',
      cwd: webCwd,
      script: 'node',
      args: `node_modules/next/dist/bin/next start -H 0.0.0.0 -p ${webPort}`,
      env: {
        NODE_ENV: 'production',
        PORT: webPort,
        NODE_OPTIONS: '--max-old-space-size=768',
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: webPort,
        NODE_OPTIONS: '--max-old-space-size=768',
      },
      max_memory_restart: '900M',
      autorestart: true,
      max_restarts: 50,
      restart_delay: 4000,
      min_uptime: 10000,
      kill_timeout: 20000,
    },
  ],
};
