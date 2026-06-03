module.exports = {
  apps: [
    {
      name: 'nova-server',
      script: './server.js',
      instances: 1,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'development',
        PORT: 5000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000
      },
      error_file: './logs/nova-server-error.log',
      out_file: './logs/nova-server-out.log',
      log_file: './logs/nova-server-combined.log',
      time_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '500M',
      watch: false,
      ignore_watch: ['node_modules', 'logs'],
      listen_timeout: 5000,
      kill_timeout: 5000
    },
    {
      name: 'nova-worker',
      script: './src/Queues/consume.rabbitmq.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development'
      },
      env_production: {
        NODE_ENV: 'production'
      },
      error_file: './logs/nova-worker-error.log',
      out_file: './logs/nova-worker-out.log',
      log_file: './logs/nova-worker-combined.log',
      time_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '300M',
      watch: false,
      ignore_watch: ['node_modules', 'logs'],
      listen_timeout: 5000,
      kill_timeout: 5000
    }
  ],

  // Deploy configuration
  deploy: {
    production: {
      user: 'node',
      host: 'your-server-ip',
      ref: 'origin/main',
      repo: 'git@github.com:your-org/nova-backend.git',
      path: '/var/www/nova-backend',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production'
    }
  }
};
