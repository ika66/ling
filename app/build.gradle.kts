plugins {
    id("com.android.application")
}

android {
    namespace = "com.yuwei.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.yuwei.app"
        minSdk = 24
        targetSdk = 34
        versionCode = 38
        versionName = "2.0.2"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("debug")
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
