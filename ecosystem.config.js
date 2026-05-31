module.exports = {
  apps: [{
    name: 'talkfuze-wa-worker',
    script: 'whatsapp-worker-index.js',
    instances: 1,
    wait_ready: true,
    listen_timeout: 10000,
    kill_timeout: 5000,
    max_memory_restart: '500M',
    max_restarts: 10,
    min_uptime: 5000,
    restart_delay: 3000,
    exp_backoff_restart_delay: 1000,
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
    },
    error_file: '/var/log/talkfuze/worker-error.log',
    out_file: '/var/log/talkfuze/worker-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
  }]
};
