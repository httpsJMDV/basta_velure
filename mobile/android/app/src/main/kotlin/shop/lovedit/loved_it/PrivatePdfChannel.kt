package shop.lovedit.loved_it

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodChannel
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.UUID
import java.util.concurrent.Executors

/** One bounded page at a time, from the application's private cache. No external viewer or shared files. */
class PrivatePdfChannel(context: Context, messenger: BinaryMessenger) {
    private val worker = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private val directory = File(context.cacheDir, "private-pdfs").apply { mkdirs() }
    private data class Document(val renderer: PdfRenderer, val file: File)
    private val documents = mutableMapOf<String, Document>()
    private val channel = MethodChannel(messenger, "shop.lovedit/pdf")

    init {
        directory.listFiles()?.filter { it.isFile && it.extension == "pdf" }?.forEach { it.delete() }
        channel.setMethodCallHandler { call, result ->
            worker.execute {
                try {
                    val answer: Any? = when (call.method) {
                        "open" -> {
                            val bytes = call.argument<ByteArray>("bytes") ?: error("Missing PDF")
                            require(bytes.size in 5..20_971_520) { "PDF is too large" }
                            val handle = UUID.randomUUID().toString()
                            val file = File(directory, "$handle.pdf")
                            file.writeBytes(bytes)
                            val descriptor = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
                            val renderer = try { PdfRenderer(descriptor) } catch (error: Exception) {
                                descriptor.close(); file.delete(); throw error
                            }
                            documents[handle] = Document(renderer, file)
                            mapOf("handle" to handle, "pages" to renderer.pageCount)
                        }
                        "render" -> {
                            val doc = documents[call.argument<String>("handle")] ?: error("Document closed")
                            val index = call.argument<Int>("page") ?: 0
                            require(index in 0 until doc.renderer.pageCount)
                            doc.renderer.openPage(index).use { page ->
                                val width = (call.argument<Int>("width") ?: 1400).coerceIn(512, 1600)
                                val height = (page.height.toLong() * width / page.width).toInt().coerceIn(1, 4096)
                                val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
                                try {
                                    bitmap.eraseColor(Color.WHITE)
                                    page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                                    ByteArrayOutputStream().use { out ->
                                        bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
                                        out.toByteArray()
                                    }
                                } finally { bitmap.recycle() }
                            }
                        }
                        "close" -> { close(call.argument<String>("handle")); null }
                        else -> error("Unknown PDF action")
                    }
                    main.post { result.success(answer) }
                } catch (_: Exception) {
                    main.post { result.error("pdf_failed", "The PDF could not be displayed.", null) }
                }
            }
        }
    }
    private fun close(handle: String?) {
        val doc = documents.remove(handle) ?: return
        try { doc.renderer.close() } finally { doc.file.delete() }
    }
    fun dispose() {
        channel.setMethodCallHandler(null)
        worker.execute { documents.keys.toList().forEach { close(it) } }
        worker.shutdown()
    }
}
