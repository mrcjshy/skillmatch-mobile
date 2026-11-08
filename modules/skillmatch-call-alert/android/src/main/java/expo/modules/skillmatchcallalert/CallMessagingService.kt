package expo.modules.skillmatchcallalert

import android.content.Intent
import android.util.Log
import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService

/**
 * RTC-03: rings natively for a booking video call push, even while SkillMatch is closed or the screen
 * is off. Every other push goes to Expo's own handling, unchanged.
 */
class CallMessagingService : ExpoFirebaseMessagingService() {
  /**
   * Expo sends a push that has a title as an FCM notification message. While SkillMatch is in the
   * background or closed, Firebase shows such a message by itself (one notification sound, no full
   * screen) and never calls onMessageReceived: that is what happened on the TECNO with EAS 10c7ece1
   * (2026-11-06). For a call push only, remove the notification part first, so Firebase hands it to
   * onMessageReceived like a data message.
   */
  override fun handleIntent(intent: Intent) {
    val extras = intent.extras
    if (extras != null && CallAlert.parse(extras) != null) {
      for (key in extras.keySet()) {
        if (key.startsWith("gcm.n.") || key.startsWith("gcm.notification.")) intent.removeExtra(key)
      }
    }
    super.handleIntent(intent)
  }

  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    val push = CallAlert.parse(remoteMessage.data)
    if (push == null) {
      super.onMessageReceived(remoteMessage)
      return
    }
    Log.i(TAG, "booking call push: ${push.kind}")
    if (push.kind == "call") {
      CallAlert.show(applicationContext, push, remoteMessage.sentTime)
    } else {
      CallAlert.cancel(applicationContext)
    }
  }

  private companion object {
    const val TAG = "SkillMatchCall"
  }
}
