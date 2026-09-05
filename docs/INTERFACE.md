# Workbench interface conventions

The CLI is the conversation entry. Research pages occupy the adjacent full-height pane; switching a research tab must preserve the terminal. Keep navigation and document controls compact enough to leave room for actual papers, notes and figures.

## Visual system

`src/tokens.css` owns shared colors, fonts, surfaces, borders and shadows. `src/workbench.css` contains the workbench and component layout. Avoid adding another global override stylesheet. The interface uses white document surfaces, a light neutral canvas, dark text and restrained blue active states. Terminal colors come from the selected terminal profile, independently of these interface tokens.

Use small consistent line icons for navigation and formatting. An icon-only action needs an accessible name and a tooltip. Keep primary actions visually distinct, secondary controls quiet, and cards readable without heavy borders or large decorative badges. Scientific figure colors belong to the figure itself.

The writing page combines file selection and save controls into one toolbar. The lower file bar retains an editable draft title. Reading and visual Markdown editing use a constrained text measure while leaving the document pane full height. Template previews receive more space than metadata.

## Interaction

- Transient menus close on outside pointer input or Escape. Escape returns focus to the opening button.
- Dialogs focus a useful field, contain Tab navigation, and return focus to their opener on dismissal.
- Source and visual editing retain scroll positions per document and mode while the editor is mounted. The first switch to a mode uses the other mode's approximate scroll fraction; this is not a semantic paragraph mapping or persistent reading history.
- Canvas dragging follows the pointer without a positional transition. Connector geometry must match the card's rendered connection point.
- Hover and entry transitions remain short. Honor `prefers-reduced-motion` and keep keyboard focus visible.

Browser checks exercise menu dismissal, dialog focus, document scroll restoration, and the existing reading, editing, graph and terminal workflows. Screenshots use synthetic research fixtures; do not publish private papers or terminal output from a person's session.
