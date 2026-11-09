package shop.lovedit.loved_it

import android.content.ActivityNotFoundException
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File

class MainActivity : FlutterActivity() {
    /** The notification sound playing now, released when it ends. */
    private var player: MediaPlayer? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        // Android's own share sheet for a line of text (lib/core/share.dart), so the app needs no share package.
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "shop.lovedit/share")
            .setMethodCallHandler { call, result ->
                if (call.method != "text") {
                    result.notImplemented()
                    return@setMethodCallHandler
                }
                val text = call.argument<String>("text")
                if (text.isNullOrBlank()) {
                    result.error("empty", "Nothing to share", null)
                    return@setMethodCallHandler
                }
                val send = Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_TEXT, text)
                    call.argument<String>("subject")?.let { putExtra(Intent.EXTRA_SUBJECT, it) }
                }
                try {
                    startActivity(Intent.createChooser(send, call.argument<String>("title")))
                    result.success(true)
                } catch (error: ActivityNotFoundException) {
                    result.error("no_app", error.message, null)
                }
            }

        // The notification sound (lib/core/sound/notification_sound.dart), so the app needs no audio package. Dart
        // sends the WAV from the app's assets once; it is kept in the cache and played on the notification volume,
        // so silent, vibrate and Do Not Disturb keep it quiet like any other notification.
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "shop.lovedit/sound")
            .setMethodCallHandler { call, result ->
                if (call.method != "play") {
                    result.notImplemented()
                    return@setMethodCallHandler
                }
                val name = call.argument<String>("name")
                val bytes = call.argument<ByteArray>("bytes")
                if (name == null || !name.matches(Regex("[a-z0-9_]{1,32}")) || bytes == null || bytes.isEmpty()) {
                    result.error("bad_sound", "No sound to play", null)
                    return@setMethodCallHandler
                }
                try {
                    val dir = File(cacheDir, "sounds").apply { mkdirs() }
                    val file = File(dir, "$name.wav")
                    if (!file.exists() || file.length() != bytes.size.toLong()) file.writeBytes(bytes)
                    play(file)
                    result.success(true)
                } catch (error: Exception) {
                    result.error("play_failed", error.message, null)
                }
            }
    }

    private fun play(file: File) {
        player?.release()
        val next = MediaPlayer()
        player = next
        next.setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
        )
        next.setOnCompletionListener { done ->
            done.release()
            if (player === done) player = null
        }
        next.setOnErrorListener { failed, _, _ ->
            failed.release()
            if (player === failed) player = null
            true
        }
        next.setDataSource(file.absolutePath)
        next.prepare()
        next.start()
    }

    override fun onDestroy() {
        player?.release()
        player = null
        super.onDestroy()
    }
}
