铃 · LING
一个本地优先的个人媒体记录 App —— 书、漫画、电影、游戏、专辑、歌曲，看完/在看/想看都在一处。
铃是一个 Kotlin + WebView 壳的 Android 应用：原生层只做「壳」（沉浸式窗口、相册选图、网络代理、震动、文件导出），
全部界面与业务逻辑放在 app/src/main/assets/ 下的 HTML/CSS/JS 里。因此迭代 UI 的代价很低，
改完三个前端文件重新打包即可。
- 包名：com.yuwei.app
- 最低支持：Android 7.0（API 24），目标 API 34
- 数据：全部存在设备本地（localStorage），无账号、无云端、无数据上传
功能
记录
- 三种状态：已看完 / 在看 / 想看，各自独立列表
- 六种作品类型：书、漫画、电影、游戏、专辑、歌曲（不同类型对应不同的创作者字段：作者 / 导演 / 制作人·工作室 / 歌手）
- 评分、记录时间、标签、感想、随手记、多图
- 详情页：动态取色背景、固定返回/更多按钮、播放跳转（QQ 音乐 / 网易云音乐）
- 记录卡片：长按拖动排序、拖到顶部置顶、拖到底部删除，全部带让位动画与边缘自动滚动
首页
- 豆瓣式滑动卡片（一次一张，左右露边），点击进详情，右下角可快速换图
- 每日推荐：AI 生成一篇精选文章片段 + 一个作品推荐，可点开查看详情
- 搜索：本地记录搜索 + 外部作品联想（豆瓣 / QQ 音乐 / 网易云），支持搜索历史
外观
- 六套主题：海雾青、水墨灰、薰衣紫、森林绿、落日橘、午夜蓝（含深色）
- Edge-to-Edge 沉浸式布局，状态栏图标随主题自动反色
- 交互动效：加号圆形展开菜单、导航水滴指示块、状态切换液态拉伸、抽屉弹性滑入
AI（可选）
- 多模型接入：DeepSeek / 通义千问 / 智谱 GLM / Kimi，直接填自己的 API Key
- 能力：智能标签、相似作品推荐、每日推荐
其他
- 作品图标、卡片背景、随手记图片支持任意矩形框选裁切
- 全部记录可导出为 JSON 备份，也可从备份导入
技术架构
┌──────────────────────────────────────────────┐
│  MainActivity.kt（唯一的原生类）               │
│  · Edge-to-Edge + insets → CSS 变量注入        │
│  · LingBridge JS 接口                          │
│  · 返回键 → window.androidBack() 契约           │
└───────────────────┬──────────────────────────┘
                    │ WebView
┌───────────────────▼──────────────────────────┐
│  assets/                                      │
│  index.html   结构 + SVG 图标库                │
│  app.css      六套主题变量 + 全部样式           │
│  app.js       全部业务逻辑（IIFE，无构建步骤）   │
│  └ localStorage: yuwei.app.v1（作品数据）       │
└──────────────────────────────────────────────┘
原生桥方法（window.LingBridge）：
方法
用途
httpGetAsync / httpPostAsync
代发 HTTP（规避 WebView CORS），后者用于调大模型
httpGetImage
远程图片转 base64（封面取色不被跨域污染）
pickImages
原生相册选图 → 降采样 + EXIF 摆正 → data URL
openUrl / canOpen / isInstalled
跳转外部 App、探测 scheme 与安装状态
setStatusBarIcons
详情页/主题切换时同步状态栏图标深浅
vibrate
轻震动反馈（WebView 的 navigator.vibrate 在部分 ROM 无效）
saveFile
备份导出到下载目录
目录结构
.
├── app/
│   ├── build.gradle.kts          # versionCode / versionName 在这里
│   └── src/main/
│       ├── AndroidManifest.xml
│       ├── java/com/yuwei/app/MainActivity.kt
│       ├── assets/               # ★ 前端全部代码
│       │   ├── index.html
│       │   ├── app.css
│       │   └── app.js
│       └── res/                  # 图标（含自适应图标）
├── build.gradle.kts
├── settings.gradle.kts
├── gradle/wrapper/               # Gradle 9.3.1 wrapper
├── CHANGELOG.md
├── docs/发布流程.md
└── LICENSE
构建
环境要求：JDK 17、Android SDK Platform 36（compileSdk = 36）。
# 命令行（仓库自带 wrapper）
./gradlew assembleRelease
# Windows: gradlew.bat assembleRelease

# 产物
app/build/outputs/apk/release/app-release.apk

# 安装到已连接设备
adb install -r app/build/outputs/apk/release/app-release.apk
也可以用 Android Studio 直接打开仓库根目录（会读取 local.properties 里的 SDK 路径，该文件不入库）。
当前 release 构建使用 debug 签名，方便自用覆盖安装。若要正式分发，请按
docs/发布流程.md 配置自己的 keystore。
版本管理约定
- versionCode 每个版本必须递增（当前 38），否则无法覆盖安装
- versionName 与 Git tag 一致：v2.0.2
- 每次发版：
  a. 改 app/build.gradle.kts 的版本号
  b. 更新 CHANGELOG.md
  c. 提交 → git tag vX.Y.Z → push tag
  d. 在 GitHub Releases 里附上 APK 与更新说明
完整步骤见 docs/发布流程.md。
数据与隐私
- 所有记录只保存在设备本地 localStorage（键 yuwei.app.v1），卸载应用即丢失，请定期用「导出备份」。
- 除 AI 功能（需要你自己填 API Key）与作品联想搜索（豆瓣 / QQ 音乐 / 网易云公开接口）外，应用不联网。
- 仓库中不含任何密钥、签名文件与个人数据。
免责声明
本项目是个人自用的作品记录工具，供学习与自用；不提供、不存储、不分发任何受版权保护的内容。
第三方平台接口与跳转 scheme 可能随时变更，相关功能不保证长期可用。
License
MIT
