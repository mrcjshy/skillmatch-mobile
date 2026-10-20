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
            'SkillMatch uses foreground location permission to identify the address of your selected Job pin, to obtain one current position when requested, and, only while you choose to share on an open confirmed-booking map, to show your current position to the other booking participant. Location is never collected in the background.',
          isIosBackgroundLocationEnabled: false,
          isAndroidBackgroundLocationEnabled: false,
          isAndroidForegroundServiceEnabled: false,
        },
      ],
      '@maplibre/maplibre-react-native',
    ],
  },
};
