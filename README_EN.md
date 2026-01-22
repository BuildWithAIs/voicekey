# Voice Key

Voice Key is an open-source desktop voice input product.

## Features

- **Voice Transcription**: Integrates GLM ASR (Zhipu AI) for high-precision speech-to-text.

## Configuration Requirements

This application depends on the **Zhipu AI (GLM)** speech transcription service. You must configure an API Key before use.

1. **Get API Key**: Visit the Zhipu AI Open Platform ([China](https://bigmodel.cn/usercenter/proj-mgmt/apikeys) or [International](https://z.ai/manage-apikey/apikey-list)) to register and obtain a Key.
2. **Configure**: Open the Voice Key settings page and enter your API Key.

## macOS Installation Guide

Since the application is unsigned (we have not yet registered an Apple Developer account), you need to perform the following steps after installation:

1. **Remove Security Restrictions**  
   If you receive a "File is damaged" message when opening the app, run the following command in the Terminal:

   ```bash
   xattr -cr /Applications/Voice\ Key.app
   ```

   ![Security Warning](imgs/macos-damaged-warning.png)

2. **Grant Accessibility Permissions**  
   The application needs to listen for keystrokes and simulate input. Please go to **System Settings > Privacy & Security > Accessibility** and enable **Voice Key**.
   ![Permission Request](imgs/macos-accessibility-prompt.png)
   ![Permission Settings](imgs/macos-accessibility-settings.png)

## License

This project is licensed under the [Elastic License 2.0](LICENSE).
