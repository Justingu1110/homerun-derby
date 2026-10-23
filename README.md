# 全壘打大賽 homerun-derby

在手機瀏覽器上玩的全壘打大賽：只靠揮棒時機，在 10 個出局前打出越多、越難的全壘打越好。全壘打會播放實況野球風的 3D 演出。

線上版：<https://justingu1110.github.io/homerun-derby/>

- 用語：[`GLOSSARY.md`](GLOSSARY.md)
- 決定紀錄：[`docs/adr/`](docs/adr/)

## 本機開發

需要 Node.js 22（見 `.nvmrc`）。

```sh
npm install        # 安裝套件
npm run dev        # 啟動開發伺服器，開 http://localhost:5173/homerun-derby/
```

手機要連同一個 Wi-Fi 測試時用 `npm run dev -- --host`，再用終端機印出的區網網址打開。

| 指令 | 用途 |
| --- | --- |
| `npm test` | 用 Vitest 跑一次全部測試 |
| `npm run test:watch` | 改檔案時自動重跑測試 |
| `npm run typecheck` | TypeScript 型別檢查（含「比賽核心不能用 DOM」的檢查） |
| `npm run build` | 打包到 `dist/` |
| `npm run preview` | 在本機預覽打包後的網站 |

## 程式結構

- `src/core/`：**比賽核心**。純 TypeScript 的遊戲規則，不能 import three.js、畫面層或使用 DOM（`npm run typecheck` 與 `src/architecture.test.ts` 會擋）。測試寫在這裡。
- `src/render/`：**畫面層**。three.js 場景、鏡頭、之後的角色與全壘打演出，只演出比賽核心的結果。
- `src/main.ts`：把兩層接起來的進入點。

## 部署

推到 `main` 後，GitHub Actions（`.github/workflows/deploy.yml`）會先跑型別檢查、測試與打包，全部通過才部署到 GitHub Pages；任何一步失敗就不部署。Pull request 只跑檢查，不部署。

第一次使用前，要在 GitHub repo 的 **Settings → Pages → Build and deployment → Source** 選 **GitHub Actions**。
