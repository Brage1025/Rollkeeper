<h1 align="center" style="color:#ffd86a">Rollkeeper</h1>

A beginner-friendly initiative tracker for tabletop combat. It runs in the browser with HTML, CSS, and JavaScript. There is no build step, server, or account.

Built for the Global Hack Week: Hacktoberfest, CHALLENGE 1: Build a Mini App with Cursor

## Run it locally

1. Open a terminal in this folder.
2. Start a local web server.

   Python:

   ```powershell
   python -m http.server 8080
   ```

   If that command is not found, try `py -m http.server 8080`.

   Node.js:

   ```powershell
   npx serve .
   ```

3. Open the address the server prints. For Python that is [http://localhost:8080](http://localhost:8080).

A local server gives this folder its own saved encounter. Opening `index.html` directly can work, but some browsers share storage across every `file://` page and block `crypto.randomUUID`. Prefer the server.

## What each file does

- `index.html` is the page: the add form, the turn order, the reset confirmation, and the labels assistive tech reads.
- `styles.css` is the window: a gold-trimmed panel, stone buttons, and unit frames in the style of a fantasy game menu.
- `app.js` is the encounter: sorting, hit points, turns, validation, and saving.
- `README.md` is these instructions.
- `LICENSE` is the MIT License instructions.

## Using it

Add a name, initiative, and maximum HP. Leave current HP blank to start at full health. The list sorts itself, highest initiative first. If two scores match, the earlier combatant stays ahead. Until you press Next Turn or change someone's HP, the highlight stays on the highest initiative, so you can keep adding creatures while you set the fight up.

Next Turn moves the highlight and starts the next round after the last combatant. Hit point buttons stop at 0 and at maximum HP. Remove drops one creature. Reset Encounter asks first, then clears the fight.

The encounter is stored in this browser under the key `rollkeeper.encounter`. The first visit loads a sample fight. After a reset, refresh stays empty. To see the samples again, delete that key in the browser's site data for this page.

## License

This project is licensed under the [MIT License](LICENSE).

---

<div align="center">

_"To &lt;div&gt; or not to &lt;div&gt;, that is the question."_
— [Brage1025](https://github.com/Brage1025)

</div>
