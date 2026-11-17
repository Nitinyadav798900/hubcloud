## HubCloud Bypass API

### Setup
```bash
npm install
npm start
# or for dev
npm run dev
```

### Usage

```
GET /hubcloud?url=https://hubcloud.pw/drive/hjbxwnwshhhqyu8
```

### Response
```json
{
  "success": true,
  "file_id": "hjbxwnwshhhqyu8",
  "metadata": {
    "filename": "Killing.Season.2013.1080p...",
    "size": "1.9 GB",
    "type": "video/x-matrosk",
    "date": "15-Nov-2026 06:44:41"
  },
  "servers": [
    { "label": "FSLv2 Server", "url": "https://1c8e2ebb...", "server": "fslv2" },
    { "label": "FSL Server",   "url": "https://cee4a5cf...", "server": "fsl"   },
    { "label": "10Gbps Server","url": "https://gpdl.hub...", "server": "10gbps"},
    { "label": "PixelDrain Server", "url": "https://pixeldrain.dev/...", "server": "pixeldrain" },
    { "label": "Buzz Server",  "url": "https://fuckingfast.net/...", "server": "buzz" },
    { "label": "Telegram",     "url": "https://hubcloud.mov/tg/...", "server": "telegram" }
  ],
  "extracted_at": "2026-11-17T06:00:00.000Z"
}
```

### Supported URL formats
- `https://hubcloud.pw/drive/{id}`
- `https://hubcloud.cx/drive/{id}`
- `https://hubcloud.mov/drive/{id}`
- `https://hubcloud.in/drive/{id}`
- `https://hubcloud.fans/drive/{id}`

### Deploy on Vercel
Add `vercel.json`:
```json
{
  "version": 2,
  "builds": [{ "src": "index.js", "use": "@vercel/node" }],
  "routes": [{ "src": "/(.*)", "dest": "index.js" }]
}
```
Then `vercel deploy --prod`.
