import path from 'node:path';

const DEFAULT_DATA_ROOT = '/www/labs-data';

export function getDataPaths(env = process.env) {
  const root = path.resolve(env.LABS_DATA_ROOT || DEFAULT_DATA_ROOT);

  return {
    root,
    uploads: path.join(root, 'uploads'),
    exports: path.join(root, 'exports'),
    backups: path.join(root, 'backups'),
    logs: path.join(root, 'logs')
  };
}

export function getConfig(env = process.env) {
  return {
    port: Number(env.PORT || 4020),
    publicBaseUrl: env.PUBLIC_BASE_URL || 'https://labs.heyrickishere.com',
    adminPasswordHash: env.ADMIN_PASSWORD_HASH || '',
    sessionSecret: env.SESSION_SECRET || 'change-this-session-secret',
    databaseUrl:
      env.DATABASE_URL ||
      'postgres://labs:labs_dev_password@127.0.0.1:54329/labs',
    paths: getDataPaths(env)
  };
}
