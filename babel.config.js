module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // 'expo-router/babel',          // для expo-router
      'react-native-reanimated/plugin', // ДОЛЖЕН быть последним
    ],
  };
};