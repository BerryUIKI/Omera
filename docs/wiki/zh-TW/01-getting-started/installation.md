# 安裝與首次啟動

本指南詳細說明 **Omera** 的系統需求、支援平台、安裝步驟以及首次啟動歡迎設定精靈流程。

---

## 1. 系統需求

Omera 採用基於 **Tauri v2**、**Rust** 與 **SQLite WAL** 的極致效能原生架構。它在一般規格硬體上即可流暢運作，同時能充分發揮多核心工作站與 NVMe 儲存裝置的極致潛力，輕鬆駕馭超大圖庫（50,000 至 500,000+ 檔案）。

### 最低硬體需求
- **CPU**：雙核心 x86_64 或 ARM64 處理器（Intel Core i3 / AMD Ryzen 3 / Apple M1 或更佳）。
- **RAM**：4 GB 記憶體（若需執行本機 CLIP/WD14 ONNX 模型，建議 8 GB 以上）。
- **硬碟空間**：約 150 MB 應用程式安裝空間；另需保留縮圖快取空間（預設 2 GB LRU 快取配額，可自訂）與媒體儲存空間。
- **螢幕解析度**：最低 1280 × 800 視窗解析度（具備彈性自適應版面，最低支援至 960 × 640）。

### 支援的作業系統
| 作業系統 | 支援版本 | 架構 | 安裝套件類型 |
| :--- | :--- | :--- | :--- |
| **Windows** | Windows 10 (1809+) 與 Windows 11 | `x86_64` (64-bit) | 標準安裝程式 (`.exe`)、免安裝可攜版 (`.zip`) |
| **macOS** | macOS 12 (Monterey) 或更新版本 | `aarch64` (Apple Silicon M1/M2/M3/M4) 與 `x86_64` (Intel) | 磁碟映像檔 (`.dmg`)、通用二進位檔 (Universal) |
| **Linux** | Ubuntu 20.04+、Debian 11+、Fedora 36+、Arch Linux | `x86_64` | AppImage (`.AppImage`)、Debian 套件 (`.deb`) |

---

## 2. 安裝步驟

請從 [GitHub Releases 發布頁面](https://github.com/BerryUIKI/Omera/releases) 或 [官方網站](https://berryuiki.github.io/Omera/) 下載官方正式組建安裝包。

### Windows
安裝需要相容的 Microsoft Visual C++ x64 系統執行階段。若安裝程式提示缺少執行階段，
請開啟 [Microsoft 官方下載頁面](https://learn.microsoft.com/cpp/windows/latest-supported-vc-redist)，
安裝或修復最新的 **x64** 可轉散發套件（可能需要系統管理員核准），再返回 EXE 安裝程式按「下一步」。
使用 MSI 時，請在執行階段安裝完成後重新執行安裝程式。無訊息或被動安裝會在缺少執行階段時停止；
Omera 不包含執行階段 DLL，也不會自動安裝可轉散發套件。

1. **標準安裝程式 (`Omera_Windows_x64.exe`)**：
   - 按兩下安裝執行檔。
   - 依照安裝精靈指示選擇安裝位置，並建立桌面與開始功能表捷徑。
   - 安裝程式會自動配置捷徑並註冊通訊協定處理程式。
2. **免安裝可攜版 ZIP (`Omera_Windows_x64.zip`)**：
   - 將 `.zip` 壓縮檔解壓縮至偏好的磁碟路徑（例如外接高速 NVMe SSD 或隨身硬碟）。
   - 直接執行 `omera.exe`，無需管理者權限。

### macOS
1. 下載對應您處理器架構的磁碟映像檔：
   - Apple Silicon (M1/M2/M3/M4)：`Omera_macOS_aarch64.dmg`
   - Intel Core：`Omera_macOS_x64.dmg`
2. 開啟 `.dmg` 檔案，將 **Omera** 拖曳至 `/Applications` 應用程式資料夾中。
3. 軟體套件已通過 Apple Gatekeeper 簽章與公證。首次啟動時，直接從「應用程式」或「Spotlight」開啟即可。

### Linux
1. **AppImage (`Omera_Linux_x64.AppImage`)**：
   - 賦予二進位執行檔可執行權限：
     ```bash
     chmod +x Omera_Linux_x64.AppImage
     ./Omera_Linux_x64.AppImage
     ```
2. **Debian / Ubuntu (`Omera_Linux_x64.deb`)**：
   - 透過 `dpkg` 或 `apt` 進行安裝：
     ```bash
     sudo dpkg -i Omera_Linux_x64.deb
     sudo apt-get install -f # 自動解析並安裝可能缺失的 webkit2gtk 相依套件
     ```

---

## 3. 首次 Omera 設定與舊版匯入

首次啟動 Omera 時，請選擇應用程式語言和資料庫目錄。即使已在 Berry 完成歡迎精靈，也會顯示此設定。資料庫預設位於 Omera 應用資料目錄；自訂目錄僅改變資料庫位置，設定、模型、快取及原始媒體保留各自的位置。

1. 檢查找到的 Berry 來源。開啟匯入方案，核對來源、目的地、所需空間、可用容量和警告。匯入前關閉舊版應用；無法確認容量時，請先解決該問題。
2. 匯入經過驗證的快照，不覆寫目前媒體庫。重新啟動 Omera 後啟用快照。原資料庫和媒體保持不變。
3. 驗證啟用後，可選清理會列出準確的舊版應用檔案。另行選擇並確認要清理的項目。檔案變更時必須重新審核；使用者媒體、外部媒體庫和共用目錄不屬於自動應用資料清理範圍。也可保留全部舊資料。
4. 繼續可選的本機 AI 輸出偵測和流水線設定，或略過。完成設定後儲存資料庫目錄。既有 Omera 媒體庫先從 SQLite 載入，再執行可選檔案系統同步。

匯入失敗後，重試前必須重新審核方案。既有非空媒體庫會保留；方案要求時請選擇獨立目的地。

也可在設定中變更資料庫目錄。Omera 驗證資料庫副本後才儲存選擇；重新啟動後使用所選媒體庫。即使資料庫存放在其他位置，下述應用資料目錄仍用於設定等應用檔案。

---

## 4. 應用程式儲存與資料目錄

Omera 會將所有圖庫索引、快取與設定檔案儲存在使用者個人設定檔路徑中：

- **Windows**：`%APPDATA%\com.berryuiki.omera\`（例如 `C:\Users\<User>\AppData\Roaming\com.berryuiki.omera\`）
- **macOS**：`~/Library/Application Support/com.berryuiki.omera/`
- **Linux**：`~/.config/com.berryuiki.omera/`

### 目錄結構與內容：
- `omera.db`：核心 SQLite 資料庫，儲存所有圖片元數據、評分、標籤、相簿與堆疊關聯。
- `omera.db-wal` 與 `omera.db-shm`：SQLite WAL 預寫日誌與共享記憶體暫存檔案。
- `config.json`：軟體偏好設定（主題、畫廊檢視模式、縮圖規格、生圖工具 API 端點等）。
- `thumbnails/`：高效 WebP 縮圖快取目錄，檔案格式為 `{file_id}_{mtime}_{edge}.webp`。
- `models/`：本機 ONNX AI 模型權重存放目錄，用於 CLIP、SigLIP 語意搜尋與 WD14 Danbooru 自動標籤。

> [!TIP]
> 您可以隨時在 **偏好設定 > 資料儲存與關於** 中，點擊專屬的「打開所在目錄」按鈕，快速開啟上述系統資料夾。
