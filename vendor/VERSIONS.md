# Vendor 依赖清单

本目录只存放随项目分发的第三方运行时文件。升级文件时必须同步更新本页的版本、哈希与 `app.js` 中的 SRI。

## html2canvas 1.4.1

| 项 | 值 |
|---|---|
| 文件 | `vendor/html2canvas.min.js` |
| 版本 | 1.4.1 |
| 大小 | 198,689 B |
| SHA-256 | `E87E550794322E574A1FDA0C1549A3C70DAE5A93D9113417A429016838EAB8CB` |
| SHA-384（SRI） | `sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H` |
| 许可证 | MIT |
| 来源 | <https://html2canvas.hertzen.com> / <https://github.com/niklasvh/html2canvas> |
| 用途 | 「保存完整长图」与「下载分享卡片」；由 `app.js` 的 `loadHtml2Canvas()` 按需加载 |
| 加载参数 | http(s) 下设置 `script.integrity` + `crossOrigin="anonymous"`；`file://` 为不透明源，跳过 SRI 以保证离线保存可用（见 `app.js`） |

升级步骤：

1. 替换 `vendor/html2canvas.min.js`；
2. 重新计算 SHA-256 与 SHA-384（Base64）；
3. 更新本文件的版本/大小/哈希/许可证/来源；
4. 更新 `app.js` 中 `script.integrity` 的 `sha384-...` 值；
5. 运行 `npm run test:browser`，确认保存与分享卡片仍可生成。