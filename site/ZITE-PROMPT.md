# Zite handoff prompt

Paste everything below the line into Zite, and attach or upload the `site/`
folder alongside it.

---

## What I'm giving you

A complete, hand-built static website in the attached `site/` folder: 13 HTML
pages, one stylesheet (`assets/css/style.css`), and one small vanilla JS file
(`assets/js/site.js`). No build step, no frameworks, no external dependencies
except a Google Fonts link.

It's a junior golf review site called **The Junior Bag** — gear and course
reviews written in the voice of a 15-year-old tournament golfer, for other
junior golfers, their parents, and their coaches.

## What I want back

Rebuild this as a proper, editable, publishable Zite site. Treat the HTML as the
**design and content specification**, not as something to preserve verbatim.
Specifically:

1. Turn the two repeated page types into **reusable templates**
2. Turn the reviews into a **CMS collection** I can add to without touching code
3. Replace my hand-rolled JS with your **native components** where you have them
4. Keep the visual design, the voice, and the review structure intact
5. Make it responsive, accessible, and fast

Do not redesign the site. Do not rewrite the review copy. Improve the
implementation, not the concept.

---

## Brand

- **Site name:** The Junior Bag
- **Reviewer:** Caden, 15, junior tournament golfer, Pacific Northwest
- **Tagline:** Honest golf gear and course reviews, written by a junior golfer
  for junior golfers, their parents and their coaches.
- **Audience:** junior golfers 8–18 shopping for their own gear; parents buying
  for a junior; coaches recommending gear and venues
- **Purpose of every page:** help someone decide — buy this or not, play here or
  don't — faster than a manufacturer page or a wall of scores would

### Voice rules (apply to any copy you generate or edit)

- First person, conversational, direct. Short sentences over long ones.
- Enthusiastic only when something is genuinely good. Never fake hype.
- No golf-influencer clichés: no "absolute weapon," "must-have," "game-changer."
- No adult-pretending-to-be-a-teenager slang. Natural, not exaggerated.
- Junior-specific detail is the whole point: shaft length, grip size, swing
  speed, whether it still works when you grow, junior tee rates, how it felt on
  the 34th hole of a 36-hole day.
- No profanity. No gambling, no alcohol, no 19th-hole content — the core
  readership is under 18.

---

## Design system

All tokens are defined in `:root` at the top of `assets/css/style.css`. Map them
onto Zite's theme system so I can edit them in one place.

**Color**

| Role | Hex |
| --- | --- |
| Deep green (hero, footer, verdict blocks) | `#0d2419` |
| Green 800 (page headers) | `#123324` |
| Green 700 (primary buttons, links) | `#17573a` |
| Green 600 (hover, eyebrows) | `#1d7049` |
| Green 100 / 050 (chips, tint panels) | `#dcf0e4` / `#eef8f2` |
| Lime accent (CTAs on dark, highlights) | `#c8f169` |
| Amber (stars) | `#f4a72c` |
| Cream (page background) | `#fbf8f1` |
| Sand (panels, borders) | `#f0e9da` / `#ded3bd` |
| Ink / soft ink / muted | `#10201a` / `#3c4f45` / `#66786d` |
| Hairline | `#e4dccc` |

**Type:** Outfit for headings (700/800, tight letter-spacing, `text-wrap:
balance`), Inter for body (400/500/600, line-height 1.65). Fluid type scale
using `clamp()` — keep it fluid rather than fixed breakpoint sizes.

**Shape:** generous radii (8 / 14 / 22 / 32px), pill buttons and chips, soft
low-contrast shadows, 1px hairline borders rather than heavy dividers.

**Light theme only.** Don't add a dark mode.

---

## Pages and routes

| Route | Purpose |
| --- | --- |
| `/` | Homepage: hero, trust bar, featured review, filterable review grid, rating-scale explainer, parents/coaches panel, newsletter |
| `/gear` | Product review index, filterable by category |
| `/courses` | Course review index, filterable by type |
| `/how-i-review` | Testing minimums, rating scale, disclosure policy, "things this site will never do," FAQ |
| `/about` | Reviewer bio, what's in the bag, contact |
| `/reviews/<slug>` | Individual review — 8 of them exist |

Keep the `/reviews/<slug>` URL structure.

---

## Content model

Build **one Review collection** with a `type` field that switches which body
sections render, rather than two separate collections. Fields:

**Shared**
- `title` — full headline, always includes the product/course name plus an
  intent phrase ("Review: Is It Worth It for Junior Golfers?" for gear,
  "Review: A Junior Golfer's Take" for courses)
- `slug`, `type` (`gear` | `course`), `category`, `chipLabel`
- `coverIcon` and `coverVariant` (see Imagery below)
- `rating` — integer 1–5
- `datePublished`, `readTime`
- `lede` — one-sentence summary under the H1
- `quickTake` — 2–3 sentences, the verdict up front
- `disclosure` — optional rich text; when present, renders as a banner **above**
  the Quick Take
- `atAGlance` — repeating key/value pairs (sidebar)
- `comparedTo` — repeating key/value pairs plus a note (sidebar)
- `finalVerdict` — 2–3 sentences restating the rating
- `ctaLine` — one closing line with links
- `relatedReviews` — 3 references

**Gear only:** `whatItIs`, `howITestedIt`, `whatILiked` (3–5 bullets),
`whatIDidntLike` (2–4 bullets), `goodFitFor` (list), `notAGreatFitFor` (list),
`priceAndValue`

**Course only:** `theBasics` (location, par, yardage, green fees, walkability,
practice), `whatStoodOut` (3–5 bullets), `challenges` (2–4 bullets),
`juniorFriendliness`, `bestFor` (list), `playSomewhereElseIf` (list)

Categories in use: gear → `drivers`, `balls`, `bags`, `tech`, `training`;
course → `public`, `practice`, `tournament`. The index page filters key off
these, so keep them as a controlled vocabulary, not free text.

### Section order is fixed

The section headings and their order come from the site's editorial spec. Don't
reorder, merge, rename, or drop them, and don't let a template omit one:

- **Gear:** Quick Take → Overall Rating → What It Is → How I Tested It → What I
  Liked → What I Didn't Like → Good Fit For → Not a Great Fit For → Price &
  Value → Final Verdict → CTA
- **Course:** Quick Take → Overall Rating → The Basics → What Stood Out →
  Challenges → Junior-Friendliness → Best For → Final Verdict → CTA

---

## Templates to build

**1. Review template** — two-column at ≥940px: article body plus a sticky
right sidebar (320px). Sidebar stacks below the article on mobile. Contains, in
order: rating badge, "At a glance" spec list, "Compared to" panel, and a "How
this was rated" panel linking to `/how-i-review`. Above the article: breadcrumb,
category chip, H1, lede, byline row with avatar. Below it: a 3-card related
reviews grid.

**2. Index template** — dark page header (eyebrow, H1, one-line description),
then a filter chip bar, then a responsive card grid (`auto-fill`, min 290px),
then a closing panel. Used by `/gear` and `/courses`.

## Components to extract

Review card, rating badge, star rating, chip/tag, quick-take block, disclosure
banner, good-fit / not-a-good-fit callout pair, verdict block (dark), spec list
(key/value rows), filter chip bar, trust-bar item, rating-scale row, FAQ
accordion, newsletter block, sticky header, footer.

---

## Behaviors to reimplement natively

Replace `assets/js/site.js` with your own components:

- **Sticky translucent header** with a mobile menu toggle (`aria-expanded`)
- **Star rating** rendered from the numeric `rating` field — five stars, N
  filled, amber. Keep a visible text rating ("4/5") next to the stars, and keep
  `role="img"` plus an aria-label on the star group.
- **Category filters** on the index pages. Use `aria-pressed` on the buttons.
  Support deep links (`/gear#drivers` should land with that filter active).
  Prefer show/hide over re-fetching so all cards stay in the HTML for crawlers —
  if you use client-side routing instead, make sure the full card list is still
  server-rendered.
- **FAQ accordion** — native `<details>`/`<summary>` is fine
- **Newsletter form** — currently a stub. Wire it to a real email provider, or
  drop in your form component. Two placements: homepage `#newsletter` and the
  header CTA that links to it.

---

## Imagery

There are **no photographs** anywhere in the site. Card and hero covers are
gradient blocks with a line-art SVG icon on top, from an inline sprite:
`#i-driver`, `#i-ball`, `#i-bag`, `#i-tech`, `#i-aid`, `#i-course`, plus UI icons
(`#i-flag`, `#i-menu`, `#i-check`, `#i-shield`, `#i-eye`, `#i-tag`, `#i-info`,
`#i-arrow`). Gradient variants are the `card__cover--*` classes.

Keep this system, but make the cover image an **optional CMS field** so a real
photo can override the gradient-and-icon fallback per review. That's the single
biggest visual upgrade available once real photography exists.

The sprite is inlined into every page so the site works from `file://`. On your
platform, move it to a shared include or your own icon system.

---

## SEO requirements

- Titles follow: product/course name + intent phrase. Don't shorten them.
- Unique `<meta name="description">` per page, already written — keep them.
- `Review` JSON-LD on every review page: `itemReviewed` (`Product` for gear,
  `GolfCourse` for courses), `reviewRating` with `bestRating: 5`, author,
  publisher, `datePublished`. Generate this from the CMS fields.
- Canonical and Open Graph tags per page. Current values point at
  `thejuniorbag.example.com` — replace with the real domain.
- Generate `sitemap.xml` and `robots.txt`. I deliberately left these out because
  the domain is a placeholder.
- Add per-review OG images if you can generate them.

---

## Accessibility and quality bar

Match or beat what's already there:

- Skip link, landmark elements, `aria-current` on the active nav item
- `aria-pressed` on filters, `aria-expanded` on the nav toggle
- Visible focus rings (currently a 3px green outline with offset)
- No horizontal overflow at 390px or at 1280px on any page
- `prefers-reduced-motion` respected
- Print stylesheet that drops the header, footer, sidebar and filters
- Text contrast: check the lime `#c8f169` and amber `#f4a72c` against whatever
  backgrounds you place them on

---

## Non-negotiables

These are editorial rules the site is built around, not styling preferences.

1. **All current content is fictional placeholder copy.** Every brand, product,
   course, price, and test session — Northbank, Cypress, Sandpiper, Kestrel,
   TempoLine, Ridgeline Municipal, Copper Ridge, Willow Creek — is invented, and
   so is the reviewer. It exists to demonstrate the templates and voice.
2. **Never generate reviews of real, named products or real courses.** The site
   publishes only first-hand testing. Inventing test sessions for a real brand
   would be a fabricated review of a real company. If you need more sample
   content, invent more fictional brands, or leave the collection empty for me
   to fill.
3. **Keep the "Sample content — replace before publishing" line in the footer**
   until I tell you the content is real. Keep the sample-content notice comment
   in the page source too.
4. **Every review shows at least one downside**, including 5-star reviews. Don't
   let a template render without the negatives section, and don't let an editor
   publish one empty.
5. **The disclosure banner renders above the Quick Take**, before any opinion,
   whenever a product was provided free or a round was comped. See
   `/reviews/kestrel-r1-rangefinder` for the live example. Never hide it behind
   a toggle, move it to the footer, or style it as fine print.
6. **Don't inflate or "normalize" ratings.** The scale is fixed: 5 exceptional,
   4 very good with minor drawbacks, 3 solid with real trade-offs, 2 below
   average, 1 skip it. The existing spread (one 5, four 4s, two 3s, one 2) is
   intentional — leave it alone.
7. **No health, safety, or performance-guarantee claims** anywhere in generated
   copy. No product "prevents injury" or "guarantees" distance.
8. **Age-appropriate throughout.** No gambling, no alcohol, no 19th-hole
   content.

---

## Two names to swap

Site name **The Junior Bag** and reviewer **Caden** appear throughout. Expose
both as global site variables so they can be changed in one place, rather than
hard-coding them into templates. Same for the reviewer's age, region, avatar
initial, and the contact addresses currently at `@thejuniorbag.example.com`.

---

## Acceptance checklist

- [ ] Both templates render every required section, in the specified order
- [ ] A new review can be published entirely from the CMS, with no code edits
- [ ] Filters work on `/gear` and `/courses`, including deep links
- [ ] Stars render from the numeric rating and are readable by a screen reader
- [ ] Disclosure banner appears above the Quick Take on the Kestrel review
- [ ] All internal links and anchors resolve
- [ ] No horizontal overflow at 390px or 1280px on any page
- [ ] Review JSON-LD validates on every review page
- [ ] Footer sample-content notice still present
