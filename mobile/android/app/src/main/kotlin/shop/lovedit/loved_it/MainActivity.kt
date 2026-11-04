package shop.lovedit.loved_it

import android.content.ActivityNotFoundException
import android.content.Intent
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
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
    }
}
