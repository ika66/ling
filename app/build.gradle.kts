import java.util.Properties

plugins {
    id("com.android.application")
}

// 发布签名：优先读取仓库根目录的 keystore.properties（不入库）；
// 文件不存在时（比如别人 clone 下来）自动回退到 debug 签名，保证能构建。
val keystorePropsFile = rootProject.file("keystore.properties")
val keystoreProps = Properties().apply {
    // 必须按 UTF-8 读：默认 ISO-8859-1 会把中文路径读成乱码
    if (keystorePropsFile.exists()) keystorePropsFile.reader(Charsets.UTF_8).use { load(it) }
}
val hasReleaseKey = keystorePropsFile.exists() && keystoreProps.getProperty("storePassword") != null

android {
    namespace = "com.yuwei.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.yuwei.app"
        minSdk = 24
        targetSdk = 34
        versionCode = 42
        versionName = "2.2.3"
    }

    signingConfigs {
        if (hasReleaseKey) {
            create("release") {
                storeFile = file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (hasReleaseKey) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlin {
        compilerOptions {
            jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
        }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.exifinterface:exifinterface:1.3.7")
}
