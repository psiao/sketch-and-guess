# Sketch & Guess

A self-hosted, Skribbl-style draw-and-guess game for your team. Static front end
(deploys to GitHub Pages like your VA guide) + Firebase Realtime Database for the
live sync. Runs entirely on Firebase's **free Spark plan** — no server to maintain,
no monthly bill, and it never pauses for inactivity.

- No player accounts — people join with a room code and a display name.
- Bilingual EN/ES word packs you own and edit (`words.js`).
- Rebrandable in one place (`styles.css`, the `--brand-*` variables).
- Dropped players keep their score when they rejoin (same browser).

---

## 1. Create the Firebase project (~5 min, one time)

1. Go to https://console.firebase.google.com → **Add project**. Name it, skip
   Google Analytics (not needed), create it. Stay on the **Spark (free)** plan.
2. **Build → Authentication → Get started → Sign-in method → Anonymous → Enable.**
   (This is what lets players in without accounts.)
3. **Build → Realtime Database → Create database.** Pick the location closest to
   your team. Start in **locked mode** — you'll paste rules next.
4. **Realtime Database → Rules**, replace with the block in section 2, **Publish**.
5. **Project settings (gear icon) → General → Your apps → Web app (`</>`)**.
   Register the app, then copy the `firebaseConfig` values.
6. Paste those values into **`firebase-config.js`**.

## 2. Database rules

Players are authenticated (anonymously), and access is scoped to rooms. Paste this
into Realtime Database → Rules:

```json
{
  "rules": {
    "rooms": {
      "$code": {
        ".read": "auth != null",
        ".write": "auth != null"
      }
    }
  }
}
```

This is deliberately simple and fine for an internal, trusted group. If you ever
open this beyond your team, ask me for the hardened ruleset (locks scores/word so
only the host can write them).

## 3. Deploy to GitHub Pages

1. Create a repo and add these five files at the root:
   `index.html`, `styles.css`, `game.js`, `firebase-config.js`, `words.js`.
2. **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   pick `main` / root, save.
3. Your game is live at `https://<you>.github.io/<repo>/`.
4. In the **Firebase console → Authentication → Settings → Authorized domains**,
   add your `github.io` domain so anonymous sign-in works there.

## 4. How to play

- **Host:** open the site, enter your name, pick language / rounds / seconds,
  **Create game**. Share the room code or the **Copy invite link** button.
- **Players:** open the link (or type the code), enter a name, they're in.
- Host clicks **Start** once at least 2 people are connected. Players take turns
  drawing; everyone else types guesses. Correct guesses score more the faster they
  come in; the drawer earns points for each person who guesses their word.

## 5. Editing your word library (`words.js`)

This is the part that makes owning it worth it. Each pack has an `en` and `es`
list. Add your own — firm in-jokes, legal terms, VA-world words, holiday sets:

```js
legal: {
  label: "Legal",
  en: ["gavel", "contract", "courtroom", "witness stand"],
  es: ["mazo", "contrato", "sala del tribunal", "estrado"],
},
```

Then add the pack id to `DEFAULT_PACK_IDS` at the bottom of the file. Commit,
and GitHub Pages redeploys automatically.

## 6. Rebranding

Open `styles.css` and change the four variables at the top:

```css
--brand-ink: #14213d;      /* dark header */
--brand-accent: #2563eb;   /* buttons / highlights */
--brand-accent-2: #f59e0b; /* timer */
--brand-surface: #f4f6fb;  /* background */
```

Swap in your Legal Soft colors and the whole UI follows.

---

## Important notes / current limits (v1)

- **The host's tab is the engine.** To stay free (no Cloud Functions), the host's
  browser runs the timer and advances turns. The host must keep the tab open for
  the whole game. If the host closes it, the game stalls. (Host-migration is a
  possible later add.)
- **Fair play.** For simplicity, guesses are checked in each player's own browser.
  Someone technical could peek at the word in dev tools. Fine for a trusting
  internal group; if you want it cheat-resistant, I can move guess-checking to be
  host-authoritative and hide the word via rules.
- **Test before the real night.** Open the site in **two browser tabs** (or two
  devices), create in one and join in the other, and run a full turn. This is the
  step to shake out any Firebase-config issues before 50 people show up.
- **Scale.** Spark's Realtime Database free tier allows 100 simultaneous
  connections — comfortably above your 50. You will not hit paid usage at this size.

## Questions for the next pass
Once you've tested with two tabs, tell me what felt off and I can add: word-choice
(drawer picks from 3), round/turn "reveal" animations, team mode, a hint system
(reveal letters as time runs down), sound, or the HubSpot winner-logging hook.
