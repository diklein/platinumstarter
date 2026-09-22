# Case study guidance

How a `/designs` case study is put together on this site, and why. The principles come from
Design Better's portfolio guide ("How to build a portfolio that will get you a job",
designbetterpodcast.com, Aug 2026), which distills the Portfolio Club critiques with Matt D. Smith,
Bob Baxley, Daniel Burka, Brooke Hopper, Jared Erondu, Dan Harden, and Joey Primiani. The two
example studies (`ridge-capture`, `ridge-sync`, both for a fictional field-notes app)
follow every rule below; read them before writing a real one.

## The 13 principles

1. The work is the hero. Target 80 to 90% images, 10 to 20% text.
2. Your portfolio is a brochure, not a self-portrait. Its one job is to get you a conversation.
3. Lead with the result. Explain afterward.
4. Write for someone who has five minutes. Ten seconds above the fold.
5. Show the before. Impact is invisible without a baseline.
6. Say specifically what you do. Vague positioning filters you out of everything.
7. Show only the work you want more of. You will be hired to do whatever is on the page.
8. Attach numbers, and admit what went wrong. Both signal seniority.
9. Give credit precisely, and be generous with it.
10. Typography is the tell.
11. Let personality through.
12. Make it trivial to update.
13. Show that you can use the new tools.

Principles 10 through 12 are the template's job: the type system, the personal sections
(photos, books, podcasts, about), and the write-in-Markdown, push-to-publish pipeline. The
rest are yours, study by study.

## The anatomy

One shape for every study, so a reader who has seen one knows where to look in the next:

| Section | What goes there | Principle |
| --- | --- | --- |
| Description (frontmatter) | The quantified outcome in one line. It is the card, the search result, and the social card. | 3, 4 |
| Opening | The result, then one line on the problem. Never a job title first: "hands-on" beats "responsible for". | 3, 6 |
| `DesignDetails` | Role, team, timeline, platform, tools, outcome: the facts, so the prose does not have to carry them. | 4 |
| The inherited state | What you started from, shown, not described. A screenshot of the old thing beats a paragraph. `BlinkComparator` is built for before/after. | 5 |
| The work | Mostly images, captioned. Process artifacts (diagrams, plans, org charts) support the product story; they never replace the product. | 1 |
| Results | Numbers, with the era they belong to. Cross-check them against your other studies; hiring managers do. | 8 |
| What went wrong | One honest section. "I was wrong about X" is the sentence that reads as seniority. | 8 |
| Credits | Names and roles, precisely. Quote an executive only with attribution (a linked profile, or role plus company at minimum). | 9 |

Optional and worth it: a two to three minute walkthrough video of your strongest study
(`Video` with a poster). For anyone leading teams it demonstrates presentation before an interview
slot is spent, and you can do twenty takes.

## Rules the site enforces or assumes

- Never password-gate a study you want read. The panel's compromise for confidential work is a
  URL key that lets the right people through without a login; `DESIGN_PASSWORD` exists for the
  rare study that must stay behind one.
- Results are outcomes, not intentions. "Users build confidence that..." is a design goal; report
  the measured result or retitle the block "Design intent".
- Stale present tense ages a study fastest ("Since I now work at..."). Write in the past.
- Each study lives at `src/content/designs/<slug>.mdx` with an entry in `src/lib/designs.ts`
  (hero image or video, dates, `example: false` for real work). `toc: true` for long ones.
- The same copy rules as posts: your voice, your facts, no em dashes.

## Before publishing a study

- [ ] The description states the result with a number.
- [ ] The first screen shows the product, not a paragraph.
- [ ] The before state is on the page.
- [ ] Every figure has a caption a five-minute reader can follow on its own.
- [ ] Every number has an era and matches the other studies.
- [ ] One section says what went wrong.
- [ ] Everyone who did the work is named.
