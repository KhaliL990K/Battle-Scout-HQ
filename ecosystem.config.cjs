module.exports = {
  apps: [
    {
      name: 'battlescout-hq-bot',
      script: 'src/index.js',
      instances: 1, // gateway connection: never cluster
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      // Back off between crash restarts so a bad deploy cannot hammer the Discord gateway.
      exp_backoff_restart_delay: 200,
      min_uptime: '20s',
      max_restarts: 10,
      // pm2 sends SIGINT; the bot flushes the log queue and closes MongoDB before exiting.
      kill_timeout: 10000,
      max_memory_restart: '400M',
      time: true,
      merge_logs: true,
      env: { NODE_ENV: 'production' },
    },
  ],
};
