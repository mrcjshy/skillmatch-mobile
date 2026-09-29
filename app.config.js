const appJson = require('./app.json');

module.exports = {
  expo: {
    ...appJson.expo,
    plugins: [
      ...(appJson.expo.plugins ?? []),
      [
        'expo-location',
        {
          locationWhenInUsePermission:
            'SkillMatch uses foreground location permission to identify the address of your selected Job pin and, when requested, obtain one current position. Your movement is not tracked.',
          isIosBackgroundLocationEnabled: false,
          isAndroidBackgroundLocationEnabled: false,
          isAndroidForegroundServiceEnabled: false,
        },
      ],
      '@maplibre/maplibre-react-native',
    ],
  },
};
