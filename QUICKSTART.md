# Quick Start Guide

Get BefundTool MVP running in under 5 minutes.

## Local Development

```bash
# 1. Install dependencies
npm install

# 2. Run development server
npm run dev

# 3. Open browser
# Navigate to http://localhost:3000
```

## First-Time Usage

### 1. Test Speech Recognition

1. Click the **Start** button in the Diktat panel
2. Allow microphone access when prompted
3. Say in German: **"MRT Prostata mit PI-RADS 5 Läsion"**
4. Watch the transcript appear in real-time
5. Click **Stopp** when done

### 2. Watch Auto-Template Suggestion

- As you dictate, the **Top-3 Vorschläge** panel updates
- The best matching template is automatically selected
- In this example, "MRT Prostata – PI-RADS" should be selected
- Confidence percentage shows how confident the match is

### 3. See Auto-Impression

- The **Auto-Impression** panel automatically generates an impression
- For "PI-RADS 5", it should generate:
  - "PI-RADS 5: Hochgradiger Verdacht auf klinisch signifikantes Prostatakarzinom. Biopsie dringend empfohlen."

### 4. View Rendered Report

- The **Rendered Report** panel shows the complete report
- Sections are in order: Indikation, Technik, Befund, Beurteilung
- Your transcript fills the "Befund" section
- The impression fills the "Beurteilung" section
- Click **Bericht kopieren** to copy the entire report

### 5. Edit Templates

1. Switch to the **Template Editor** tab
2. Select a template from the left panel
3. Edit the YAML in the right panel
4. Click **Speichern** to save changes
5. Switch back to **Report** tab to use the updated template

## Quick Test Examples

### Example 1: CT Abdomen

**Dictate:**
```
CT Abdomen mit Kontrastmittel. Leber regelrecht konfiguriert, keine Raumforderung. Nieren beidseits unauffällig. Milz und Pankreas regelrecht.
```

**Expected:**
- Template: "CT Abdomen – Standard" (auto-selected)
- Impression: "Kein pathologischer Befund."

### Example 2: MRT Prostata PI-RADS 4

**Dictate:**
```
MRT Prostata zeigt eine PI-RADS 4 Läsion im Apex links mit reduzierter Diffusion und frühem Enhancement.
```

**Expected:**
- Template: "MRT Prostata – PI-RADS" (auto-selected)
- Impression: "PI-RADS 4: Wahrscheinliches Vorliegen eines klinisch signifikanten Prostatakarzinoms. Biopsie empfohlen."

### Example 3: MRT Knie with Findings

**Dictate:**
```
MRT Knie rechts zeigt einen Meniskusriss des Innenmeniskus Hinterhorns. Zusätzlich geringer Gelenkerguss. Kreuzbänder intakt.
```

**Expected:**
- Template: "MRT Knie – Standard" (auto-selected)
- Impression: "Meniskusläsion nachgewiesen. Gelenkerguss vorhanden."

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Copy impression | Click "Kopieren" button |
| Copy full report | Click "Bericht kopieren" button |
| Clear transcript | Click "Clear" button |

## Common Issues

### "Speech Recognition nicht unterstützt"
**Solution:** Use Chrome, Edge, or Safari. Firefox is not supported.

### Microphone not working
**Solution:** Check browser permissions in browser settings → Site settings → Microphone

### Templates not saving
**Solution:** Ensure localStorage is enabled and you're not in incognito/private mode

### Template not auto-selecting
**Solution:** Check that "Auto-Suggest" checkbox is enabled and template is not locked

## Tips & Tricks

1. **Speak clearly and at normal pace** - The speech recognition works best with clear enunciation
2. **Use medical keywords** - Templates match based on keywords like "prostata", "knie", "abdomen"
3. **Lock template when needed** - If auto-suggestion switches templates unexpectedly, manually select and lock
4. **Edit impressions** - The auto-generated impression is editable; customize as needed
5. **Create custom templates** - Add your own templates in the YAML editor for your specific use cases

## What to Test

Before considering the app production-ready, verify:

✅ Speech recognition starts and stops correctly
✅ Transcript appears with interim and final text
✅ Templates auto-suggest based on content
✅ Lock/unlock mechanism works
✅ Impressions generate based on rules
✅ Reports render with all sections
✅ Template editor saves changes
✅ Templates persist after page reload
✅ Copy buttons work (impression and full report)

## Next Steps

1. ✅ Run locally and test all features
2. 📝 Customize templates for your specific use cases
3. 🚀 Deploy to Vercel (see DEPLOYMENT.md)
4. 📋 Share with colleagues for feedback
5. 🔄 Iterate based on real-world usage

---

**Need help?** Check the full README.md or DEPLOYMENT.md for detailed instructions.

**Security reminder:** This is a demo tool. Do not use with real patient data (PHI).
