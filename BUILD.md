# Building the Android App

## Prerequisites

- **Node.js** 18+ and npm
- **Android Studio** (with Android SDK 33+)
- **Java 17** (bundled with Android Studio)

## First-time setup

```bash
npm install
npx cap sync android
```

## Build workflow

Every time you change web files (HTML, CSS, JS):

```bash
npm run build          # copies web assets to www/
npx cap sync android   # syncs www/ into the Android project
```

Or in one step:

```bash
npm run cap:sync
```

## Open in Android Studio

```bash
npm run cap:open
```

This opens the `android/` project in Android Studio. From there:

1. **Run on device/emulator**: Click the green play button
2. **Build APK**: Build > Build Bundle(s) / APK(s) > Build APK(s)
3. **Signed release**: Build > Generate Signed Bundle / APK

The debug APK will be at:
`android/app/build/outputs/apk/debug/app-debug.apk`

## App icons

Replace the placeholder icons before releasing:

- `img/icon-192.png` (192x192 px)
- `img/icon-512.png` (512x512 px)

Then regenerate Android icons in Android Studio:
File > New > Image Asset > choose your icon > Finish

## Google Drive sync in the app

The app auto-syncs to Google Drive every 5 minutes after the user does one manual "Save > Google Drive" (which grants the OAuth token). It also syncs when the app goes to background.

For the Android app, add your web app's origin AND `https://localhost` to the OAuth client's authorized JavaScript origins in Google Cloud Console.
