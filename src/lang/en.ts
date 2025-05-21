const langEn = {
  
  // General
  brand: 'Flume',

  // Startup
  beta: 'This is a beta version of Flume. You will experience more logging than normal.',
  complete: '✓ Setup complete',
  initializing: 'Initializing plugin…',
  initialized: 'Plugin initialized. Setting up accessories…',
  welcomeMessages: [
    'Please ★ this plugin on GitHub if you\'re finding it useful! https://github.com/mpatfield/homebridge-flume',
    'Would you like to sponsor this plugin? https://github.com/sponsors/mpatfield',
    'This plugin currently has a 4★ rating on HOOBS! https://bit.ly/hb-flume-review',
    'Want to see this plugin in your own language? Please create a ticket! https://github.com/mpatfield/homebridge-flume/issues',
  ],

  // Errors
  badConfig: 'One or more required variables are missing from the config. Please check the documentation. https://github.com/mpatfield/homebridge-flume',
  missingDevice: 'Device is missing after sync',
  noDevices: 'No devices were found in your account',

  // Custom Characteristic
  customCharMonthUsage: 'Month Usage',
  customCharPreviousMonth: 'Previous Month',
  customCharTodayUsage: 'Today Usage',
  customCharUnits: 'Gallons',

  // To Organize
  accNotFound: 'accessory not found',
  devAdd: 'has been added to Homebridge',
  devInit: 'initialized with id',
  devNotAdd: 'could not be added to Homebridge as',
  devNotConf: 'could not be configured as',
  devNotInit: 'could not be initialized as',
  devNotRef: 'could not be refreshed as',
  devNotRemove: 'could not be removed from Homebridge as',
  devNotUpdated: 'could not be updated as',
  devRemove: 'has been removed from Homebridge',
  hbVersionFail: 'Your version of Homebridge is too low - please update to v1.6',
  httpRetry: 'Unable to reach Flume, retrying in 30 seconds',
  noDataReceived: 'No data received from request',
  noRefreshToken: 'No refresh token has been retrieved',
  noUserId: 'No user id has been retrieved',
  pluginNotConf: 'Plugin has not been configured',
  syncFailed: 'Sync process failed as',
  updateFail: 'could not be updated as',
};

export default langEn;