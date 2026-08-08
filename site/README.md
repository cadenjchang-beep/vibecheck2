# The Junior Bag — junior golf review site

A complete, static, dependency-free website for a junior-golfer-voiced gear and
course review site, built to the brand/voice spec in the master prompt. Written
as plain HTML + CSS + a little vanilla JS so it can be imported into Framer,
Zite, or any host, and refined from there.

---

## ⚠️ Read this first: the content is sample copy

**Every brand, product, course, price and test session on this site is
fictional.** "Northbank," "Cypress," "Sandpiper," "Kestrel," "TempoLine,"
"Ridgeline Municipal," "Copper Ridge" and "Willow Creek" do not exist, and
neither does the reviewer.

That is deliberate. Section 7 of the brand spec says never fabricate testing you
didn't do — so inventing 14 rounds with a *real* driver would have broken the
site's own ethics rules on day one. The sample reviews exist to show the
templates, the voice, the rating scale and the disclosure treatment in a real
layout.

**Before you publish:** replace the reviews with gear and courses you have
actually tested, and swap the reviewer identity (see below). Each page carries
an HTML comment saying the same thing, and the footer carries a visible
"Sample content" line — delete that line once the content is real.

---

## What's here

```
site/
├── index.html                     Homepage — hero, trust bar, featured review,
│                                  filterable review grid, rating scale, signup
├── gear.html                      Product review index (filter by category)
├── courses.html                   Course review index (filter by type)
├── how-i-review.html              Testing standard, rating scale, ethics &
│                                  disclosure policy, FAQ
├── about.html                     Reviewer bio, what's in the bag, contact
├── reviews/
│   ├── talon-gx2-junior-driver.html          Product · 4/5
│   ├── cypress-vane-2-golf-balls.html        Product · 4/5
│   ├── sandpiper-trailhead-stand-bag.html    Product · 3/5
│   ├── kestrel-r1-rangefinder.html           Product · 4/5 · free-gear disclosure
│   ├── tempoline-swing-stick.html            Product · 2/5
│   ├── ridgeline-municipal.html              Course  · 4/5
│   ├── copper-ridge-learning-center.html     Course  · 5/5
│   └── willow-creek-golf-club.html           Course  · 3/5
└── assets/
    ├── css/style.css              One stylesheet, design tokens at the top
    └── js/site.js                 Mobile nav, star rendering, card filters
```

No build step, no npm install, no frameworks. Open `index.html` in a browser and
it works. (For local testing, `python3 -m http.server` from inside `site/` is
slightly nicer than `file://`.)

The eight reviews are chosen to cover every state the design has to handle:
both templates, a 5-star, a 2-star, and a review of a product that was provided
free so the disclosure banner is visible in situ.

---

## How the brand spec maps onto the code

| Spec section | Where it lives |
| --- | --- |
| Identity, voice | All review copy; `about.html` |
| Product review template | `reviews/talon-gx2-junior-driver.html` and the four other product pages |
| Course review template | `reviews/ridgeline-municipal.html` and the two other course pages |
| Rating system | `how-i-review.html#ratings`, plus the scale block on the homepage |
| Ethics & transparency | `how-i-review.html#ethics`; the `.disclosure` banner on the Kestrel review |
| Formatting & SEO | Title patterns, `<meta name="description">`, Review JSON-LD on every review page, Quick Take near the top, short paragraphs, closing CTA line |
| Do's and don'ts | Every review compares to 1–2 realistic alternatives, prices against value, and notes junior-specific sizing |

Every review page ends with a call-to-action line, and every one lists at least
one downside — including the 5-star course review.

---

## Rebranding it (the 5-minute version)

Two names are used throughout: the site name **The Junior Bag** and the reviewer
**Caden**. Find-and-replace both across `site/`:

```bash
cd site
grep -rl "The Junior Bag" . | xargs sed -i 's/The Junior Bag/YOUR SITE NAME/g'
grep -rl "Caden" . | xargs sed -i 's/Caden/REVIEWER NAME/g'
```

Then update by hand:

- The reviewer's age (`, 15`), region, and stats — `index.html` hero, `about.html`
- Contact addresses — `about.html#contact` (currently `@thejuniorbag.example.com`)
- `<link rel="canonical">` and `og:` URLs in every `<head>`
- The avatar initial — the letter inside `<span class="avatar">`
- The footer's "Sample content" line, once your content is real

### Colours and type

All design tokens are at the top of `assets/css/style.css` under `:root` —
change the greens, the lime accent, the sand/cream neutrals, the type scale and
the radii in one place and the whole site follows.

Fonts are Outfit (headings) and Inter (body), loaded from Google Fonts with
system fallbacks. Swap the `<link>` in each `<head>` and the two `--font-*`
tokens to change them.

---

## Adding a new review

Copy the closest existing review page and edit it. The pieces to update:

1. `<title>`, `<meta name="description">`, canonical/OG URLs
2. The JSON-LD block in `<head>` — name, rating, date
3. Breadcrumb, category chip, `<h1>`, lede, byline date and read time
4. The `.disclosure` block — **delete it** if you bought the product yourself,
   keep it if the item was free or discounted
5. `.quick-take`, then the template sections in order
6. `.rating-badge`, the sidebar "At a glance" list, and the "Compared to" panel
7. The three related-review cards at the bottom

Then add a card for it on `index.html` and on `gear.html` or `courses.html`:

```html
<a class="card" href="reviews/your-slug.html"
   data-review-card data-type="gear" data-category="drivers">
  <div class="card__cover"><span class="chip">Driver</span>
    <svg viewBox="0 0 24 24"><use href="#i-driver"></use></svg></div>
  <div class="card__body">
    <h3 class="card__title">…</h3>
    <p class="card__take">…</p>
    <div class="card__meta">
      <span class="rating-inline"><span class="stars" data-rating="4"></span> 4/5</span>
      <span>Jul 2026</span>
    </div>
  </div>
</a>
```

`data-type` and `data-category` drive the filter buttons. Stars are rendered
from `data-rating` by `site.js`, and the numeric "4/5" sits next to them in the
HTML so the rating is still readable without JavaScript.

Icons come from an inline `<svg>` sprite at the top of every page
(`#i-driver`, `#i-ball`, `#i-bag`, `#i-tech`, `#i-aid`, `#i-course`, plus UI
icons). It's inlined per page rather than shared so the site works from
`file://` with no server. If you add a symbol, add it to every page's sprite —
or move the sprite into a shared include once you're on a platform that has
them.

---

## Notes for Framer / Zite import

- **Self-contained.** No bundler, no imports beyond the Google Fonts link.
  Everything else is relative paths inside `site/`.
- **Semantic and repetitive on purpose.** Cards, callouts, spec lists and rating
  badges use the same class names everywhere, so they map cleanly onto reusable
  components.
- **Two page archetypes** to turn into templates: the review page
  (`reviews/*.html` — article + sticky sidebar) and the index page
  (`gear.html` / `courses.html` — page head + filter bar + card grid).
- **The three JS behaviours** (mobile nav, star rendering, filtering) will
  likely be replaced by native platform features. If the filters get replaced,
  keep `data-type` / `data-category` as a CMS field.
- **The signup form is a stub.** `site.js` intercepts the submit and shows a
  note — wire it to a real list or drop in the platform's form component.
- **Sitemap/robots aren't included** because the URLs are placeholders; generate
  them on the host once the real domain exists.

---

## Accessibility and quality checks done

- Skip link, landmark elements, `aria-current` on the active nav item
- Star ratings carry `role="img"` and an `aria-label`, with a text rating beside them
- Filter buttons use `aria-pressed`; the mobile nav toggle uses `aria-expanded`
- No horizontal overflow at 390px or 1280px on any page
- All internal links and anchors verified to resolve
- `prefers-reduced-motion` and print styles included
