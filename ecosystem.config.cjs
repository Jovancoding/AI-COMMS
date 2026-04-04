module.exports = {
  apps: [{
    name: 'whatsapp-ai-agent',
    script: 'src/index.js',
    interpreter: 'node',
    node_args: '--experimental-modules',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production',
    },
  }],
};
