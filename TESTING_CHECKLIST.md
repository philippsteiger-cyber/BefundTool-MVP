# Testing Checklist

Use this checklist to verify that all features work correctly before and after deployment.

## Pre-Deployment Testing (Local)

### Setup
- [ ] `npm install` completes without errors
- [ ] `npm run dev` starts development server
- [ ] `npm run build` completes successfully
- [ ] `npm run typecheck` passes without errors
- [ ] App loads at http://localhost:3000

### UI Elements
- [ ] Warning banner is visible: "Demo only – keine PHI/PAT-Daten verwenden"
- [ ] Two tabs visible: "Report" and "Template Editor"
- [ ] Report tab is active by default

## Report Tab Testing

### Diktat Panel
- [ ] Start/Stopp button is visible
- [ ] Clear button is visible
- [ ] Browser compatibility warning appears (if Firefox)
- [ ] Clicking Start:
  - [ ] Button changes to red "Stopp" with MicOff icon
  - [ ] "Aufnahme läuft..." indicator appears
  - [ ] Browser requests microphone permission (first time)
- [ ] Speaking into microphone:
  - [ ] Interim text appears in gray/lighter color
  - [ ] Final text appears in normal color
  - [ ] Text accumulates with each phrase
- [ ] Clicking Stopp:
  - [ ] Recording stops
  - [ ] Button changes back to "Start"
  - [ ] Indicator disappears
  - [ ] Transcript remains visible
- [ ] Clicking Clear:
  - [ ] Transcript is completely cleared
  - [ ] Textarea shows placeholder text

### Template Panel
- [ ] Auto-Suggest checkbox is visible and checked by default
- [ ] Template dropdown shows 3 default templates:
  - [ ] CT Abdomen – Standard
  - [ ] MRT Prostata – PI-RADS
  - [ ] MRT Knie – Standard
- [ ] Lock/Unlock button is visible

#### Auto-Suggestion Testing
Test with these phrases and expected results:

**Test 1: CT Abdomen**
- [ ] Dictate: "CT Abdomen mit Kontrastmittel, Leber und Niere unauffällig"
- [ ] Top-3 Vorschläge appears
- [ ] "CT Abdomen – Standard" appears as #1 suggestion
- [ ] Confidence percentage shows (should be ~50-70%)
- [ ] Template dropdown auto-selects "CT Abdomen – Standard"

**Test 2: MRT Prostata**
- [ ] Clear transcript
- [ ] Dictate: "MRT Prostata mit PI-RADS Score"
- [ ] "MRT Prostata – PI-RADS" appears as #1 suggestion
- [ ] Template auto-switches to "MRT Prostata – PI-RADS"

**Test 3: MRT Knie**
- [ ] Clear transcript
- [ ] Dictate: "MRT Knie mit Meniskusriss und Kreuzband"
- [ ] "MRT Knie – Standard" appears as #1 suggestion
- [ ] Template auto-switches to "MRT Knie – Standard"

#### Lock/Unlock Testing
- [ ] Manually select different template from dropdown
- [ ] Lock icon appears (filled)
- [ ] Warning text appears: "Template ist gesperrt..."
- [ ] Continue dictating - template does NOT change
- [ ] Click Unlock button
- [ ] Lock icon changes to unlocked (outline)
- [ ] Warning text disappears
- [ ] Auto-suggestion resumes working

### Auto-Impression Panel
- [ ] Textarea is visible and editable
- [ ] Regenerieren button is visible
- [ ] Kopieren button is visible

**Test Impression Generation:**

**Test 1: PI-RADS 5**
- [ ] Clear everything
- [ ] Select "MRT Prostata – PI-RADS" template
- [ ] Dictate: "Prostata mit PI-RADS 5 Läsion in der peripheren Zone"
- [ ] Impression auto-generates
- [ ] Contains: "PI-RADS 5: Hochgradiger Verdacht..."
- [ ] Contains: "Biopsie dringend empfohlen"

**Test 2: Meniskusriss**
- [ ] Clear everything
- [ ] Select "MRT Knie – Standard" template
- [ ] Dictate: "Knie mit Meniskusriss und Gelenkerguss"
- [ ] Impression contains: "Meniskusläsion nachgewiesen"
- [ ] Impression contains: "Gelenkerguss vorhanden"

**Test 3: Manual Edit**
- [ ] Click in impression textarea
- [ ] Type additional text
- [ ] Text is editable
- [ ] Click Regenerieren
- [ ] Impression regenerates from transcript (overwrites manual edits)

**Test 4: Copy Button**
- [ ] Click Kopieren button
- [ ] Toast notification appears: "Beurteilung kopiert"
- [ ] Paste in another application (Ctrl+V)
- [ ] Impression text is pasted

### Rendered Report Panel
- [ ] Large textarea shows full report
- [ ] "Bericht kopieren" button is visible
- [ ] Report structure:
  - [ ] Section "Indikation:" with default text
  - [ ] Section "Technik:" with default text
  - [ ] Section "Befund:" with dictated transcript
  - [ ] Section "Beurteilung:" with generated impression

**Test Copy Report:**
- [ ] Click "Bericht kopieren"
- [ ] Toast notification: "Bericht kopiert"
- [ ] Paste in another application
- [ ] Complete formatted report is pasted

## Template Editor Tab Testing

### Template List
- [ ] Left panel shows all 3 default templates
- [ ] CT Abdomen template is selected by default
- [ ] Templates are clickable

### YAML Editor
- [ ] Right panel shows YAML editor
- [ ] Default template YAML is loaded
- [ ] Text is monospace font
- [ ] Text is editable
- [ ] Speichern button is visible
- [ ] Löschen button is visible

**Test 1: View Templates**
- [ ] Click "MRT Prostata – PI-RADS"
- [ ] YAML updates to show Prostata template
- [ ] Click "MRT Knie – Standard"
- [ ] YAML updates to show Knie template

**Test 2: Edit Existing Template**
- [ ] Select "CT Abdomen – Standard"
- [ ] Change name to: "CT Abdomen – Modified"
- [ ] Click Speichern
- [ ] Toast notification: "Template aktualisiert"
- [ ] Template list shows "CT Abdomen – Modified"
- [ ] Switch to Report tab
- [ ] Dropdown shows "CT Abdomen – Modified"

**Test 3: Create New Template**
- [ ] Clear YAML editor
- [ ] Paste minimal template:
```yaml
id: test-template
name: Test Template
language: de-CH
chooser:
  keywords:
    - term: test
      weight: 5
  phrases: []
sections:
  - id: befund
    title: Befund
    default_text: ""
  - id: beurteilung
    title: Beurteilung
    default_text: ""
render:
  order:
    - befund
    - beurteilung
impression:
  rules: []
  max_sentences: 3
```
- [ ] Click Speichern
- [ ] Toast notification: "Neues Template erstellt"
- [ ] "Test Template" appears in template list
- [ ] Switch to Report tab
- [ ] "Test Template" appears in dropdown

**Test 4: Invalid YAML**
- [ ] Type invalid YAML (e.g., missing colon)
- [ ] Click Speichern
- [ ] Error toast appears: "Ungültiges YAML: ..."
- [ ] Template is NOT saved

**Test 5: Delete Template**
- [ ] Select "Test Template"
- [ ] Click Löschen
- [ ] Toast notification: "Template gelöscht"
- [ ] "Test Template" disappears from list
- [ ] Next template auto-selected

## Persistence Testing

### localStorage Persistence
- [ ] Add/edit templates
- [ ] Close browser tab
- [ ] Reopen app
- [ ] Templates are still present (persisted)
- [ ] Modified templates show changes

**Test 1: Template Survives Reload**
- [ ] Edit a template in YAML editor
- [ ] Save it
- [ ] Refresh page (F5)
- [ ] Template still shows changes

**Test 2: New Template Survives Reload**
- [ ] Create new template
- [ ] Save it
- [ ] Refresh page
- [ ] New template still exists

## Browser Compatibility

Test in different browsers:

### Chrome/Edge (Primary)
- [ ] All features work
- [ ] Speech recognition works
- [ ] Microphone permission prompt appears

### Safari
- [ ] App loads
- [ ] Speech recognition works (may have different behavior)
- [ ] UI renders correctly

### Firefox
- [ ] App loads
- [ ] Warning appears: "Speech Recognition nicht unterstützt..."
- [ ] Start button is disabled
- [ ] Other features (templates, YAML editor) work

## Responsive Design

### Desktop (1920x1080)
- [ ] Two-column layout in Report tab
- [ ] YAML editor readable
- [ ] No horizontal scrolling

### Tablet (768x1024)
- [ ] Layout adjusts to single column
- [ ] All panels stack vertically
- [ ] Buttons remain clickable

### Mobile (375x667)
- [ ] Single column layout
- [ ] Text remains readable
- [ ] Buttons are touch-friendly
- [ ] No text cutoff

## Post-Deployment Testing (Vercel)

After deploying to Vercel, repeat these critical tests:

### Basic Functionality
- [ ] App loads at Vercel URL
- [ ] HTTPS is enabled (green padlock)
- [ ] Warning banner is visible
- [ ] Speech recognition works (requires HTTPS)
- [ ] Templates persist after reload

### Performance
- [ ] Initial page load < 3 seconds
- [ ] Speech recognition starts without delay
- [ ] Template switching is instant
- [ ] No console errors

### Security
- [ ] No mixed content warnings
- [ ] Microphone permission requested correctly
- [ ] No errors in browser console
- [ ] localStorage works properly

## Known Limitations

Document any expected limitations:
- [ ] Speech recognition requires internet (browser API)
- [ ] Firefox not supported for dictation
- [ ] localStorage cleared when browser cache cleared
- [ ] Microphone permission must be granted per-session

## Bug Tracking

If issues found, document:
1. What doesn't work
2. Steps to reproduce
3. Expected behavior
4. Actual behavior
5. Browser/OS information

---

## Quick Test Script

For rapid testing, use this sequence:

1. Open app
2. Click Start → Say "MRT Prostata PI-RADS 5" → Check template switches
3. Check impression generates
4. Copy report
5. Switch to Template Editor
6. Edit a template
7. Save
8. Reload page → Verify persistence
9. Done!

Total time: ~2 minutes
