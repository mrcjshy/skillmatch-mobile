// RTC-05: the background Decline task has to be registered before Expo Router starts the app, because
// the call notification can start SkillMatch without a screen just to run it.
import './src/lib/call-action-task';
import 'expo-router/entry';
