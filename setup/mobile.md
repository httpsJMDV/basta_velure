# Loved-IT mobile app: install and run

Everything you need, in order. No need to look anything up elsewhere.

> **Cloud hosting note (November 13, 2026):** the API is now deployed on Laravel Cloud. The local-terminal instructions below describe the earlier tunnel setup. A backend deployment does not rebuild or publish the Android APK. `setup/publish-apk.ps1` builds and copies the APK and `version.json` locally; upload both to the active download host separately, then verify the live metadata and APK hash. Its local success message is not proof that the public download was updated.

## Put the app on a phone (the easy way)

On the phone, open this in Chrome:

**https://loved-it.shop/download**

1. Tap **Download for Android** and wait for it to finish.
2. Tap the finished download. If the phone asks, turn on **Allow from this source**, then go back.
3. Tap **Install**. If Google Play Protect warns you, tap **More details**, then **Install anyway**. It warns because the app isn't from the Play Store.
4. Tap **Open** and sign in.

The page only opens while the website is running (see the next section). The app needs the website running too.

An older version gets replaced by the new one, so you don't lose your sign-in. If the phone says **App not installed**, uninstall the old Loved-IT first. That happens once, if it was built with a different key.

## Turn the website on

Open 6 terminals and run one line in each. Keep them all open, and don't let the PC sleep.

| # | Folder | Command |
|---|---|---|
| 1 | `C:\Projects\basta_velure\backend` | `php artisan serve` |
| 2 | `C:\Projects\basta_velure\backend` | `php artisan reverb:start` |
| 3 | `C:\Projects\basta_velure\backend` | `php artisan queue:work --tries=3` |
| 4 | `C:\Projects\basta_velure\backend` | `php artisan schedule:work` |
| 5 | `C:\Projects\basta_velure\frontend` | `npm run preview` |
| 6 | any | `cloudflared tunnel run loved-it` |

Check it worked: open https://loved-it.shop on your phone. If you changed anything in `frontend`, run `npm run build` before step 5.

## Release a new version of the app

After changing the app, this command builds a signed APK and prepares its download metadata locally. It takes about 5 minutes. You don't need Android Studio or the emulator for this. On the current Cloud setup, publishing requires uploading the prepared APK and `version.json` to the active download host as a separate step.

```
powershell -ExecutionPolicy Bypass -File C:\Projects\basta_velure\setup\publish-apk.ps1
```

After uploading both files, verify `https://loved-it.shop/download/version.json` and the APK's SHA-256 against the prepared files. Then install from https://loved-it.shop/download again.

## If the download page won't open

Copy the APK by USB instead:

1. Plug in the phone and unlock it. Swipe down, tap the **USB** notification, and choose **File transfer**.
2. On the PC, press **Windows + E** and paste this into the address bar:
   ```
   C:\Projects\basta_velure\mobile\build\app\outputs\flutter-apk
   ```
3. Right-click **app-release.apk** (not `app-debug`) and choose **Copy**.
4. In the left panel, click **This PC**, your phone, **Internal shared storage**, **Download**. Right-click an empty space and choose **Paste**.
5. On the phone, open **Files**, go to **Downloads**, and tap **app-release.apk**. Then follow steps 2 to 4 of the first section.

## Run it from the PC while developing

**On the emulator:**

```
flutter emulators --launch Pixel_8
cd C:\Projects\basta_velure\mobile
flutter run --dart-define-from-file=dart_defines/dev.json
```

**On a real phone with a cable:**

1. On the phone, go to **Settings > About phone** (or **My phone**) and tap **Build number** 7 times.
2. Go to **Settings > System > Developer options** and turn on **USB debugging**. Turn on **Install via USB** too if you see it.
3. Plug it in and tap **Allow**.
4. Uninstall the Loved-IT app already on the phone, because this version uses a different key.
5. Run:
   ```
   cd C:\Projects\basta_velure\mobile
   flutter run --dart-define-from-file=dart_defines/prod.json
   ```

`dev.json` only works on the emulator. `prod.json` talks to the live site, so the 6 terminals must be on. Both files are ignored by git, so a new PC has to make them from `dart_defines/example.json`.

Close the emulator when you're done, because it uses a lot of memory on the PC that runs the website.

## Keep these safe

These two files sign the app. **If you lose them, an installed app can't be updated.** Keep a private copy somewhere that isn't this PC, like your own Google Drive, and never commit them.

- `C:\Users\JM\.loved-it\loved-it-release.jks`
- `C:\Projects\basta_velure\mobile\android\key.properties`

Release SHA-1: `D9:F1:EE:6D:74:BC:54:12:8D:3D:73:17:94:FC:A0:C0:5B:B3:91:4A`

## Turn on Continue with Google in the app

Until this is done, the button says Google sign-in isn't set up. Email sign-in works either way.

In [Google Cloud](https://console.cloud.google.com/apis/credentials), open the same project as the website's sign-in, then **Create credentials > OAuth client ID > Android**. Do it twice, with package name `shop.lovedit.loved_it`:

| For | SHA-1 |
|---|---|
| The released app | `D9:F1:EE:6D:74:BC:54:12:8D:3D:73:17:94:FC:A0:C0:5B:B3:91:4A` |
| Running from JM's PC | `6D:12:90:DA:00:1C:64:27:F2:17:0A:2E:CB:E0:86:33:E3:2D:B4:A3` |

## If something goes wrong

| What you see | What to do |
|---|---|
| "Couldn't reach Loved-IT" | Open https://loved-it.shop in the phone's browser. If it won't load, a terminal has closed (most often `cloudflared`), or the PC went to sleep. |
| "App not installed" | Uninstall the older Loved-IT, then install again. |
| The phone opens the download like a ZIP, with folders such as `META-INF` | Go back and tap **Download for Android** again. If it still happens, run `npm run preview` again in `frontend`: the setting that labels the file as an app only loads when it starts. |
| Phone doesn't show up on the PC | Check that **File transfer** is on. If it still doesn't show, the cable may be charge-only, so try another. |
| Publishing says `key.properties` is missing | You're on a PC without the signing key. Build from JM's PC, or copy the two files above. |
| The build fails right after updating Android tools | Android command-line tools must stay at version 22 for now. See `mobile/README.md`. |
