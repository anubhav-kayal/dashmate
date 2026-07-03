module.exports = {
  apps: [{
    name: 'dashmate-api',
    script: 'dist/server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
    },
    env_development: {
      NODE_ENV: 'development',
      script: 'src/server.ts',
      interpreter: 'npx',
      interpreter_args: 'tsx watch',
    },
    max_memory_restart: '500M',
    error_file: 'logs/err.log',
    out_file: 'logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,
    max_restarts: 10,
    restart_delay: 5000,
    listen_timeout: 8000,
    kill_timeout: 5000,
  }],
};
