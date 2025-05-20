export const SECOND = 1000;
export const MINUTE = 60 * SECOND;

export const DEFAULT_REFRESH_INTERVAL = 2;

export const DEFAULT_CONFIG =
{
  name: 'Flume',
  username: '',
  password: '',
  clientId: '',
  clientSecret: '',
  disableDeviceLogging: false,
  refreshInterval: DEFAULT_REFRESH_INTERVAL,
  platform: 'Flume',
};
 
export const MIN_REFRESH_INTERVAL = 1;

export const HTTP_RETRY_CODES = ['ENOTFOUND', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNABORTED'];