# open_plan – Modal „Wärmebedarf Quartier“ (Handover)

Static prototype of the neighbourhood heat demand modal, built 1:1 from the canvas design
(artboard "Wärmebedarf Quartier – team structure, refined"), with placeholder data.

Open `modal.html` in a browser. No build step, no libraries (only the Lato font).

| File | What |
|---|---|
| `modal.html` | the modal, with a small prototype bar on top (3 / 24 connections, open again) |
| `modal.scss` | all styles, BEM, prefix `qm-`. Variables at the top |
| `modal.css` | compiled `modal.scss`, only so the page opens without a build step |
| `modal.js` | data and behaviour, plain JS |

## modal.js

0. **`MODAL_DATA`** – building groups (name, load profile type, annual demand, construction
   year), connections of the node (the edges on the canvas), connection rates per group and
   connection, generation of the heating network. Two sets of connections (`suppliersFew`,
   `suppliersMany`) only for the prototype switch. Replace with data from the backend.
1. **`QuartierLogic`** – view model: sums per building group (or per column when rotated), open
   rows, total demand, how much of the heating network's generation is assigned, texts.
2. **Templates** – HTML of the prototype bar, the modal and the warning (BEM classes of `modal.scss`).
3. **Runtime** – state, redraw, events, focus.

`modal.html` contains the pre-rendered markup of the initial state, so the structure can be read
without running it. On load, `modal.js` draws it again and keeps it up to date.

## Behaviour

- **Tabs** Lastprofile / Anschlussraten. The tab shows the number of connections (read-only, from
  the edges on the canvas) and a red dot while a building group is not at 100 %.
- **Lastprofile**: edit, add, remove building groups. "Eigene Zeitreihe" swaps the demand field for
  a time series picker. Demand is formatted (250.000) except while the field has focus.
  Below: time series of the whole node (select / upload / constant value) and the central supply
  (generation of the heating network, how much of it is assigned, details table).
- **Anschlussraten**: building groups as rows (sticky first column and Σ column, scrolls sideways)
  or connections as rows (sticky header and Σ row). Σ shows ✓ at 100 %, a warning icon otherwise,
  with a light tint (under / over 100 %).
- **Close, Cancel, Save** ask first while a group is not at 100 % ("Trotzdem schließen" /
  "Zu den Anschlussraten"). Escape does the same. "Modal öffnen" shows the red dot while rates
  are incomplete and reopens the modal on the rates tab (in the app: the node on the canvas).
- **Focus** stays on the field (with the caret) after every redraw; the warning takes the focus;
  after closing, focus goes back to the button that opens it.

## Good to know

- The % and year fields are `type="text"` with `inputmode`, so the caret survives a redraw (number
  inputs can't keep it). Validate the values on save.
- The backdrop starts at `--qm-top` (here 56 px, below the prototype bar). In the app set it to the
  height of the step bar, or 0.
- `main.css` in the app forces link colours with `!important`; the modal has no links, so nothing
  needs overriding. Bootstrap's `.modal` is not used.
