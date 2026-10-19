# Scenarios

Every command and preview in visual-core has Given/When/Then scenarios here. Each scenario is one end-to-end test
named exactly after its title (test-core's testing protocol, vendored in `tools/test-core/`):

- the command scenarios run `tools/visual.py` on a scratch folder and check the files and pixels a person gets, in
  `tests/test_scenarios.py` (`def test_<title in snake case>`);
- the preview scenarios open the produced pages in headless Chromium, in `tests/browser.cjs` (`test('<title>', …)`).

Check: `python3 tools/test-core/scenarios.py check SCENARIOS.md --tests tests/test_scenarios.py tests/browser.cjs`
(add `--junit .test-output/unittest-junit.xml .test-output/browser-junit.xml` to require that each one ran and passed).
Renaming a scenario renames its test; removing a feature removes its scenario and its test in the same commit.

## Commands

### Scenario: Start a web app board in an empty folder
Given an empty scratch folder
When I run init web-app with an output folder inside it
Then the folder holds index.html, app.js and the vendored Basecoat and visual-core styles, with no remote URL

### Scenario: Starting a web app over an existing folder is refused
Given a scratch folder that already holds a file
When I run init web-app into that folder
Then the command fails with a readable error and the file is untouched

### Scenario: Copy the component kit
Given an empty scratch folder
When I run init component-kit
Then the folder holds the kit page, its script and the local Basecoat files

### Scenario: Generate the same ship twice from one seed
Given two empty scratch folders
When I run generate ship with seed 42 into each
Then both sheets have exactly the same pixels, matching the recorded ship, with a preview page

### Scenario: Draw an icon from the icon template
Given the icon template saved as a spec file
When I run create with that spec
Then revision 0001 holds a 24 pixel SVG check icon without scripts or remote references

### Scenario: Draw the robot from exact pixel rows
Given the robot template saved as a spec file
When I run create with that spec
Then the sheet has the recorded robot pixels and an atlas with one cell per frame

### Scenario: Change the robot's palette and keep the first revision
Given a robot asset at revision 1
When I revise it on base 1 with a patch that darkens one palette colour
Then revision 2 has the new colour and revision 1's files are unchanged

### Scenario: A revision on a stale base is refused
Given a robot asset already revised to revision 2
When I revise it again on base 1
Then the command fails naming the stale base and no revision 3 appears

### Scenario: Draw a legacy terrain sheet
Given the terrain template saved as a spec file
When I run create with that spec
Then the sheet has the recorded terrain pixels

### Scenario: Build the meadow terrain
Given the meadow terrain recipe saved as a file
When I run terrain create with that recipe
Then the native preview has the recorded meadow pixels and the quality report passes

### Scenario: Draw the hero from a pixel recipe
Given the hero pixel recipe saved as a file
When I run pixel check and then pixel create with it
Then the check says valid and the sheet has the recorded hero pixels

### Scenario: Make a library gem bigger in a new colour
Given a gem made from the item library at 16 pixels
When I pixel revise it to 32 pixels with green stone keys
Then revision 2 is 32 pixels wide with different pixels and revision 1 is kept

### Scenario: Draw the title logo as clean SVG
Given the title-logo vector template saved as a file
When I run vector create with it
Then the SVG has no script or remote reference and the preview has the recorded logo pixels

### Scenario: A spec with an unknown kind is refused
Given a spec file without a known kind
When I run check with it
Then the command fails and says which kinds are allowed

### Scenario: Measure text contrast
Given black text on a white background
When I run contrast with the two colours
Then the ratio is 21 and both text sizes pass

### Scenario: List what the toolbox can do
Given a visual-core checkout
When I run catalog
Then every implemented capability names its command and its recipe file exists

## Previews in a browser

### Scenario: Add, complete, find and filter projects on the board
Given a new web app board served locally
When I create two projects, complete one, filter, search and reload
Then the board shows the right projects each time and keeps them after the reload

### Scenario: The board stays usable on a phone, at 200% zoom and with reduced motion
Given the board with two projects
When I view it 360 and 640 pixels wide with reduced motion
Then nothing scrolls sideways and reduced motion is reported

### Scenario: Project names are shown as text, never as markup
Given the board
When I create a project named like an image tag
Then the name shows as text and no image appears

### Scenario: Sprite previews show the art at native size
Given the robot and the seed 42 ship created by the commands
When I open their preview pages
Then the images load at 32 and 12 pixels wide

### Scenario: Use the form, tabs and dialog in the component kit
Given the component kit served locally
When I switch tabs with the keyboard, keep a note and open and close the dialog
Then the selected tab, the note status and the focus follow, also 360 pixels wide

### Scenario: The terrain viewer redraws the exported pixels
Given the meadow terrain created by the command and the terrain viewer
When I open the viewer
Then its canvas has exactly the pixels of the exported native preview

### Scenario: Every Basecoat catalog page opens offline
Given the 41 page Basecoat catalog served locally with remote requests blocked
When I open every page and press the front-end toast button
Then each page shows its demo and code, its images load, a toast appears and nothing remote was requested
