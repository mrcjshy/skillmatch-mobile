const appJson = require('./app.json');

const androidMapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY ?? '';
const mapsPlugin = androidMapsKey
  ? ['react-native-maps', { androidGoogleMapsApiKey: androidMapsKey }]
  : 'react-native-maps';

module.exports = {
  expo: {
    ...appJson.expo,
    plugins: [
      ...(appJson.expo.plugins ?? []),
      mapsPlugin,
      [
        'expo-location',
        {
          locationWhenInUsePermission:
            'SkillMatch uses your location only when you tap Use Current Location to place the Job pin.',
          isIosBackgroundLocationEnabled: false,
          isAndroidBackgroundLocationEnabled: false,
          isAndroidForegroundServiceEnabled: false,
        },
      ],
    ],
  },
};
