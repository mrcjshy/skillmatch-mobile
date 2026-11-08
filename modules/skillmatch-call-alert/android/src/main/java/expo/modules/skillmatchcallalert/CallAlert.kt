package expo.modules.skillmatchcallalert

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.RingtoneManager
import android.media.ToneGenerator
import android.os.Build
import android.os.Bundle
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import org.json.JSONObject

/**
 * RTC-03 (owner, 2026-11-06): an incoming booking video call rings like a phone call. A call push
 * shows a full-screen call notification with the device ringtone, repeating until the callee answers,
 * declines, opens SkillMatch, or the 45-second ring window ends. Answer, Decline and a tap all open
 * SkillMatch, which re-reads the call from the server before showing or answering it.
 */
object CallAlert {
  const val CHANNEL_ID = "skillmatch_calls_v1"
  const val EXTRA_CALL = "skillmatch_incoming_call"
  const val EXTRA_BOOKING_ID = "skillmatch_booking_id"
  const val EXTRA_CALL_ID = "skillmatch_call_id"
  const val EXTRA_ACTION = "skillmatch_call_action"
  private const val TAG = "skillmatch_call"
  private const val NOTIFICATION_ID = 7341
  private const val RING_MS = 45_000L
  private val UUID_RE = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")

  data class CallPush(val kind: String, val bookingId: String, val callId: String)

  /** A call push from RemoteMessage data. */
  fun parse(data: Map<String, String>): CallPush? = parseFields { key -> data[key] }

  /** The same, from the raw FCM intent extras, before Firebase decides how to show the push. */
  fun parse(extras: Bundle): CallPush? = parseFields { key -> extras.getString(key) }

  /** Expo's push service keeps the sender's `data` object as JSON under "body"; top-level keys are a fallback. */
  private fun parseFields(read: (String) -> String?): CallPush? {
    val json = read("body")?.let { body ->
      try {
        JSONObject(body)
      } catch (error: Exception) {
        null
      }
    }
    val field = { key: String -> json?.optString(key)?.takeIf { it.isNotEmpty() } ?: read(key) }
    val kind = field("kind") ?: return null
    if (kind != "call" && kind != "call_end") return null
    val bookingId = field("booking_id") ?: return null
    val callId = field("call_id") ?: return null
    if (!UUID_RE.matches(bookingId) || !UUID_RE.matches(callId)) return null
    return CallPush(kind, bookingId, callId)
  }

  private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(CHANNEL_ID, "Incoming video calls", NotificationManager.IMPORTANCE_HIGH)
    channel.description = "Rings for incoming SkillMatch booking video calls."
    channel.setSound(
      RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
      AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build()
    )
    channel.enableVibration(true)
    channel.vibrationPattern = longArrayOf(0, 1000, 1000)
    channel.lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    manager.createNotificationChannel(channel)
  }

  private fun launch(context: Context, push: CallPush, action: String, requestCode: Int): PendingIntent? {
    val intent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    intent.putExtra(EXTRA_CALL, true)
    intent.putExtra(EXTRA_BOOKING_ID, push.bookingId)
    intent.putExtra(EXTRA_CALL_ID, push.callId)
    intent.putExtra(EXTRA_ACTION, action)
    return PendingIntent.getActivity(
      context,
      requestCode,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  @SuppressLint("MissingPermission")
  fun show(context: Context, push: CallPush, sentAtMs: Long) {
    ensureChannel(context)
    val open = launch(context, push, "open", NOTIFICATION_ID) ?: return
    val answer = launch(context, push, "answer", NOTIFICATION_ID + 1) ?: return
    // RTC-05: Decline never opens SkillMatch; it stops the ringing and declines in the background.
    val decline = PendingIntent.getBroadcast(
      context,
      NOTIFICATION_ID + 2,
      Intent(context, CallActionReceiver::class.java)
        .putExtra(EXTRA_BOOKING_ID, push.bookingId)
        .putExtra(EXTRA_CALL_ID, push.callId),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val now = System.currentTimeMillis()
    val sent = if (sentAtMs in 1..now) sentAtMs else now
    val remaining = (sent + RING_MS - now).coerceIn(5_000L, RING_MS)
    val caller = Person.Builder().setName("SkillMatch booking").setImportant(true).build()
    val drawable = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
    val icon = if (drawable != 0) drawable else context.applicationInfo.icon
    val notification = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(icon)
      .setContentTitle("Incoming video call")
      .setContentText("SkillMatch booking video call")
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setAutoCancel(false)
      .setTimeoutAfter(remaining)
      .setContentIntent(open)
      .setFullScreenIntent(open, true)
      .setStyle(NotificationCompat.CallStyle.forIncomingCall(caller, decline, answer))
      .build()
    // Repeat the ringtone until the call notification goes away.
    notification.flags = notification.flags or Notification.FLAG_INSISTENT
    try {
      NotificationManagerCompat.from(context).notify(TAG, NOTIFICATION_ID, notification)
    } catch (error: SecurityException) {
      // Notifications are off for SkillMatch; the in-app card still shows while the app is open.
    }
  }

  fun cancel(context: Context) {
    NotificationManagerCompat.from(context).cancel(TAG, NOTIFICATION_ID)
  }

  /** Reads, then clears, the call a call notification opened SkillMatch with. */
  fun takeLaunch(intent: Intent): Map<String, String>? {
    if (!intent.getBooleanExtra(EXTRA_CALL, false)) return null
    val bookingId = intent.getStringExtra(EXTRA_BOOKING_ID)
    val callId = intent.getStringExtra(EXTRA_CALL_ID)
    val action = intent.getStringExtra(EXTRA_ACTION) ?: "open"
    intent.removeExtra(EXTRA_CALL)
    intent.removeExtra(EXTRA_BOOKING_ID)
    intent.removeExtra(EXTRA_CALL_ID)
    intent.removeExtra(EXTRA_ACTION)
    if (bookingId == null || callId == null || !UUID_RE.matches(bookingId) || !UUID_RE.matches(callId)) return null
    return mapOf("bookingId" to bookingId, "callId" to callId, "action" to action)
  }

  private var ringback: ToneGenerator? = null

  /** The caller hears a ringback tone while the other side is being called. */
  @Synchronized
  fun startRingback() {
    if (ringback != null) return
    ringback = try {
      ToneGenerator(AudioManager.STREAM_MUSIC, 70).also { it.startTone(ToneGenerator.TONE_SUP_RINGTONE) }
    } catch (error: RuntimeException) {
      null
    }
  }

  @Synchronized
  fun stopRingback() {
    val tone = ringback ?: return
    ringback = null
    try {
      tone.stopTone()
    } finally {
      tone.release()
    }
  }
}
