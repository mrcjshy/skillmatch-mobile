package expo.modules.skillmatchcallalert

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.facebook.react.HeadlessJsTaskService

/**
 * RTC-05 (owner, 2026-11-06): Decline on the ringing call notification works like Messenger. It stops the
 * ringing at once and declines the call in the background, without opening SkillMatch.
 */
class CallActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    CallAlert.cancel(context)
    val bookingId = intent.getStringExtra(CallAlert.EXTRA_BOOKING_ID) ?: return
    val callId = intent.getStringExtra(CallAlert.EXTRA_CALL_ID) ?: return
    val task = Intent(context, CallActionTaskService::class.java)
      .putExtra("action", "decline")
      .putExtra("bookingId", bookingId)
      .putExtra("callId", callId)
    try {
      HeadlessJsTaskService.acquireWakeLockNow(context)
    } catch (error: Exception) {
      Log.w("SkillMatchCall", "no wake lock for the decline task", error)
    }
    try {
      context.startService(task)
    } catch (error: Exception) {
      // The ringing has stopped; the call ends when its ring window does.
      Log.w("SkillMatchCall", "decline task could not start", error)
    }
  }
}
