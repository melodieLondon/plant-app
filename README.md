# My Plants 🌿

A personal plant watering tracker with growth photo timeline, hosted on GitHub Pages.

---

## Files

```
plant-app/
├── index.html    ← the app
├── style.css     ← design
├── app.js        ← all logic
├── config.js     ← YOUR SETTINGS (only file you edit)
├── sw.js         ← makes it work on home screen
├── manifest.json ← PWA config
└── README.md
```

---

## Step 1 — Google Sheet (optional but recommended)

The sheet is for your **plant list** (name, location, watering frequency, notes).
Photos and watering history are saved locally in the app automatically.

### Column headers (Row 1):

| A | B | C | D |
|---|---|---|---|
| name | location | frequency_days | notes |

### Example rows:

| name | location | frequency_days | notes |
|---|---|---|---|
| Monstera | Living room | 7 | Indirect light, mist occasionally |
| Basil | Kitchen windowsill | 3 | Keep soil moist, loves sun |
| Peace Lily | Bedroom | 10 | Droops when thirsty — good signal! |

### Publish as CSV:
1. File → Share → Publish to web
2. Select **Sheet1** and **CSV**
3. Click Publish, copy the URL
4. Paste into `config.js`

> **Note:** You can also add plants directly in the app using the **+ Add** button, without needing a Google Sheet at all.

---

## Step 2 — GitHub Pages

Same process as before:
1. Create a new repo (e.g. `plant-app`)
2. Upload all files
3. Settings → Pages → Deploy from main branch
4. Live at `https://YOUR-USERNAME.github.io/plant-app/`

---

## Step 3 — Connect the sheet

Edit `config.js` and paste your CSV URL:

```js
const CONFIG = {
  SHEET_CSV_URL: "https://docs.google.com/spreadsheets/d/e/XXXX/pub?gid=0&single=true&output=csv"
};
```

---

## How it works

### Watering status
Each plant shows a colour-coded badge:
- 🔴 **Overdue** — past the watering date
- 🟡 **Due soon** — within 2 days
- 🟢 **Happy** — watered recently

### Watering a plant
Open any plant → tap **💧 Water now** → the last watered date updates instantly.

### Growth timeline
Open any plant → tap **📷 Add a new photo** → photo is saved with today's date.
All photos appear in a chronological timeline so you can watch your plants grow!

### Adding plants
- **From Google Sheet:** Add a row, the app picks it up on next open
- **Manually in app:** Tap **+ Add** on the home screen

### Filters
Use the pills on the home screen to filter by status — great for quickly seeing which plants need attention.

---

## Install on your phone

### iPhone (Safari)
Share → Add to Home Screen

### Android (Chrome)
Three dots → Add to Home Screen

Open the app in the browser first to let the service worker install, then add to home screen.
