네. 설정이 정상 적용되면 `android` 경로에서 아래 명령으로 **서명된 Release APK**가 생성되어야 합니다.

```bash
./gradlew clean assembleRelease
```

생성 위치:

```text
android/app/build/outputs/apk/release/app-release.apk
```

Play Store 업로드용 AAB가 필요하면:

```bash
./gradlew clean bundleRelease
```

생성 위치:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

다만 작성하신 과정에서 몇 가지 확인/수정할 부분이 있습니다.

---

## 1. `bundleReleaser`는 오타입니다

아래는 실패합니다.

```bash
./gradlew clean bundleReleaser
```

정확한 태스크 이름은:

```bash
./gradlew clean bundleRelease
```

---

## 2. `gradle.properties` 위치

서명 설정을 Android Gradle 빌드에서 읽게 하려면 파일은 보통 다음 위치에 있어야 합니다.

```text
powder2/android/gradle.properties
```

즉 구조는 대략 이렇습니다.

```text
powder2/
├── android/
│   ├── app/
│   │   └── build.gradle.kts
│   ├── gradle.properties   ← 여기에 생성
│   └── gradlew
├── assets/
└── ...
```

`gradle.properties` 예시:

```properties
POWDER_RELEASE_STORE_FILE=/home/vscode/powder-release-key.jks
POWDER_RELEASE_STORE_PASSWORD=실제_keystore_비밀번호
POWDER_RELEASE_KEY_ALIAS=powder
POWDER_RELEASE_KEY_PASSWORD=실제_key_비밀번호
```

`-alias powder`로 만들었으므로 alias 값은 일반적으로 아래입니다.

```properties
POWDER_RELEASE_KEY_ALIAS=powder
```

---

## 3. `android/app/build.gradle.kts` 설정

기존 `android { ... }` 블록 내부에 아래 내용을 넣으면 됩니다.

```kotlin
android {
    // 기존 compileSdk, namespace 등 설정 유지

    signingConfigs {
        create("release") {
            storeFile = file(providers.gradleProperty("POWDER_RELEASE_STORE_FILE").get())
            storePassword = providers.gradleProperty("POWDER_RELEASE_STORE_PASSWORD").get()
            keyAlias = providers.gradleProperty("POWDER_RELEASE_KEY_ALIAS").get()
            keyPassword = providers.gradleProperty("POWDER_RELEASE_KEY_PASSWORD").get()
        }
    }

    buildTypes {
        getByName("release") {
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = false
            isShrinkResources = false
        }
    }
}
```

Capacitor가 생성한 기본 `buildTypes`에 이미 `release`가 있으므로, 새로 `create("release")` 하지 말고 현재처럼 아래 방식이 맞습니다.

```kotlin
getByName("release")
```

---

## 4. 실제 빌드 순서

웹 앱을 수정한 뒤 Android APK/AAB를 다시 만들 때는 다음 순서가 안전합니다.

```bash
# 프로젝트 루트(powder2)에서
npm run build
npx cap sync android

# Android 빌드
cd android
./gradlew clean assembleRelease
```

AAB가 필요하면:

```bash
./gradlew clean bundleRelease
```

---

## 5. 서명 여부 확인

생성된 APK가 실제로 서명되었는지 확인할 수 있습니다.

```bash
$ANDROID_HOME/build-tools/<버전>/apksigner verify --verbose \
  app/build/outputs/apk/release/app-release.apk
```

또는 Android SDK build-tools 경로를 모른다면:

```bash
find "$ANDROID_HOME/build-tools" -name apksigner
```

정상이라면 대략 다음과 같이 표시됩니다.

```text
Verified using v1 scheme: true
Verified using v2 scheme: true
Verified using v3 scheme: true
```

---

## 6. 주의 사항

`gradle.properties`에는 비밀번호가 들어가므로 Git에 올리면 안 됩니다. `.gitignore`에 추가하세요.

```gitignore
android/gradle.properties
*.jks
*.keystore
```

팀 작업이나 CI 환경에서는 `gradle.properties` 대신 환경 변수 또는 CI Secret을 사용하는 편이 더 안전합니다.

결론적으로, `android/gradle.properties`에 값이 정확히 들어 있고 `build.gradle.kts`의 release signingConfig가 적용되어 있다면:

```bash
cd android
./gradlew assembleRelease
```

실행 시 `app-release.apk`가 **signed APK**로 정상 생성됩니다.
