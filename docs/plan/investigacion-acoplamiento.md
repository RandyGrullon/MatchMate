## 1) Coupling map

About 40% of the source is bowling-specific. Roughly 5.5K lines are fully bowling and about 1K more are partly bowling, out of 16.1K lines of non-test source. 34 files use the `BowlingEvent` type, 25 import `src/lib/stats.ts`, and there are 43 branches on `type === 'torneo' | 'practica'`.

| Area | Files | Class | What ties it to bowling |
|---|---|---|---|
| Auth, accounts, superadmin | `src/lib/auth.tsx`, `firebase.ts`, `admins.ts`, `pages/AccountPage.tsx`, `SuperAdminPage.tsx` | GENERIC | nothing |
| Leagues, members, invites, roles, linking an account to a player | `src/lib/data.ts` (createLeague, joinLeague, ensurePlayer, claimPlayer, linkAccountToPlayer, unlinkAccount, removeMember, setMemberRole/Scorer, invites), `league.tsx`, `LeagueShell.tsx`, `InviteCard.tsx`, `QrCode.tsx`, `JoinPage.tsx` | GENERIC | nothing |
| Event container: RSVP, per-event team CRUD, delete, calendar, schedule | `data.ts` (setRsvp, addTeam/renameTeam/applyTeams/deleteTeam, deleteEvent), `calendar.ts`, `schedule.ts`, `WeekCalendar.tsx`, `NextPracticeCard.tsx`, `AnnouncementCard.tsx` | GENERIC | only the two event types torneo/práctica |
| "Is it being played now" | `live.ts` liveInfo/liveGames, `LiveNow.tsx` | GENERIC | nothing |
| Notifications and push | `notifications.ts`, `Notifications.tsx`, `NotificationsOptIn.tsx`, `push.ts`, `pushKey.ts`, `scripts/push/recordatorios.ts`, `.github/workflows/recordatorios.yml` | GENERIC | the script reads only date/type/name |
| Social, suggestion box, rate limits | `data.ts` (setReaction, addComment, sendSuggestion), `social/Social.tsx`, `SuggestionBox.tsx`, `SuggestionsPanel.tsx`, `pace.ts`; in the rules: socialOk, reactions, comments, limits, suggestions | GENERIC | keyed by entryId |
| Photo storage and background scan queue | `image.ts`, `PhotoPicker.tsx`, `PhotoModal.tsx`, `data.deleteOldPhotos`, `scanJobs.ts` (the scan function is injected through `scanDeps`), photos rules | GENERIC | nothing |
| Generic helpers | `stats.ts`: rank, slots, firstFreeSlot, normalizeName/nameSimilarity/bestMatch, balancedTeams (takes a value function) | GENERIC | nothing |
| Submission approval flow | `data.ts` submitGames/rejectSubmission and the pendiente→aprobado/rechazado states | GENERIC flow, SPORT-SPECIFIC payload | the flow is generic; the payload is `scores`/`frames` |
| UI kit, theme, tour engine, PWA | `ui.tsx`, `feedback.tsx`, `theme.ts`, `Tour.tsx`, `AppearanceCard.tsx`, `GestureGuards.tsx`, `PwaPrompts.tsx`, `CreateMenu.tsx`, `format.ts` | GENERIC | `format.ts` typeLabel/eventLabel only know torneo/práctica |
| Branding | `index.html` (title, description, pins-and-ball splash), `public/manifest.webmanifest`, `Shell.tsx`, `Logo.tsx`, `ui.tsx` (bowling-ball loader), `LoginPage`/`HomePage` ("Ligas y torneos de boliche"), `backup.ts` file name | GENERIC-WITH-LABELS | Manifest `id` is "/", so renaming the app does not orphan installed PWAs. Keep the `bowlingx:*` / `bowlinx:*` localStorage keys (theme, tours, drafts, score-entry mode). |
| Venue and other copy | `LeagueFormModal.tsx` and `AdminPage.tsx` ("Bolera"), `reminders.ts` ("¡Nos vemos en la bolera!", "Anota tus juegos"), `tours.ts` (pines/teclado/promedio), `notifications.ts` ("tu juego"), `Social.tsx` quick replies ("¡Buena serie!"), `LeaguesPage.tsx` (no sport badge or filter) | GENERIC-WITH-LABELS | text only |
| Scoring engine | `src/lib/bowling.ts` (frames, X and /, 10th frame, replaceRoll, pin masks, frameStats) | SPORT-SPECIFIC | all of it |
| Score entry UI | `components/frames/FrameEditor.tsx`, `FramesGrid.tsx`, `PinDeck.tsx`, `ScoreEntryModal.tsx`; `ScoreInput.tsx` and `NumberCell.tsx` (max=300) | SPORT-SPECIFIC | `ScoreEntryModal` is only a wrapper but is hard-wired to `{score, frames}` |
| Stats core | `stats.ts`: MAX_SCORE/isValidScore (0–300); calcHandicap/entryHandicap ((base − average) × %, per game, torneo only); Line/entryLine (sum, floored average, high, higher is better); individualValue (torneo: total or scratch; práctica: average); teamLines (pins + handicap per game); playerStats (pins; highSeries = 3 games in a row within one event); effectiveAverage; MIN_RANK_GAMES=6; category/DEFAULT_CUTS [200,175,160] | SPORT-SPECIFIC | all of it |
| Types | `types.ts`: BowlingEvent (games ≤10, hcpBase, hcpPercent, individualRankBy/teamRankBy, categoryCuts, teamSize, teams per event); Entry (average, handicapOverride, scores[], photos[], frames); GameFrames; Submission (scores, scanned, frames); LiveScore.scores; Player.averageOverride | SPORT-SPECIFIC | all of it |
| Writes | `data.ts`: createTournament defaults (3 games, 230/80%, cuts), practiceForDate defaults, addEntries and fetchEffectiveAverages (frozen average), saveGame, saveVerifiedGames, approveSubmission (keeps frames only if `scoreGame(frames)` equals the approved value), addEventGame (≤10), publishLiveScores | SPORT-SPECIFIC | all of it |
| Phone draft | `draft.ts` (`values: string[]` plus `frames`) | SPORT-SPECIFIC shape, generic mechanism | shape only |
| AI photo scan | `scan.ts` (PROMPT and schema: esPantallaDeBoliche, scratch Game 1..n, 0–300, handicap column), `scan-result.ts` (0 means not played, cross-check against the total), `ScanModal.tsx` (screen handicap, "0 a 300") | SPORT-SPECIFIC | all of it |
| Live board rows | `live.ts` liveRows (adds up pins, sorts high to low), `LiveBoard.tsx` (J1..Jn cells) | SPORT-SPECIFIC | all of it |
| Event screens | `EventPage.tsx` (tabs inscritos/equipos/juegos/clasificación; "Hcp x% de y · N juegos"), `event/GamesTab.tsx`, `StandingsTab.tsx` (scratch/handicap toggle, "Mejor juego", "Prom."), `RosterTab.tsx` (average, handicap, category), `TeamsTab.tsx` (sums of average and handicap), `AutoTeamsModal.tsx` (balances by average and category), `CategoryBadge.tsx`, `MyGamesPanel.tsx` (session average and series, pines/teclado/total modes, add one more game), `GameDetailModal.tsx` (strikes, spares, opens), `AddPlayersModal.tsx` (average on enrol) | SPORT-SPECIFIC | `AddPlayersModal` only lightly |
| Event config | `EventFormModal.tsx` (games 1–10, handicap base and %, rank-by, category cuts 0–300, team size) | SPORT-SPECIFIC | all of it |
| Submissions and approvals | `SubmitGamesModal.tsx` (J1..Jn 0–300, frames, scanned row), `pages/ApprovalsPage.tsx` (typed vs scanned per game, FramesGrid, firstFreeSlot) | SPORT-SPECIFIC | all of it |
| Rankings and profiles | `RankingPage.tsx` (average, best game, best series, attendance; minimum 6 games), `PlayerPage.tsx` (average, "Mejor serie (3)", strikes/spares, GameChips), `PlayersPage.tsx` (fixed average 0–300), `GlobalStats.tsx`, `ScoreChart.tsx` (0–300 axis, "pinos"), `LeagueHomePage.tsx` ("tu promedio", Hcp), `GamesFeedPage.tsx` (sorted by series, 300 = perfect-game badge, "Mejor serie") | SPORT-SPECIFIC | `GlobalStats` adds up all leagues into one average plus strikes, so a second sport would mix pins with goals |
| Excel | `exportExcel.ts`: Individual (Categoría/Promedio/HCP/Juego n/Total scratch/Total con HCP), Equipos, Resultados; league Ranking (Pinos, Mejor serie), Juegos (Serie, HCP), Eventos. Also `LeagueExcelButton.tsx` | SPORT-SPECIFIC | all of it |
| Security rules | `firestore.rules`: okScore/okScores (int 0–300, ≤10, unrolled) on live, submissions and scanned; entries scorer `onlyChanged(['scores','photos','frames'])`; practice games +1 up to 10; `validLeague` uses `keys().hasOnly(...)`; `isScorer` only when kind=='torneo' | SPORT-SPECIFIC | Today a league doc with a `sport` field is rejected; the rules test "campos raros" confirms it. |
| Importer | `scripts/importar-torneo.mjs` (bowling Excel JSON) | SPORT-SPECIFIC | all of it |

**Inconsistencies the refactor must not "fix" by accident.** The team's per-game total is computed four different ways:
- `teamLines.perGame` always adds handicap.
- The `GamesTab` team header always adds handicap.
- The `StandingsTab` team row adds handicap only when the toggle is on handicap.
- The Excel "Equipos" per-game columns are scratch only, while the total column follows the event's rule.

Also, `StandingsTab` and `exportExcel` each re-implement `individualValue` / useHcp. The refactor should either reproduce each of these outputs exactly or change them on purpose.

## 2) Moving to a sport-agnostic data model

**What must become sport-agnostic:**
- `event.games` and the per-slot limits (≤10, 0–300)
- `entry.scores[]` and `photos[]` (per-slot verification)
- `frames`
- The handicap fields (`hcpBase`, `hcpPercent`, `handicapOverride`, `average`, `averageOverride`)
- `categoryCuts`
- `playerStats` / `PlayerStats` shape `{games, pins, autoAverage, high, highSeries}`
- `Submission.scores/scanned/frames` and `LiveScore.scores`
- The Excel sheets
- The scan prompt
- `liveRows`
- The `okScores` rule

**The proposal. No migration: every change is an optional field or a new collection.**

**A. `League.sport?: SportId`.** A missing value means `'boliche'`. It is set at creation and cannot be changed afterwards. A multi-sport club uses one league per sport.
- `SportId` = `'boliche' | 'padel' | 'pickleball' | 'baloncesto' | 'futbol' | 'futsal' | 'golf' | 'natacion' | 'tenis'`.
- Fútbol campo and sala get separate ids (their periods, fouls and points rules differ, and their stats must never mix) but share one module.
- The global profile groups stats by sport.

**B. Three result types.** Each sport module declares one:

| Type | Sports | Where results live | One "slot" is | Better | Verification |
|---|---|---|---|---|---|
| `serie` | boliche, golf, natación | `entries`, unchanged: `scores[]` + `photos[]`, plus an optional `detail` map per slot | juego / hoyo / prueba | boliche: higher. Golf: fewer strokes, net = gross − handicap (Stableford points are higher-is-better). Natación: lower time, stored as an int in hundredths; DQ/DNS goes in `detail[i].status` | `photos[i]`, as today |
| `partido` | baloncesto, fútbol, futsal | new `matches` collection | period (half or quarter) | more goals or points | match photo (the acta), opponent confirmation, or admin |
| `sets` | tenis, pádel, pickleball | new `matches` collection | set → games (→ points while live) | more sets won | same as `partido` |

**Event changes.** Keep every existing field and rename the type through an alias (`type BowlingEvent = SportEvent`) so the 34 files don't all change at once.
- Add optional `format?: string`: serie, round-robin, eliminatoria, grupos+eliminatoria, americano, stroke, stableford, matchplay, scramble, heats.
- Add optional `config?: map` with each sport's settings. Examples:
  - golf: `{holes, par[], rating, slope}`
  - natación: `{pruebas:[{id, label:'50 libre', relevo?}], carriles}`
  - tenis: `{bestOf:3, games:6, tbAt:6, superTB, noAd}`
  - pádel: tenis settings plus `{puntoOro, americanoPts}`
  - pickleball: `{to:11, winBy:2, rally}`
  - baloncesto: `{periods:4, min:10, win:2, loss:1}`
  - fútbol/futsal: `{halves, min, win:3, draw:1, faltasAcum}`
- `games` stays as the slot count for `serie` sports (golf 9 or 18) and is 0 for match sports.
- Bowling's own fields (hcp, rankBy, cuts, teamSize, `teams` per event) stay top-level and only the bowling module reads them.

**Entry changes (`serie` sports only).**
- Unchanged fields.
- `average` becomes the rating frozen at enrolment: bowling average, or golf handicap index (a decimal is fine).
- `handicapOverride` is reused.
- `frames` stays bowling-only.
- New optional `detail?: {[slot]: map}`: golf putts/fairway, swim splits, dq/dns.

**Player changes.**
- `averageOverride` becomes the fixed rating: bowling average or golf index.
- New optional `sportData?: {dorsal, posicion, nacimiento, sexo}`, needed for swimming age categories and football shirt numbers.

**New `leagues/{lid}/matches/{mid}` document:**
```
{ eventId, round, group?, court?, order,
  sides: [{teamId|null, playerIds[]}, {teamId|null, playerIds[]}],
  playerIds: [...both sides],   // flattened: rules `in` checks + array-contains query "my matches"
  status: 'programado'|'en-juego'|'propuesto'|'final',
  score: {a,b}|null,            // goals/points or sets won
  periods?: [{a,b}],            // Firestore has no nested arrays -> arrays of maps
  sets?: [{a,b,tbA?,tbB?}],
  live?: {a,b,server?,clock?},  // current point/clock, published throttled
  stats?: {[playerId]: {pts?,t3?,reb?,ast?,goles?,asist?,ta?,tr?}},
  winner: 0|1|null, verify: photoId|'sin-foto'|'rival'|'importado'|null, proposedBy?, updatedAt }
```

**Other new collections, used only by new sports:**
- `leagues/{lid}/teams/{tid}` = `{name, playerIds[], color?}` for season-long teams. Bowling keeps `event.teams` per event. Pádel and tenis doubles put the players directly in `sides`, because americano rotates partners.
- `leagues/{lid}/summaries/{eventId|season}` holds the standings, written in the same batch that finalizes a match. Viewers read 1 doc instead of N matches. This matters because the budget is already 42–52K reads/day.

**Match sports reuse existing flows:**
- A player-proposed result is `status: 'propuesto'`, then the other side or an admin confirms. This replaces submissions for matches.
- The match document itself is the live document, so no `live` docs are needed.
- `serie` sports keep submissions and live, with limits per sport.

**Stats come from a sport module.** A registry in `src/sports/index.ts` returns the module through `sportOf(league)`; modules are lazy-loaded so the bowling bundle doesn't grow.
```ts
interface SportModule {
  id; label; icon; venueLabel /* Bolera|Club|Cancha|Campo|Piscina */; kind: 'serie'|'partido'|'sets';
  units: {slot: 'juego'|'hoyo'|'prueba'|'partido'; value: 'pinos'|'golpes'|'tiempo'|'puntos'|'goles'};
  better: 'alto'|'bajo'; limits: {maxSlots, min, max};   // must mirror the rules map (contract test)
  format(v): string; parse(s): number|null;
  defaults: {event(type): EventInput};
  EventConfigFields; ResultEditor; LiveCell | MatchCard;   // React, lazy
  line?(entry, event, drafts): Line;                        // bowling = current entryLine
  eventStandings(event, data): {columns, rows, teams?};
  playerStats(data): {played, pending, rating: number|null, metrics: Record<string, number|null>};
  rankingMetrics: {key, label, value(row), minPlayed?}[];
  liveRows(event, data): LiveRow[]; feedBadges(x): string[];
  excel: {event(...): Sheet[]; league(...): Sheet[]};
  scan?: {prompt, schema, parse};                           // bowling now; golf scorecard / acta later
  categories?: {cuts, better}; teamBalanceValue?(x): number; // reuses balancedTeams
}
```
The bowling module wraps today's `bowling.ts`, `stats.ts` functions, frames components, scan prompt and Excel builders, moved without rewriting.

**Rules changes:**
- `validLeague`: allow a `sport` key, with `d.get('sport','boliche') in [the 9 ids]`; on update, the sport must stay equal (default `'boliche'` on both sides).
- `okScores` becomes per-sport:
  ```
  let m = {'boliche':[10,0,300],'golf':[18,1,20],'natacion':[10,1,360000]}[league(lid).get('sport','boliche')]
  ```
  Unroll the per-slot check to 18 slots. For bowling this behaves exactly as today, so old clients and their offline queued writes still pass.
- Practice "+1 game" only where the sport allows it.
- Entries scorer: `onlyChanged` also allows `detail`.
- `isScorer` extended to leagues for match sports (referee/scorer). This is a deliberate behaviour change and flips the existing test "en una liga no hay anotadores".
- New `matches` block:
  - read: canRead.
  - create/delete: admin.
  - update: admin or scorer, or a participant (`myPlayer(lid) in resource.data.playerIds`) limited to the score/live/status fields, with status only 'en-juego' or 'propuesto'.
  - Confirming a result: the other side or an admin.

**Live on court.** At the current ~42–52K reads/day, writing every point would break the free plan. One tennis match is about 150 points; 150 writes × 40 people watching = 6,000 reads. Ten courts in one night is about 60K, over the 50K/day limit. So point state stays on the scorer's phone (offline-first, like the bowling draft) and is published only:
- at the end of each game or set for tenis, pádel and pickleball,
- on each goal for fútbol,
- at the end of each period, or every ~60 s at most, for baloncesto.

## 3) Effort to extract the sport-module interface with bowling still working

Solo developer with AI:

| Work | Person-days |
|---|---|
| Safety net first: turn the four team-sum paths and the StandingsTab/GamesTab calculations into pure functions with characterization tests; add a golden fixture (2 practices + 1 tournament with teams, handicap and categories) covering standings, ranking, playerStats, and Excel headers and rows. (`scripts/datos` only holds `vapid.json`, so there is no real 2025 data to use; the fixture is built by hand.) | 1.5 |
| Types (SportId, `League.sport`, SportEvent alias), registry, SportModule interface, `src/sports/boliche/` built by moving bowling.ts, frames/*, scan prompt, handicap, categories | 1.5–2 |
| Split `stats.ts` into generic helpers and the bowling module; `data.ts` defaults, approve check, limits, fetchEffectiveAverages taken from the module | 2 |
| Event UI dispatches through the module: EventPage tabs, GamesTab, StandingsTab, RosterTab, TeamsTab, MyGamesPanel, GameDetailModal, LiveBoard, ScoreInput/NumberCell/ScoreChart limits | 3–4 |
| Pages: RankingPage, PlayerPage, PlayersPage, GlobalStats (group by sport), GamesFeedPage, ApprovalsPage, SubmitGamesModal, ScanModal, LeagueHomePage, EventFormModal fields, LeagueFormModal sport picker (fixed after creation), CreateMenu, LeaguesPage badge | 2.5–3.5 |
| Excel: a generic writer plus sheets from the module | 0.5–1 |
| Labels: venue name, tours, reminders, notifications wording (brand name change is a separate decision) | 0.5–1 |
| Rules (`sport`, fixed sport, per-sport limits, `detail`) plus about 10 new emulator tests; deploy rules before the app | 1–1.5 |
| Manual QA on the emulator and a phone: offline, live board, photo scan, approvals, Excel, the scorer role; watch reads | 1–1.5 |
| **Total** | **≈13–18** |

That is only the extraction. As a rough extra reference, the new sports would be:
- `serie` family: golf 6–9 days, natación 6–9 days.
- `partido` family: fútbol + futsal first, 10–14 days (matches, teams, fixtures, standings, live scoreboard), then baloncesto +5–7.
- `sets` family: tenis first, 8–12 days, then pádel +4–6 including americano, then pickleball +3–5.

**Main regression risks and how to reduce them:**
1. **Bowling numbers change silently:** rank ties, floored average, handicap per game, the four team-sum paths, highSeries within one event only. Mitigation: the characterization and golden tests are written first and must pass unchanged after the move.
2. **Deploy order and stale PWAs.** If the app writes `sport` before the new rules are deployed, creating a league fails. Old cached app versions would show a non-bowling league as bowling. Mitigation:
   - Deploy the rules first.
   - Ship the bowling-only refactor and let it run for a couple of weeks before enabling any new sport.
   - Rely on the per-sport rules limits to reject bowling-shaped writes into other sports' leagues.
   - Use the PwaPrompts update prompt.
3. **Offline queued writes and localStorage drafts** from the old version on a league night. Mitigation: `okScores` behaves exactly as before for bowling, the draft shape (`values` + `frames`) and the `bowlinx:*` / `bowlingx:*` keys stay, and only optional fields are added.
4. **The scan prompt and schema must stay byte-identical.** The 6 scan-result tests cover only the parser, not what the model returns.
5. **Excel columns and their order** are what the owner uses. Mitigation: snapshot the headers.
6. **Read and bundle budget.** The refactor must not add any listener, and modules must be lazy-loaded.
7. **Rules limits.** Each rules request may make at most 10 `get`/`exists` calls, and dependent reads are billed. Adding the league lookup keeps the live and submissions rules under 10; the league doc is already read by `canRead` in many requests.

**What the existing tests cover:**
- **107 unit tests.**
  - 58 touch bowling: bowling.test 24, stats.test 16, live.test 10, scan-result 6, exportExcel 2. The pure functions move with little or no change, so they should pass after the move with only import-path changes; that is the main guard.
  - 49 are sport-agnostic: notifications 16, schedule 8, reminders 7, scanJobs 7, calendar 5, pace 3, theme 3. They should never go red; if one does, bowling logic has leaked somewhere.
  - Gap: there are no component tests, so the EventPage, GamesTab, StandingsTab, MyGamesPanel and ApprovalsPage wiring and the duplicated in-component calculations are unprotected. That is why the safety net comes first. Add a contract test run against every registered module: limits match the rules map, defaults are valid, empty data doesn't crash, standings are deterministic.
- **72 emulator rules tests.**
  - 23 involve game values: juegos 10, en vivo 6, anotadores 6, juegos de la sesión 1. They must keep passing as-is, which proves bowling behaves the same under the per-sport `okScores`.
  - 49 cover roles, linking, social, suggestion box, visibility, accounts and push, and should not change at all.
  - "crear ligas" / "campos raros" will need a positive case for `sport` and a negative case for an unknown sport.
  - The test "en una liga (no torneo) no hay anotadores" is expected to flip when scorers are extended to leagues.
  - New tests needed for: the sport is fixed after creation, a league without `sport` counts as boliche, golf's 18-hole limits, and the `matches` rules.