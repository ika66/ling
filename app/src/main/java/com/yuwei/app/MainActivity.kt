package com.yuwei.app

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ContentValues
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Matrix
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.MediaStore
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.exifinterface.media.ExifInterface
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

class MainActivity : Activity() {

    private lateinit var webView: WebView
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private var pendingPickId: String? = null
    private var lastTop = 0
    private var lastBottom = 0
    private val httpPool = Executors.newSingleThreadExecutor()

    companion object {
        private const val FILE_CHOOSER_REQUEST = 901
        private const val PICK_IMAGES_REQUEST = 902
        private const val UA =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 边到边：页面延伸到状态栏与手势条后面，具体让位交给前端安全区变量。
        // 传统 flag 兜底（部分 ROM 上 setDecorFitsSystemWindows 不生效）。
        WindowCompat.setDecorFitsSystemWindows(window, false)
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = window.decorView.systemUiVisibility or
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
            View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
            View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.attributes.layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
        }

        webView = WebView(this)
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            mediaPlaybackRequiresUserGesture = false
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val scheme = request.url.scheme ?: return false
                // 站内（本地资源与普通网页）放行；其他 scheme（qqmusic:// 等）交给系统
                return if (scheme == "file" || scheme == "http" || scheme == "https" || scheme == "data" || scheme == "blob") {
                    false
                } else {
                    !openExternal(request.url.toString())
                }
            }

            override fun onPageFinished(view: WebView, url: String) {
                pushInsets()
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams
            ): Boolean {
                filePathCallback?.onReceiveValue(null)
                filePathCallback = callback
                return try {
                    startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST)
                    true
                } catch (e: Exception) {
                    filePathCallback = null
                    false
                }
            }
        }

        webView.addJavascriptInterface(LingBridge(), "LingBridge")
        setContentView(webView)

        ViewCompat.setOnApplyWindowInsetsListener(webView) { _, insets ->
            val sb = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            // 系统给的是物理像素，CSS 要的是逻辑像素
            val density = webView.resources.displayMetrics.density
            lastTop = Math.round(sb.top / density)
            lastBottom = Math.round(sb.bottom / density)
            pushInsets()
            insets
        }

        webView.loadUrl("file:///android_asset/index.html")
    }

    private fun pushInsets() {
        webView.post {
            webView.evaluateJavascript(
                "window.__setSafeInsets && window.__setSafeInsets($lastTop,$lastBottom)", null
            )
        }
    }

    private fun openExternal(url: String): Boolean = try {
        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        true
    } catch (e: Exception) {
        false
    }

    override fun onBackPressed() {
        webView.evaluateJavascript("(window.androidBack ? window.androidBack() : false)") { r ->
            val handled = r != null && r.trim() == "true"
            if (!handled) finish()
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == FILE_CHOOSER_REQUEST) {
            val cb = filePathCallback
            filePathCallback = null
            cb?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data))
            return
        }
        if (requestCode == PICK_IMAGES_REQUEST) {
            val id = pendingPickId
            pendingPickId = null
            if (id == null) return
            val uris = mutableListOf<Uri>()
            if (resultCode == RESULT_OK && data != null) {
                val clip = data.clipData
                if (clip != null) {
                    for (i in 0 until clip.itemCount) uris.add(clip.getItemAt(i).uri)
                } else {
                    data.data?.let { uris.add(it) }
                }
            }
            // 解码压缩放在后台线程，避免大图卡 UI
            httpPool.execute {
                val out = mutableListOf<String>()
                for (u in uris.take(9)) {
                    readImageAsDataUrl(u)?.let { out.add(it) }
                }
                deliverPick(id, out)
            }
            return
        }
        super.onActivityResult(requestCode, resultCode, data)
    }

    private fun deliverPick(id: String, dataUrls: List<String>) {
        val arr = JSONArray()
        dataUrls.forEach { arr.put(it) }
        val js = "window.__lingPickCb && window.__lingPickCb(" + JSONObject.quote(id) + "," + arr + ")"
        // 用 webView.post 排队，确保在 WebView 主线程消息循环里执行，避免相册返回瞬间 evaluateJavascript 丢失
        webView.post { webView.evaluateJavascript(js, null) }
    }

    /** 读取一张系统相册图片：降采样到最长边 1600px、按 EXIF 摆正、压成 JPEG data URL。 */
    private fun readImageAsDataUrl(uri: Uri): String? {
        return try {
            val resolver = contentResolver
            // 一次性读入字节数组，避免某些 ContentProvider 的 stream 只能打开一次
            val bytes = resolver.openInputStream(uri)?.use { it.readBytes() } ?: return null
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
            var sample = 1
            while (bounds.outWidth / (sample * 2) >= 1600 && bounds.outHeight / (sample * 2) >= 1600) sample *= 2
            val opts = BitmapFactory.Options().apply { inSampleSize = sample }
            val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts) ?: return null

            // EXIF 方向：相机原图常见旋转标记，不摆正会横着显示
            val orientation = try {
                ExifInterface(java.io.ByteArrayInputStream(bytes))
                    .getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
            } catch (e: Exception) { ExifInterface.ORIENTATION_NORMAL }

            var degrees = 0f
            var flipH = false
            when (orientation) {
                ExifInterface.ORIENTATION_ROTATE_90 -> degrees = 90f
                ExifInterface.ORIENTATION_ROTATE_180 -> degrees = 180f
                ExifInterface.ORIENTATION_ROTATE_270 -> degrees = 270f
                ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> flipH = true
                ExifInterface.ORIENTATION_FLIP_VERTICAL -> { degrees = 180f; flipH = true }
                ExifInterface.ORIENTATION_TRANSPOSE -> { degrees = 90f; flipH = true }
                ExifInterface.ORIENTATION_TRANSVERSE -> { degrees = 270f; flipH = true }
            }
            val out = if (degrees != 0f || flipH) {
                val m = Matrix()
                if (flipH) m.setScale(-1f, 1f)
                if (degrees != 0f) m.postRotate(degrees)
                Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, m, true)
            } else bmp
            val bos = ByteArrayOutputStream()
            out.compress(Bitmap.CompressFormat.JPEG, 85, bos)
            if (out !== bmp) out.recycle()
            bmp.recycle()
            "data:image/jpeg;base64," + android.util.Base64.encodeToString(bos.toByteArray(), android.util.Base64.NO_WRAP)
        } catch (e: Exception) {
            null
        }
    }

    override fun onPause() {
        webView.onPause()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onDestroy() {
        webView.loadUrl("about:blank")
        webView.removeAllViews()
        webView.destroy()
        httpPool.shutdownNow()
        super.onDestroy()
    }

    inner class LingBridge {

        /** 异步取网页数据：给前端做专辑搜索用（WebView 里直接 fetch 会被 CORS 拦）。 */
        @JavascriptInterface
        fun httpGetAsync(callbackId: String, url: String) {
            httpPool.execute {
                var ok = false
                var body = ""
                try {
                    val conn = URL(url).openConnection() as HttpURLConnection
                    conn.connectTimeout = 8000
                    conn.readTimeout = 8000
                    conn.setRequestProperty("User-Agent", UA)
                    conn.setRequestProperty("Referer", "https://y.qq.com/")
                    val code = conn.responseCode
                    ok = code in 200..299
                    val stream = if (ok) conn.inputStream else conn.errorStream
                    if (stream != null) {
                        body = BufferedReader(InputStreamReader(stream, Charsets.UTF_8)).use { it.readText() }
                    }
                } catch (e: Exception) {
                    ok = false
                    body = ""
                }
                val js = "window.__lingHttpCb && window.__lingHttpCb(" +
                    JSONObject.quote(callbackId) + "," + ok + "," + JSONObject.quote(body) + ")"
                runOnUiThread { webView.evaluateJavascript(js, null) }
            }
        }

        /** 异步 POST JSON 请求：给前端调大模型 API 用（WebView 里 fetch 会被 CORS 拦）。
         *  body 为 JSON 字符串，authHeader 形如 "Bearer sk-xxx"，为空则不附带。 */
        @JavascriptInterface
        fun httpPostAsync(callbackId: String, url: String, body: String, authHeader: String) {
            httpPool.execute {
                var ok = false
                var resp = ""
                try {
                    val conn = URL(url).openConnection() as HttpURLConnection
                    conn.connectTimeout = 15000
                    conn.readTimeout = 30000
                    conn.requestMethod = "POST"
                    conn.doOutput = true
                    conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                    conn.setRequestProperty("User-Agent", UA)
                    if (authHeader.isNotBlank()) conn.setRequestProperty("Authorization", authHeader)
                    val bytes = body.toByteArray(Charsets.UTF_8)
                    conn.outputStream.use { it.write(bytes) }
                    val code = conn.responseCode
                    ok = code in 200..299
                    val stream = if (ok) conn.inputStream else conn.errorStream
                    if (stream != null) {
                        resp = BufferedReader(InputStreamReader(stream, Charsets.UTF_8)).use { it.readText() }
                    }
                } catch (e: Exception) {
                    ok = false
                    resp = ""
                }
                val js = "window.__lingHttpCb && window.__lingHttpCb(" +
                    JSONObject.quote(callbackId) + "," + ok + "," + JSONObject.quote(resp) + ")"
                runOnUiThread { webView.evaluateJavascript(js, null) }
            }
        }

        /** 取远程图片为 base64：给前端做封面取色用（canvas 直接加载远程图会因跨域污染而失败）。 */
        @JavascriptInterface
        fun httpGetImage(callbackId: String, url: String) {
            httpPool.execute {
                var ok = false
                var b64 = ""
                var mime = "image/jpeg"
                try {
                    val conn = URL(url).openConnection() as HttpURLConnection
                    conn.connectTimeout = 8000
                    conn.readTimeout = 8000
                    conn.setRequestProperty("User-Agent", UA)
                    conn.setRequestProperty("Referer", "https://y.qq.com/")
                    val code = conn.responseCode
                    ok = code in 200..299
                    val stream = if (ok) conn.inputStream else null
                    if (stream != null) {
                        val bytes = stream.use { it.readBytes() }
                        val ct = conn.contentType
                        if (!ct.isNullOrBlank()) mime = ct.substringBefore(';').trim()
                        b64 = android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)
                        if (bytes.isEmpty()) ok = false
                    }
                } catch (e: Exception) {
                    ok = false
                    b64 = ""
                }
                val js = "window.__lingImageCb && window.__lingImageCb(" +
                    JSONObject.quote(callbackId) + "," + ok + "," + JSONObject.quote(mime) + "," + JSONObject.quote(b64) + ")"
                runOnUiThread { webView.evaluateJavascript(js, null) }
            }
        }

        /** 原生选图：绕开 WebView 文件选择器（部分 ROM 回调不回传）。
         *  拉起系统相册，选完降采样转 base64 data URL，经 __lingPickCb 回传 JS。 */
        @JavascriptInterface
        fun pickImages(callbackId: String, max: Int) {
            runOnUiThread {
                pendingPickId = callbackId
                val count = max.coerceIn(1, 9)
                try {
                    if (Build.VERSION.SDK_INT >= 33) {
                        val intent = Intent(MediaStore.ACTION_PICK_IMAGES).apply {
                            type = "image/*"
                            if (count > 1) putExtra(MediaStore.EXTRA_PICK_IMAGES_MAX, count)
                        }
                        startActivityForResult(intent, PICK_IMAGES_REQUEST)
                    } else {
                        val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
                            type = "image/*"
                            addCategory(Intent.CATEGORY_OPENABLE)
                            if (count > 1) putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                        }
                        startActivityForResult(Intent.createChooser(intent, "选择图片"), PICK_IMAGES_REQUEST)
                    }
                } catch (e: Exception) {
                    pendingPickId = null
                    deliverPick(callbackId, emptyList())
                }
            }
        }

        /** 用系统方式打开链接：App Links / 自定义 scheme 都能走。 */
        @JavascriptInterface
        fun openUrl(url: String): Boolean = openExternal(url)

        /** 探测某个 scheme 是否有 App 能接（songlog 的 canLaunch 等价物）。 */
        @JavascriptInterface
        fun canOpen(url: String): Boolean = try {
            intentCanBeHandled(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        } catch (e: Exception) {
            false
        }

        /** 按包名判断 App 是否安装。 */
        @JavascriptInterface
        fun isInstalled(pkg: String): Boolean = try {
            packageManager.getPackageInfo(pkg, 0) != null
        } catch (e: Exception) {
            false
        }

        /** 状态栏图标深浅：前端详情页主题变化时调用。 */
        @JavascriptInterface
        fun setStatusBarIcons(lightBackground: Boolean) {
            runOnUiThread {
                try {
                    val controller = androidx.core.view.WindowInsetsControllerCompat(window, window.decorView)
                    controller.isAppearanceLightStatusBars = lightBackground
                } catch (e: Exception) { }
            }
        }

        /** 轻震动反馈：WebView 的 navigator.vibrate 在部分 ROM 上无效，前端统一走这里。 */
        @JavascriptInterface
        fun vibrate(ms: Long) {
            runOnUiThread {
                try {
                    val vib: Vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        val vm = getSystemService(VibratorManager::class.java)
                        vm.defaultVibrator
                    } else {
                        @Suppress("DEPRECATION")
                        getSystemService(VIBRATOR_SERVICE) as Vibrator
                    }
                    if (!vib.hasVibrator()) return@runOnUiThread
                    val effect = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        // 系统预设的“滴答”手感，比原始波形更像原生轻点
                        when {
                            ms <= 6 -> VibrationEffect.createPredefined(VibrationEffect.EFFECT_TICK)
                            ms <= 18 -> VibrationEffect.createPredefined(VibrationEffect.EFFECT_CLICK)
                            else -> VibrationEffect.createOneShot(ms.coerceIn(10, 80), VibrationEffect.DEFAULT_AMPLITUDE)
                        }
                    } else {
                        VibrationEffect.createOneShot(ms.coerceIn(10, 80), VibrationEffect.DEFAULT_AMPLITUDE)
                    }
                    vib.vibrate(effect)
                } catch (e: Exception) { }
            }
        }

        private fun intentCanBeHandled(intent: Intent): Boolean = try {
            packageManager.resolveActivity(intent, 0) != null
        } catch (e: Exception) {
            false
        }

        /** 备份导出：API 29+ 写入公共下载目录，旧系统写入应用私有目录。 */
        @JavascriptInterface
        fun saveFile(name: String, content: String): Boolean {
            return try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    var cv = ContentValues().apply {
                        put(MediaStore.Downloads.DISPLAY_NAME, name)
                        put(MediaStore.Downloads.MIME_TYPE, "application/json")
                        put(MediaStore.Downloads.IS_PENDING, 1)
                    }
                    val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv)
                        ?: return false
                    contentResolver.openOutputStream(uri)?.use {
                        it.write(content.toByteArray(Charsets.UTF_8))
                    }
                    cv = ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) }
                    contentResolver.update(uri, cv, null, null)
                    true
                } else {
                    val dir = File(getExternalFilesDir(null), "backup").apply { mkdirs() }
                    File(dir, name).writeText(content, Charsets.UTF_8)
                    runOnUiThread {
                        Toast.makeText(this@MainActivity, "已保存到应用目录 backup/$name", Toast.LENGTH_LONG).show()
                    }
                    true
                }
            } catch (e: Exception) {
                false
            }
        }
    }
}
