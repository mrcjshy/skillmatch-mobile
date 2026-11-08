package expo.modules.skillmatchcallalert

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/** RTC-05: runs the "SkillMatchCallAction" JavaScript task (decline) with the signed-in session, no screen. */
class CallActionTaskService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val extras = intent?.extras ?: return null
    return HeadlessJsTaskConfig("SkillMatchCallAction", Arguments.fromBundle(extras), 20_000L, true)
  }
}
