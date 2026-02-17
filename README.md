# 🚀 Save to Notion - LeetCode Extension

**Save your LeetCode solutions to Notion with one click!** Track your progress, analyze complexity, and organize your coding journey.

![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

---

## ✨ Features

- 🎯 **One-Click Save** - Save solutions directly to Notion
- ⌨️ **Keyboard Shortcuts** - Quick save with `Ctrl+Shift+S`
- 🌓 **Dark Mode** - Beautiful dark theme with system sync
- 🤖 **AI Analysis** - Auto-detect time/space complexity (optional)
- 🔄 **Auto-Save** - Automatically save on accepted submissions
- 🏷️ **Smart Tags** - Automatically imports LeetCode topic tags

---

## 📦 Quick Start

### 1. Install Extension

1. Download or clone this repository
2. Open Chrome → `chrome://extensions/`
3. Enable **Developer mode** (top-right)
4. Click **Load unpacked** → Select extension folder

### 2. Create Notion Integration

1. Go to [Notion Integrations](https://www.notion.so/my-integrations)
2. Click **+ New integration**
3. Copy your **Integration Token** (starts with `secret_`)

### 3. Create Notion Database

Create a table with these properties:

| Property     | Type         | Required |
| ------------ | ------------ | -------- |
| Name         | Title        | ✅ Yes   |
| Difficulty   | Select       | ✅ Yes   |
| Tags         | Multi-select | ✅ Yes   |
| Date Solved  | Date         | ✅ Yes   |
| LeetCode URL | URL          | ✅ Yes   |
| Runtime      | Text         | Optional |
| Space        | Text         | Optional |
| Approach     | Select       | Optional |

**Set Difficulty options:** Easy (Green), Medium (Yellow), Hard (Red)

### 4. Connect Database

1. Open your Notion database
2. Click **•••** → **Add connections**
3. Select your integration → **Confirm**

### 5. Configure Extension

1. Click extension icon
2. Enter your **Notion API Token**
3. Select your **Database**
4. Click **Save Settings**

✅ Done! You're ready to save problems!

---

## 🎯 Usage

### Quick Save (Recommended)

1. Solve a LeetCode problem
2. Press **`Ctrl+Shift+S`** (Mac: `Cmd+Shift+S`)
3. Check your Notion database! 🎉

### Manual Save

1. Click extension icon
2. Review extracted data
3. Click **Save to Notion**

### Auto-Save

1. Extension icon → **Options**
2. Toggle **"Enable auto-save"**
3. Submissions save automatically on "Accepted"!

---

## 🤖 Optional: AI Analysis

Get automatic complexity analysis with Gemini AI:

1. Get API key: [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Extension → **Options** → Add Gemini API key
3. Add **Runtime** and **Space** (Text type) columns to Notion

Benefits:

- ⏱️ Time complexity (e.g., O(n))
- 💾 Space complexity (e.g., O(1))
- 🎯 Approach detection
- 💡 Optimization tips

---

## ⌨️ Keyboard Shortcuts

| Action       | Windows/Linux  | Mac           |
| ------------ | -------------- | ------------- |
| Quick Save   | `Ctrl+Shift+S` | `Cmd+Shift+S` |
| Extract Data | `Ctrl+Shift+E` | `Cmd+Shift+E` |

**Customize:** `chrome://extensions/shortcuts`

---

## 🔧 Troubleshooting

### "Failed to save to Notion"

- Check: Database shared with integration?
- Fix: Notion → Database → ••• → Add connections

### Runtime/Space columns empty

- Need: Gemini API key configured
- Check: Columns must be **Text** type (not Rich Text)

### Optional property warnings (e.g. "Approach is not a property")

- Extension now checks your database schema and skips optional fields that don't exist
- You can still add "Approach" as a Select property in Notion if you want that column populated

### Can't extract code

- Refresh LeetCode page
- Make sure you're on a problem page (not list)

---

## 📋 What Gets Saved

✅ Problem details (number, title, difficulty, tags)
✅ Full problem description (beautifully formatted)
✅ Your complete solution code
✅ Programming language
✅ Submission stats (runtime, memory percentile)
✅ AI analysis (if enabled)
✅ Date solved

---

## 🎨 Customization

### Dark Mode

Extension → **Options** → Theme Settings

- **System** - Match OS theme
- **Light** - Always light
- **Dark** - Always dark

### Auto-Save

Extension → **Options** → Toggle "Enable auto-save"

## 📄 License

MIT License - see [LICENSE](LICENSE)

<div align="center">

### ⭐ Star this repo if you found it helpful!

**Made with 💙 for the coding community**

</div>
