export const documents = [
  {
    path: 'guide',
    lang: 'en' as const,
    title: 'Get started with Voice Key',
    description:
      'Install Voice Key on Windows, macOS or Linux, download a local speech model, and set up microphone access and voice input.',
    sections: [
      [
        '1. Install the desktop app',
        'Download the latest release from the official GitHub repository. Choose the Windows x64 installer, the macOS disk image for Intel or Apple silicon, or a Linux x86_64 package. Current builds are unsigned, so Windows SmartScreen or macOS Gatekeeper may show a warning. Verify the source before opening the app.',
      ],
      [
        '2. Set up permissions and a microphone',
        'In Settings, choose your microphone. On macOS, allow both Microphone and Accessibility access in System Settings → Privacy & Security. Accessibility permission enables global shortcuts and text insertion.',
      ],
      [
        '3. Download one recognition model',
        'Classic mode uses SenseVoice (about 240 MB) and transcribes after recording. It recognizes Mandarin, English, Cantonese, Japanese and Korean. Streaming mode uses X-ASR (about 586 MB) and shows Chinese and English partial text in the HUD. Models are downloaded on demand and stored in your local application data directory. Only one mode is active at a time.',
      ],
      [
        '4. Try your first dictation',
        'Focus a text field in your usual app. Hold the configured shortcut while speaking, then release to finish and insert the text. Defaults are Control+Shift+Space on Windows and Linux, and Option on macOS. Change the shortcut in Settings. Sessions can run for up to five minutes.',
      ],
      [
        '5. Choose whether to use AI',
        'Basic local recognition needs no ASR API key. For optional refinement or translation, configure your preferred supported provider and credentials. These features send text to that provider and may incur provider charges. Leave both disabled for offline dictation after model setup.',
      ],
      [
        'Windows installation',
        'Use the .exe installer for x64 Windows. If SmartScreen appears, first verify that the installer came from the official release page. The application is currently unsigned.',
      ],
      [
        'macOS installation',
        'Select the .dmg matching your Mac architecture and move Voice Key to Applications. If Gatekeeper blocks the unsigned app, consult the macOS installation instructions in the repository. Enable Microphone and Accessibility permissions before trying voice input.',
      ],
      [
        'Linux and Omarchy',
        'For Linux X11, use the x86_64 AppImage; make it executable before launching. Some distributions require FUSE 2. For Arch or Omarchy, use the pacman package. In Omarchy / Hyprland, open Settings → Linux & Omarchy Integration and install the managed integration. Other Wayland compositors do not yet have complete shortcut press/release support.',
      ],
      [
        'Need help?',
        'Report reproducible issues through GitHub Issues. Include your operating system and recognition mode, but do not share credentials, private transcripts or raw recordings.',
      ],
    ],
  },
  {
    path: 'guide',
    lang: 'zh' as const,
    title: '开始使用 Voice Key',
    description:
      '了解如何在 Windows、macOS 和 Linux 安装 Voice Key，下载本地识别模型，配置麦克风与权限，开始语音输入。',
    sections: [
      [
        '1. 安装桌面应用',
        '从官方 GitHub Releases 下载最新版本，选择 Windows x64 安装程序、适合 Intel 或 Apple 芯片的 macOS 磁盘映像，或 Linux x86_64 安装包。当前版本尚未签名，Windows SmartScreen 或 macOS Gatekeeper 可能提示，请先确认安装包来源。',
      ],
      [
        '2. 设置麦克风与权限',
        '在设置中选择麦克风。macOS 用户还需要在「系统设置 → 隐私与安全性」中授予麦克风和辅助功能权限，后者用于监听快捷键和向其他应用输入文字。',
      ],
      [
        '3. 下载一种识别模型',
        '经典模式使用 SenseVoice，约需下载 240 MB，在录音结束后输出文字，支持普通话、英语、粤语、日语和韩语。流式模式使用 X-ASR，约需下载 586 MB，在悬浮窗口中显示中英文识别中的文字。模型按需下载，保存在本机应用数据目录，两种模式不能同时运行。',
      ],
      [
        '4. 尝试第一次输入',
        '在常用应用中选中文本框，按住配置的快捷键说话，松开后结束识别并输入文字。Windows 和 Linux 的默认快捷键是 Control+Shift+Space，macOS 是 Option，可在设置中修改。单次录音最长五分钟。',
      ],
      [
        '5. 决定是否使用 AI',
        '基础本地识别不需要 ASR API Key。如需润色或翻译，可配置受支持的模型服务及凭据。相关文本会发送给该服务商，并可能产生第三方费用。下载模型后，关闭这两个功能即可离线完成基础语音输入。',
      ],
      [
        'Windows 安装说明',
        '下载适用于 x64 Windows 的 .exe 安装程序。如果 SmartScreen 提示，请先确认安装程序来自官方发布页面。当前版本尚未签名。',
      ],
      [
        'macOS 安装说明',
        '下载与 Mac 芯片架构匹配的 .dmg，将 Voice Key 移入「应用程序」。如果 Gatekeeper 阻止运行未签名应用，请查阅仓库中的 macOS 安装说明。使用前需开启麦克风和辅助功能权限。',
      ],
      [
        'Linux 与 Omarchy',
        'Linux X11 用户可以使用 x86_64 AppImage，启动前需赋予可执行权限，部分发行版需要安装 FUSE 2。Arch 或 Omarchy 用户可以选择 pacman 安装包。Omarchy / Hyprland 用户需在「设置 → Linux & Omarchy Integration」中安装集成。其他 Wayland 合成器暂不完整支持快捷键按下与释放流程。',
      ],
      [
        '需要帮助？',
        '通过 GitHub Issues 反馈可复现的问题，并附上操作系统和识别模式。请勿附带凭据、私人转录文本或原始录音。',
      ],
    ],
  },
  {
    path: 'privacy',
    lang: 'en' as const,
    title: 'Privacy & data flow',
    description:
      'Understand how Voice Key processes audio locally, stores history, and sends text only for optional cloud refinement and translation.',
    sections: [
      [
        'Local speech recognition',
        'Voice Key processes microphone audio on your device using downloaded models. Local recognition does not upload microphone audio to an ASR provider. Classic and Streaming modes both run locally.',
      ],
      [
        'Optional cloud text processing',
        'When you enable refinement or translation, the relevant transcript or selected text is sent to your configured LLM provider. Dictionary terms may accompany these requests as spelling references. The provider’s own data policies and fees apply. These features do not send raw microphone audio.',
      ],
      [
        'History and model files',
        'Transcript history and downloaded models remain in the application’s local user-data directory. History remains until you delete it. You can search, copy and delete records in the app. Local storage does not imply encrypted storage or protection from other users with access to your device.',
      ],
      [
        'Other network connections',
        'Local-first does not mean the app never connects to the internet. Model downloads, update checks, optional glossary retrieval and configured cloud services use the network. Before a Streaming model download, the app obtains a country code to choose a download source; it does not store or log the public IP address.',
      ],
      [
        'Using dictation offline',
        'Download the recognition model in advance and disable cloud refinement and translation. The core recognition and text-insertion workflow can then operate without an internet connection.',
      ],
      [
        'Open to inspection',
        'Voice Key is MIT licensed. The source repository documents the recognition pipeline and provider integrations. Review the code and report privacy concerns through the project’s GitHub issues without posting personal data or credentials.',
      ],
    ],
  },
  {
    path: 'privacy',
    lang: 'zh' as const,
    title: '隐私与数据流',
    description:
      '了解 Voice Key 如何在本机识别音频、保存历史，以及可选的云端润色和翻译会发送哪些文本。',
    sections: [
      [
        '语音识别在本机完成',
        'Voice Key 使用下载到本机的模型处理麦克风音频。本地识别不会将麦克风音频上传给 ASR 服务商。经典模式和流式模式都在本地运行。',
      ],
      [
        '可选的云端文本处理',
        '开启润色或翻译后，相关转录文字或选中文本会发送给你配置的大模型服务商。词典词条可能作为拼写参考一起发送。这些请求适用服务商的数据政策和收费规则，不发送原始麦克风音频。',
      ],
      [
        '历史记录与模型文件',
        '转录历史和下载的模型保存在本机应用数据目录。历史记录会一直保留，直到你主动删除。你可以在应用中搜索、复制和删除记录。本地存储不等于加密存储，也不能阻止有设备访问权限的人查看数据。',
      ],
      [
        '其他网络连接',
        '本地优先并不代表应用永不联网。模型下载、更新检查、可选的术语表获取，以及你配置的云端服务会使用网络。下载流式模型前，应用会获取国家代码以选择下载来源，不会存储或记录公网 IP 地址。',
      ],
      [
        '如何离线使用',
        '提前下载识别模型，关闭云端润色和翻译。之后，基础语音识别与文字输入流程无需联网即可运行。',
      ],
      [
        '公开、可查阅',
        'Voice Key 采用 MIT 开源协议。源码仓库包含识别流程和服务商集成说明。你可以查阅代码，通过项目 GitHub Issues 反馈隐私问题，请不要公开个人数据或凭据。',
      ],
    ],
  },
]
