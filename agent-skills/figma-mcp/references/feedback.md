# The user's feedback — refine, change the reference, or a new direction

What the user says about a design decides how much changes. Read it for **intent** and **scope** first; change the
narrowest thing their words allow; never offer again what they turned down.

## 1. Intent and scope

| They say | Intent | What you do |
|---|---|---|
| "الهيرو مزدحم", "الكروت تقيلة", "كبّر العنوان", "more whitespace" | **refine** | `edit` the built design, same references (multi-reference.md §6) |
| "ضيف قسم الأسعار" | **add** | analysis rows for the new section → its own board → merge → build |
| "مش عاجبني الهيرو، غيّره", "جرّب حاجة تانية للأسعار", "غيّر الريفرنس" | **change the reference** of that section | §2 |
| "مش عاجبني الاتجاه ده", "مش ده الستايل خالص" (no section named) | **new direction** for the page/product | §3 |
| "خلّي الألوان", "الهيدر حلو سيبه", "keep the cards" | **keep** | `brief` append `Keep: <scope> — <what>`; later work must respect it |
| "شيل قسم الآراء" | **remove** | ask once if the section isn't clear; then `edit` delete (→ Trash) |
| "رجّع القديم" | **restore** | `edit` restore from Trash |
| "تمام", "حلو كده", "موافق" | **approve** | record it (`brief` append) — no change |

- **Scope: the narrowest the words name** — a component ("الزرار") → a section ("الهيرو") → a page ("الهوم") →
  the product. "الهيرو ممل" is the hero, not the page. Unrelated sections are not touched.
- Arabic section words → ids: الهيرو/الواجهة → `hero`, الهيدر/الناف → `nav`, الفوتر → `footer`, الأسعار → `pricing`,
  الخدمات → `services`, الأعمال/البورتفوليو → `work`, الآراء → `testimonials`, التواصل/الفورم → `contact`.
- **Mixed feedback splits**: "الألوان حلوة بس الكروت زحمة" → keep colors + refine cards.
- Refine vs. change: complaints about size, spacing, weight or one element are refine; "مش عاجبني", "غيّره", "حاجة
  تانية", "مش ده" about a whole section are a change of reference. Unsure and the change is costly (a rebuild) →
  confirm in one line ("أغيّر ريفرنس الهيرو كله ولا أخففه بس؟"); otherwise just do it.
- Say in one line what will change and what stays, then do it in the same turn.

## 2. Change the reference of a section

1. **Which references made it**: the section's line in the map (`brief` — `Home – Hero ← B skeleton · C headline`).
   The skeleton is what's being rejected; a borrowing only when the complaint is about it ("الهيدلاين ده مش حلو").
2. **Turn them down**: `references` with `for` = that board and `reject: [{letter, reason}]` — the reason in the
   user's words. It goes into the brief as `Rejected: …` (that link is refused from then on, on every board) and the
   frame goes to Trash.
3. **Find different ones** — not the same thing again:
   - new queries from the analysis with a **different style angle** than the rejected one (rejected "dark, heavy" →
     try "light editorial", "airy minimal"), and the reason turned into what to avoid;
   - another source than the rejected one; nothing by the same author/site, nothing with the same layout family as
     the rejected skeleton (if a split hero was rejected, don't bring split heroes);
   - `references` with the new sources on the same board — letters continue (D, E…).
4. **Merge again for that section only** (multi-reference.md §1): new regions → `reference_crops` → crops. `Keep:` lines
   and the rest of the page win over the new references.
5. **Components**: reuse the existing ones; change a component only when the rejection was about it — then update
   it (a variant or an `edit` of the component), never a second look-alike.
6. **Rebuild that section only**: `build` with `replaceId` (the old one goes to Trash, restorable), the same
   identity, the page's one system (multi-reference.md §3). Update the map line in the brief.
7. Report: the section, the new map line, what stayed. One question: what to change.

## 3. A new direction for the page or product

1. Record it: `brief` append `Rejected direction: <scope> — "<reason>"` plus `references` `reject` for each section
   skeleton on the page's boards.
2. Ask once only if it is unclear whether the identity itself is rejected (colors/type) or only the layouts. Identity
   rejected → [identity.md](identity.md) §3 (change it in the tokens); layouts only → the identity stays.
3. New angles for every section board (§2 step 3, across all of them), merge, rebuild the page's sections with
   `replaceId`. The user wants to compare old and new → keep the old frame as `Home – Direction A` and build
   `Home – Direction B` beside it (design.md §10); the one not chosen goes to Trash.

## Rules
- **Never offer again what was rejected** — the link (the tool refuses it), and its close variants (same style
  angle, same layout family, same author). Check the brief's `Rejected` lines before every new search in that scope.
- Feedback changes only its scope; `Keep:` lines are binding until the user lifts them.
- Nothing is deleted outright: replaced versions and rejected references go to Trash.
- Rejection is normal, not failure: no apologies, no long explanations — a one-line acknowledgement and the new work.
