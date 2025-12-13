# Apple Developer Setup for Code Signing

This guide covers setting up macOS code signing and notarization for Dynomite releases.

## Why Code Signing?

Without code signing, macOS shows "app is damaged" or Gatekeeper warnings when users download the app. Proper signing and notarization allows the app to run without issues.

## Prerequisites

- Apple Developer Program membership ($99/year)
- macOS with Keychain Access

## Step 1: Enroll in Apple Developer Program

1. Go to https://developer.apple.com/programs/
2. Click "Enroll"
3. Sign in with your Apple ID
4. Complete enrollment ($99/year)

## Step 2: Create Developer ID Application Certificate

1. Go to https://developer.apple.com/account/resources/certificates
2. Click the "+" button to create a new certificate
3. Select **"Developer ID Application"** (for distributing outside the App Store)
4. Follow the Certificate Signing Request (CSR) process:
   - Open **Keychain Access** on your Mac
   - Menu: Keychain Access → Certificate Assistant → **Request a Certificate From a Certificate Authority**
   - Enter your email and select "Saved to disk"
   - Upload the CSR file to Apple's portal
5. Download the certificate and double-click to install it in Keychain

## Step 3: Export Certificate as .p12 File

1. Open **Keychain Access**
2. Go to "My Certificates" in the sidebar
3. Find your **"Developer ID Application: [Your Name]"** certificate
4. Right-click → **Export**
5. Choose .p12 format
6. Set a strong password (you'll need this for GitHub secrets)
7. Save the file

### Base64 Encode the Certificate

```bash
base64 -i ~/path/to/Certificates.p12 -o ~/cert-base64.txt
```

The contents of `cert-base64.txt` will be used as a GitHub secret.

## Step 4: Create App-Specific Password for Notarization

Apple requires notarization for apps distributed outside the App Store. This uses an app-specific password.

1. Go to https://appleid.apple.com/account/manage
2. Sign in with your Apple ID
3. Under "Sign-In and Security", find **App-Specific Passwords**
4. Click "Generate an app-specific password"
5. Name it something like "Dynomite Notarization"
6. Copy the generated password (you won't see it again)

## Step 5: Find Your Team ID

1. Go to https://developer.apple.com/account
2. Look under **Membership Details**
3. Your **Team ID** is a 10-character alphanumeric string

## Step 6: Add GitHub Repository Secrets

Go to your repository: **Settings → Secrets and variables → Actions**

Add these secrets:

| Secret Name | Value |
|-------------|-------|
| `CSC_LINK` | Contents of `cert-base64.txt` (the base64-encoded .p12) |
| `CSC_KEY_PASSWORD` | The password you set when exporting the .p12 |
| `APPLE_ID` | Your Apple ID email address |
| `APPLE_APP_SPECIFIC_PASSWORD` | The app-specific password from Step 4 |
| `APPLE_TEAM_ID` | Your 10-character Team ID from Step 5 |

## Step 7: Update GitHub Workflow

Once secrets are configured, update `.github/workflows/release-please.yml` to enable signing and notarization:

```yaml
- name: Build and Publish
  run: npm run build && npx electron-builder --mac --publish always
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    CSC_LINK: ${{ secrets.CSC_LINK }}
    CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
    APPLE_ID: ${{ secrets.APPLE_ID }}
    APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
    APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
```

Remove the `CSC_IDENTITY_AUTO_DISCOVERY: false` line (that was disabling signing).

## Verification

After a release build:
1. Download the DMG from GitHub releases
2. Mount and drag app to Applications
3. The app should open without Gatekeeper warnings
4. Verify signing: `codesign -dv --verbose=4 /Applications/Dynomite.app`
5. Verify notarization: `spctl -a -v /Applications/Dynomite.app`

## Troubleshooting

### "App is damaged" error
- Run `xattr -cr /Applications/Dynomite.app` to remove quarantine (workaround)
- Check that all secrets are correctly configured

### Notarization fails
- Ensure app-specific password is correct
- Check Apple ID has 2FA enabled (required for app-specific passwords)
- Review notarization logs in the GitHub Actions output

### Certificate not found
- Verify CSC_LINK contains valid base64 data
- Check CSC_KEY_PASSWORD matches the export password

## Resources

- [Apple Developer Program](https://developer.apple.com/programs/)
- [electron-builder Code Signing docs](https://www.electron.build/code-signing)
- [Apple Notarization docs](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
