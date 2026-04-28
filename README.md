# IndiePing 海巡小精靈

輸入你的部落格網址，系統定期掃描獨立部落格名單（透過 RSS），當有人 link 了你，寄 email 通知你。

不需要對方或自己改任何 code。

---

## 快速開始

```bash
# 安裝相依套件
npm install
npm install --prefix frontend

# 設定環境變數
cp .env.example .env
# 編輯 .env

# 啟動開發伺服器
npm run dev:all

# 匯入部落格名單
tsx scripts/import.ts data/your-blogs.json
```

詳細說明見 [設計文件](indieping-設計文件.md)。

## 授權

[AGPL-3.0](LICENSE)
