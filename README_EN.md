<a id="readme-top"></a>

[![Contributors][contributors-shield]][contributors-url]
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]

<br />
<div align="center">
  <a href="https://github.com/BuildWithAIs/voicekey">
    <img src="imgs/logo.png" alt="Logo" width="80" height="80">
  </a>

  <h3 align="center">Voice Key</h3>

  <p align="center">
    An open-source desktop voice input product
    <br />
    <br />
    <a href="https://github.com/BuildWithAIs/voicekey">View Demo</a>
    &middot;
    <a href="https://github.com/BuildWithAIs/voicekey/issues">Report Bug</a>
    &middot;
    <a href="https://github.com/BuildWithAIs/voicekey/issues">Request Feature</a>
  </p>
</div>

<p align="center">
  <img src="imgs/screenshot.png" alt="Voice Key Screenshot" width="100%">
</p>

<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">Features</a>
      <ul>
        <li><a href="#built-with">Built With</a></li>
      </ul>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#env-prerequisites">Prerequisites</a></li>
        <li><a href="#dev-installation">Installation</a></li>
      </ul>
    </li>
    <li><a href="#prerequisites">Configuration Requirements</a></li>
    <li><a href="#installation">macOS Installation Guide</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#roadmap">Star History</a></li>
  </ol>
</details>

## Features <a id="about-the-project"></a>

- **Local Voice Transcription**: Uses SenseVoiceSmall int8 for offline, on-device recognition without uploading audio.

### Built With <a id="built-with"></a>

This section lists the major frameworks and libraries used to bootstrap this project.

- [![Electron][Electron.js]][Electron-url]
- [![React][React.js]][React-url]
- [![Vite][Vite.js]][Vite-url]
- [![TypeScript][TypeScript]][TypeScript-url]
- [![TailwindCSS][TailwindCSS]][TailwindCSS-url]
- [![shadcn/ui][shadcn/ui]][shadcn-url]
- [![Zustand][Zustand]][Zustand-url]

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Getting Started <a id="getting-started"></a>

Follow these simple steps to get a local copy up and running.

### Prerequisites <a id="env-prerequisites"></a>

Ensure you have Node.js and npm installed.

- npm
  ```sh
  npm install npm@latest -g
  ```

### Installation <a id="dev-installation"></a>

1. Clone the repo
   ```sh
   git clone https://github.com/BuildWithAIs/voicekey.git
   ```
2. Install NPM packages
   ```sh
   npm install
   ```
3. Run locally
   ```sh
   npm run dev
   ```
4. Download the local speech-recognition model from Settings

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Configuration Requirements <a id="prerequisites"></a>

Speech recognition uses only the local **SenseVoiceSmall int8** model and does not require an ASR API key. Before first use, download the roughly 240 MB model from Settings; recording and transcription then run on the device.

## macOS Installation Guide <a id="installation"></a>

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

## License <a id="license"></a>

This project is licensed under the [Elastic License 2.0](LICENSE).

## Star History <a id="roadmap"></a>

[![Star History Chart](https://api.star-history.com/svg?repos=BuildWithAIs/voicekey&type=Date)](https://star-history.com/#BuildWithAIs/voicekey&Date)

<!-- MARKDOWN LINKS & IMAGES -->
<!-- https://www.markdownguide.org/basic-syntax/#reference-style-links -->

[contributors-shield]: https://img.shields.io/github/contributors/BuildWithAIs/voicekey.svg?style=for-the-badge
[contributors-url]: https://github.com/BuildWithAIs/voicekey/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/BuildWithAIs/voicekey.svg?style=for-the-badge
[forks-url]: https://github.com/BuildWithAIs/voicekey/network/members
[stars-shield]: https://img.shields.io/github/stars/BuildWithAIs/voicekey.svg?style=for-the-badge
[stars-url]: https://github.com/BuildWithAIs/voicekey/stargazers
[issues-shield]: https://img.shields.io/github/issues/BuildWithAIs/voicekey.svg?style=for-the-badge
[issues-url]: https://github.com/BuildWithAIs/voicekey/issues
[Electron.js]: https://img.shields.io/badge/Electron-191970?style=for-the-badge&logo=Electron&logoColor=white
[Electron-url]: https://www.electronjs.org/
[React.js]: https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB
[React-url]: https://reactjs.org/
[Vite.js]: https://img.shields.io/badge/vite-%23646CFF.svg?style=for-the-badge&logo=vite&logoColor=white
[Vite-url]: https://vitejs.dev/
[TypeScript]: https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white
[TypeScript-url]: https://www.typescriptlang.org/
[TailwindCSS]: https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=for-the-badge&logo=tailwind-css&logoColor=white
[TailwindCSS-url]: https://tailwindcss.com/
[shadcn/ui]: https://img.shields.io/badge/shadcn%2Fui-000000?style=for-the-badge&logo=shadcnui&logoColor=white
[shadcn-url]: https://ui.shadcn.com/
[Zustand]: https://img.shields.io/badge/zustand-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB
[Zustand-url]: https://github.com/pmndrs/zustand
