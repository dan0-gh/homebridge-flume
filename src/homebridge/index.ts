import type { API } from 'homebridge';

import { FlumePlatform, PLATFORM_ALIAS } from './platform.js';

/**
 * This method registers the platform with Homebridge
 */
export default (api: API) => {
  api.registerPlatform(PLATFORM_ALIAS, FlumePlatform);
};
