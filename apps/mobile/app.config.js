// SIDELOAD=1 builds an app that a free Apple ID can sign: push notifications need a paid account's entitlement,
// so the plugin is left out of that build.
module.exports = ({ config }) => {
  if (process.env.SIDELOAD === '1') {
    config.plugins = (config.plugins || []).filter((p) => (Array.isArray(p) ? p[0] : p) !== 'expo-notifications');
  }
  return config;
};
