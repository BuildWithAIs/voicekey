<a id="readme-top"></a>

[![Contributors][contributors-shield]][contributors-url]
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]

[English](./README_EN.md)

<br />
<div align="center">
  <a href="https://github.com/BuildWithAIs/voicekey">
    <img src="imgs/logo.png" alt="Logo" width="80" height="80">
  </a>

  <h3 align="center">Voice Key</h3>

  <p align="center">
    一款开源的桌面端语音输入产品
    <br />
    <br />
    <a href="https://github.com/BuildWithAIs/voicekey">查看演示</a>
    &middot;
    <a href="https://github.com/BuildWithAIs/voicekey/issues">报告 Bug</a>
    &middot;
    <a href="https://github.com/BuildWithAIs/voicekey/issues">请求功能</a>
  </p>
</div>

<p align="center">
  <img src="imgs/screenshot.png" alt="Voice Key Screenshot" width="100%">
</p>

<!-- TABLE OF CONTENTS -->
<details>
  <summary>目录</summary>
  <ol>
    <li>
      <a href="#about-the-project">主要功能</a>
      <ul>
        <li><a href="#built-with">技术栈</a></li>
      </ul>
    </li>
    <li>
      <a href="#getting-started">上手指南</a>
      <ul>
        <li><a href="#env-prerequisites">环境要求</a></li>
        <li><a href="#dev-installation">安装步骤</a></li>
      </ul>
    </li>
    <li><a href="#prerequisites">配置要求</a></li>
    <li><a href="#installation">macOS 安装指南</a></li>
    <li><a href="#license">开源协议</a></li>
    <li><a href="#roadmap">Star History</a></li>
  </ol>
</details>

## 主要功能 <a id="about-the-project"></a>

- **语音转写**: 支持 GLM / Groq ASR（二选一）实现高精度的语音转文字。

### 技术栈 <a id="built-with"></a>

本项目使用了以下主要框架和库：

- [![Electron][Electron.js]][Electron-url]
- [![React][React.js]][React-url]
- [![Vite][Vite.js]][Vite-url]
- [![TypeScript][TypeScript]][TypeScript-url]
- [![TailwindCSS][TailwindCSS]][TailwindCSS-url]
- [![shadcn/ui][shadcn/ui]][shadcn-url]
- [![Zustand][Zustand]][Zustand-url]

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## 上手指南 <a id="getting-started"></a>

按照以下步骤在本地搭建并运行项目。

### 环境要求 <a id="env-prerequisites"></a>

开发前请确保已安装 Node.js 和 npm。

- npm
  ```sh
  npm install npm@latest -g
  ```

### 安装步骤 <a id="dev-installation"></a>

1. 获取免费 API Key (详见 [配置要求](#prerequisites))
2. 克隆仓库
   ```sh
   git clone https://github.com/BuildWithAIs/voicekey.git
   ```
3. 安装依赖包
   ```sh
   npm install
   ```
4. 运行开发环境
   ```sh
   npm run dev
   ```
5. 在应用设置中填入你的 API Key

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## 配置要求 <a id="prerequisites"></a>

本应用依赖 **智谱 AI (GLM)** 的语音转写服务。使用前请务必配置 API Key。

1. **获取 API Key**: 访问智谱 AI 开放平台[中国版](https://bigmodel.cn/usercenter/proj-mgmt/apikeys) 或者 [国际版](https://z.ai/manage-apikey/apikey-list) 注册并获取 Key。
2. **配置**: 打开 Voice Key 设置页面，填入你的 API Key。

## macOS 安装指南 <a id="installation"></a>

由于应用未签名（我们还没有注册 Apple 开发者账户），安装后需执行以下步骤：

1. **解除安全限制**  
   若打开应用提示“文件已损坏”，请在终端运行以下命令：

   ```bash
   xattr -cr /Applications/Voice\ Key.app
   ```

   ![安全提示](imgs/macos-damaged-warning.png)

2. **授予辅助功能权限**  
   应用需要监听按键与模拟输入。请前往 **系统设置 > 隐私与安全性 > 辅助功能** 开启 **Voice Key**。
   ![权限请求](imgs/macos-accessibility-prompt.png)
   ![权限设置](imgs/macos-accessibility-settings.png)

## 开源协议 <a id="license"></a>

本项目采用 [Elastic License 2.0](LICENSE) 开源协议。

## Star History <a id="roadmap"></a>

[![Star History Chart](https://api.star-history.com/svg?repos=BuildWithAIs/voicekey&type=Date)](https://star-history.com/#BuildWithAIs/voicekey&Date)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

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
[license-shield]: https://img.shields.io/github/license/BuildWithAIs/voicekey.svg?style=for-the-badge
[license-url]: https://github.com/BuildWithAIs/voicekey/blob/master/LICENSE
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
