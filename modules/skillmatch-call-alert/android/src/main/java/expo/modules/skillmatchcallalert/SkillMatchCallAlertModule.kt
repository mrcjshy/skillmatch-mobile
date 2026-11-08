package expo.modules.skillmatchcallalert

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** RTC-03: what the app's JavaScript needs from the native call ringing. */
class SkillMatchCallAlertModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "SkillMatch is not ready yet." }

  override fun definition() = ModuleDefinition {
    Name("SkillMatchCallAlert")

    /** The call a ringing notification (or its Answer / Decline button) opened SkillMatch with, once. */
    Function("consumeLaunchCall") {
      val intent = appContext.currentActivity?.intent
      if (intent == null) null else CallAlert.takeLaunch(intent)
    }

    /** Stops the ringing call notification. */
    Function("cancelIncomingCall") {
      CallAlert.cancel(context)
    }

    /** Lets the call screen show over the lock screen, and turns that off again afterwards. */
    Function("setShowWhenLocked") { show: Boolean ->
      val activity = appContext.currentActivity
      if (activity != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
        activity.runOnUiThread {
          activity.setShowWhenLocked(show)
          activity.setTurnScreenOn(show)
        }
      }
    }

    /** Android 14 and later may need the user to allow full-screen calls for SkillMatch. */
    Function("canUseFullScreenIntent") {
      if (Build.VERSION.SDK_INT < 34) {
        true
      } else {
        context.getSystemService(NotificationManager::class.java)?.canUseFullScreenIntent() ?: false
      }
    }

    Function("openFullScreenIntentSettings") {
      if (Build.VERSION.SDK_INT >= 34) {
        val intent = Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + context.packageName))
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
      }
    }

    Function("startRingback") {
      CallAlert.startRingback()
    }

    Function("stopRingback") {
      CallAlert.stopRingback()
    }
  }
}
