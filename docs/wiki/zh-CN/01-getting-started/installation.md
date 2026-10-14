# 安装与首次启动

本指南将详细介绍 **Omera** 的系统配置要求、支持平台、安装步骤以及首次启动欢迎配置向导。

---

## 1. 系统配置要求

Omera 采用由 **Tauri v2**、**Rust** 和 **SQLite WAL** 强力驱动的超高效原生底层架构。在基础办公硬件上能够轻盈流畅运行，同时可充分榨干多核工作站与高速 NVMe 固态硬盘的性能，轻松驾驭 5 万至 50 万+ 规模的大型本地图库。

### 最低硬件要求
- **处理器 (CPU)**：双核 x86_64 或 ARM64 处理器（Intel Core i3 / AMD Ryzen 3 / Apple M1 或更新型号）。
- **内存 (RAM)**：4 GB 内存（推荐 8 GB 以上，以便流畅运行本地 CLIP/WD14 ONNX 深度学习模型）。
- **存储空间**：约 150 MB 用于安装应用程序；另需预留磁盘空间用于存储缩略图（默认提供 2 GB 可调配的 LRU 缓存预算）及原始媒体文件。
- **显示分辨率**：最低 1280 × 800 视口（最小可响应式自适应缩减至 960 × 640）。

### 支持的操作系统
| 操作系统 | 支持版本 | 架构 | 安装包类型 |
| :--- | :--- | :--- | :--- |
| **Windows** | Windows 10 (1809+) 与 Windows 11 | `x86_64` (64 位) | 标准安装包 (`.exe`)、免安装便携版 (`.zip`) |
| **macOS** | macOS 12 (Monterey) 或更高版本 | `aarch64` (Apple Silicon M1/M2/M3/M4) 与 `x86_64` (Intel) | 磁盘映像 (`.dmg`)、通用二进制 (Universal Binary) |
| **Linux** | Ubuntu 20.04+、Debian 11+、Fedora 36+、Arch Linux | `x86_64` | AppImage 独立包 (`.AppImage`)、Debian 软件包 (`.deb`) |

---

## 2. 安装步骤指南

你可以从官方 [GitHub Releases 页面](https://github.com/BerryUIKI/Omera/releases) 或 [官方网站](https://berryuiki.github.io/Omera/) 下载正式版安装程序。

### Windows 系统
安装需要兼容的 Microsoft Visual C++ x64 系统运行库。若安装程序提示缺少运行库，
请打开 [Microsoft 官方下载页面](https://learn.microsoft.com/cpp/windows/latest-supported-vc-redist)，
安装或修复最新的 **x64** 可再发行组件（可能需要管理员批准），然后返回 EXE 安装程序点击“下一步”。
使用 MSI 时，请在运行库安装完成后重新运行安装程序。静默或被动安装会在缺少运行库时停止；
Omera 不捆绑运行库 DLL，也不会自动安装可再发行组件。

1. **标准安装包 (`Omera_Windows_x64.exe`)**：
   - 双击运行安装程序可执行文件。
   - 按照安装向导提示选择安装目录，并自动生成桌面和开始菜单快捷方式。
   - 安装程序会自动注册必要的文件关联协议与桌面集成。
2. **免安装便携包 (`Omera_Windows_x64.zip`)**：
   - 将 `.zip` 压缩包直接解压至指定磁盘（如高速移动固态硬盘或扩展盘）。
   - 无需管理员权限，直接双击运行 `omera.exe` 即可启动。

### macOS 系统
1. 根据你的 Mac 芯片架构下载对应磁盘映像：
   - Apple Silicon 芯片 (M1/M2/M3/M4)：`Omera_macOS_aarch64.dmg`
   - Intel Core 处理器：`Omera_macOS_x64.dmg`
2. 双击打开 `.dmg` 挂载文件，将 **Omera** 拖动至 `/Applications`（应用程序）文件夹。
3. 官方安装包已通过 Apple Gatekeeper 签名公证。初次启动时，从访达“应用程序”或聚焦搜索（Spotlight）启动即可。

### Linux 系统
1. **AppImage 绿色运行包 (`Omera_Linux_x64.AppImage`)**：
   - 赋予可执行权限后直接启动：
     ```bash
     chmod +x Omera_Linux_x64.AppImage
     ./Omera_Linux_x64.AppImage
     ```
2. **Debian / Ubuntu 软件包 (`Omera_Linux_x64.deb`)**：
   - 使用 `dpkg` 或 `apt` 完成安装：
     ```bash
     sudo dpkg -i Omera_Linux_x64.deb
     sudo apt-get install -f # 自动补全可能缺失的 webkit2gtk 系统依赖
     ```

---

## 3. 首次 Omera 设置与旧版导入

首次启动 Omera 时，请选择应用语言和数据库目录。即使已在 Berry 中完成欢迎向导，也会显示此设置。数据库默认位于 Omera 应用数据目录；自定义目录仅改变数据库位置，配置、模型、缓存及原始媒体保留各自的位置。

1. 检查发现的 Berry 来源。打开导入方案，核对来源、目标、所需空间、可用容量和警告。导入前关闭旧版应用；无法确认容量时，请先解决该问题。
2. 导入经过验证的快照，不覆盖当前媒体库。重启 Omera 后激活快照。原数据库和媒体保持不变。
3. 验证激活后，可选清理会列出准确的旧版应用文件。另行选择并确认要清理的项目。文件发生变化时必须重新审核；用户媒体、外部库和共享目录不属于自动应用数据清理范围。也可以保留全部旧数据。
4. 继续可选的本地 AI 输出探测和流水线设置，或跳过。完成设置后保存数据库目录。已有 Omera 媒体库先从 SQLite 加载，再执行可选文件系统同步。

导入失败后，重试前必须重新审核方案。已有非空媒体库会保留；方案要求时请选择独立目标目录。

也可在设置中更改数据库目录。Omera 验证数据库副本后才保存选择；重启后使用所选媒体库。即使数据库存放在其他位置，下述应用数据目录仍用于设置等应用文件。

---

## 4. 应用程序存储与本地数据目录

Omera 将所有的媒体元数据索引、缩略图缓存以及偏好配置文件均安全妥善地保存在当前操作系统的用户数据目录中：

- **Windows**：`%APPDATA%\com.berryuiki.omera\`（例如：`C:\Users\<User>\AppData\Roaming\com.berryuiki.omera\`）
- **macOS**：`~/Library/Application Support/com.berryuiki.omera/`
- **Linux**：`~/.config/com.berryuiki.omera/`

### 目录核心结构剖析：
- `omera.db`：核心 SQLite 数据库，保存所有图像元数据、评分、标签、相册索引及堆叠关联关系。
- `omera.db-wal` 与 `omera.db-shm`：SQLite 预写日志与共享内存缓存文件。
- `config.json`：软件偏好配置（界面主题、默认视图、缩略图规格、生图工具 API 地址等）。
- `thumbnails/`：超高性能 WebP 缩略图本地缓存，文件命名规则为 `{file_id}_{mtime}_{edge}.webp`。
- `models/`：本地 ONNX AI 模型权重目录（存放 CLIP、SigLIP 文本向量模型以及 WD14 Danbooru 自动打标模型）。

> [!TIP]
> 你可以随时在**首选项设置 > 关于与存储**面板中，点击专用的“打开所在目录”按钮，直接一键唤起文件管理器访问上述路径。
