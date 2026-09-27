## Research: scoring, formats and rankings for the 7 new sports (amateur level, with a focus on the Dominican Republic)

### 0. Executive summary
- The 8 sports (bowling plus the 7 new ones) fit into **5 scoring families**:
  - **F1 pins per game:** boliche (bowling). It already exists; don't touch it.
  - **F2 racket match by sets/games:** pádel, tenis, pickleball. One configurable engine.
  - **F3 team score with a roster and events:** fútbol 11, fútbol sala (futsal), baloncesto. One engine with events.
  - **F4 strokes per hole, lowest wins:** golf.
  - **F5 time per race, lowest wins:** natación (swimming).
- **Demand in the DR amateur scene**, by fit with the app (adult league, weekly, members with phones): 1 Pádel, 2 Baloncesto, 3 Fútbol sala/11, 4 Pickleball, 5 Tenis, 6 Golf, 7 Natación.
- **Difficulty**, easiest first:
  - Pádel (it builds F2). After that, Tenis and Pickleball are almost free.
  - Golf.
  - Fútbol sala and Fútbol 11.
  - Baloncesto (full per-player box score).
  - Natación (full meet: races, heats, lanes, age groups, relays).
- **Main technical risk on Spark is live point-by-point scoring**, not storage.
  - Every change multiplies Firestore reads by the number of viewers.
  - Rough counts per match: 120–160 points in tenis/pádel, 150–250 events in baloncesto.
  - Example: 30 viewers × 200 events = about 6,000 reads for a single game, against a 50K/day limit that bowling already nearly uses up.
  - Options:
    - (a) Keep the event log on the device (offline) and publish a throttled live snapshot: one document per match, updated at the end of each game/period or every 10–30 s.
    - (b) Use Realtime Database for the live boards. It is free on Spark, charged by bandwidth: 1 GB stored, 10 GB/month downloaded. The catch is a hard cap of 100 simultaneous connections.
- **Verification without photos for racket sports and golf:** the opponent confirms the result (or the marker confirms the card) and it is approved automatically. This replaces the scoreboard photo and saves storage.
- **Handicaps and levels are shown as a manual number, with no integration.** The Dominican golf federation (FedoGolf) runs its golfers through GHIN, and DUPR is closed.
  - Golf: a WHS/GHIN handicap index.
  - Pickleball: a DUPR rating.
  - Pádel: a Playtomic-style level from 0 to 7.
  - Tenis: NTRP.
  - For racket sports, the app can compute its own internal Elo per league.

---

### 1. Sport by sport

#### PÁDEL (always doubles)
- **Scoring:**
  - Tennis-style points (15-30-40), sets to 6 with a tie-break at 6-6 (to 7, win by 2), best of 3 sets.
  - In amateur play the norm is **punto de oro** (golden point: at 40-40 one decisive point wins the game) and a **super tie-break to 10** (win by 2) instead of a third set.
  - From 01-01-2026 the FIP applies the **Star Point** in the pro game: at 40-40 advantage is played up to twice, then a golden point. It is optional for amateur play.
  - Serving: underhand, cross-court, two attempts; the service rotation is the same as tennis doubles.
- **Result to store:** the sets, e.g. `[[6,4],[3,6],[10,7]]`, plus a walkover flag (W.O.).
- **Who records it:** the players themselves; there is no referee in amateur play.
- **Live on-court screen:**
  - Two big halves: tap the pair that won the point.
  - Scoreboard: 15/30/40/AD, games, sets.
  - Who serves and from which side.
  - Undo; a reminder to change ends on odd games.
  - Punto de oro / Star Point selectable.
  - Keep the screen on, big buttons, works offline.
- **Standings (amateur leagues):**
  - Common points: W=3 / L=1 / no-show=0, or W=2 / L=0.
  - Tie-breakers, in order: matches won, head-to-head, set difference, game difference.
  - W.O. is recorded as 6-0 6-0.
- **Stats:** played/won/lost, win %, sets and games for/against, streak, record with each partner and against each opponent, level/Elo trend. Aces and winners do not matter in amateur play.
- **Levels:** Playtomic 0–7 (the de-facto reference in Spain and Latin America). In the DR, tournaments use categories A/B/C for men and B/C for women (United Capital Padel Tour 2025). Some circuits use 1ra–5ta.
- **Formats:**
  - League of fixed pairs by rounds (round robin).
  - Tournament by categories: groups, then a knockout bracket.
  - **Americano:** rotating partners, games to 16/21/24/32 points or played for a set time, points counted per player.
  - **Mexicano:** rounds paired from the live leaderboard.
  - King of the court; ladders/challenges; circuits with points for the round reached.
- **AI reading a photo:** low value, because the result is 3 numbers. It could read a bracket or draw sheet (medium). Better to rely on opponent confirmation.
- **DR context:**
  - A booming sport.
  - The Dominican federation joined the FIP in 2025; the Real Federación Dominicana de Pádel (RFDP) endorses tournaments.
  - UCPT 2025: more than 800 players over 4 stops.
  - Tournaments every weekend in Santo Domingo, Santiago, San Francisco de Macorís and Jarabacoa.
  - Competitors are mainly booking apps (Playtomic, Playbypoint).

#### TENIS (singles and doubles)
- **Scoring:**
  - 0-15-30-40, with advantage (AD) or **no-ad** (at 40-40 one deciding point).
  - Sets to 6 (win by 2) with a tie-break at 6-6 (to 7).
  - **Match tie-break to 10** (win by 2) in place of the deciding set, common in amateur and ITF play.
  - Short sets to 4 with a tie-break at 4-4 (ITF Appendix V).
  - Serve changes every game. In a tie-break: 1 point, then alternate every 2 points, change ends every 6 points.
  - In doubles, partners alternate service games.
- **Who records / live screen:** same as pádel, plus AD/no-ad and a singles mode.
- **Standings (amateur leagues):**
  - Common points: W=3 / L=1 or W=2 / L=1, depending on the league.
  - Tie-breakers: head-to-head, set difference, game difference.
  - Ladders/pyramids and Elo are also common.
- **Levels:** NTRP 1.5–7.0 in steps of 0.5 (leagues usually 2.5–5.0); UTR internationally; veterans categories +35/+45.
- **Formats:** ladder, groups (round robin), knockout brackets, team interclubs (several singles and doubles matches per tie), ranking circuits.
- **AI photo:** same as pádel, low value.
- **DR context:** Fedotenis (the national tennis federation) has 71 events in 2026, 32 of them for veterans. The adult amateur scene is club-based.

#### PICKLEBALL (singles, doubles, mixed)
- **Traditional (side-out) scoring:**
  - Only the serving team scores.
  - Games to 11 (win by 2); also games to 15 or 21.
  - Doubles: server 1 and server 2; a game starts at "0-0-2"; the score call is "server-receiver-server number".
  - The starting server serves from the right when their team's score is even.
  - Change ends in the deciding game at 6 (in a game to 11).
  - Matches are one game or best of 3.
- **Rally scoring (provisional in USA Pickleball's 2026 rulebook):**
  - A point on every rally; **no second server**.
  - Games to 11/15/21; the receiving team can win on game point.
  - Not allowed in some USA Pickleball national-level events.
- **Live screen:** simpler than tennis: two sides, score, and the server number (1/2). Side-out mode needs a "lost the rally" button that rotates the server.
- **Standings (USA Pickleball, round robin):**
  1. Head-to-head wins between the tied teams.
  2. **Point differential** over all games.
  3. Point differential in the head-to-head games.
  4. Total points scored.
- **Stats:** W/L, point differential, points for/against, record per partner.
- **Levels:** DUPR 2.000–8.000 (separate ratings for singles, doubles and mixed; closed API). The DR uses categories 3.0 and 3.5 (Copa Confraternidad 2026).
- **Formats:** pool play then bracket (single or double elimination), round robin with rotating partners (like americano), ladder leagues, MLP-style team leagues.
- **AI photo:** low value.
- **DR context:** growing fast.
  - Punta Cana International Pickleball Open 2026: 292 players from 18 countries.
  - A local national association (APRD) is active; DUPR supported the event.

#### BALONCESTO (teams of 5; 3x3 is optional)
- **Scoring (FIBA):**
  - 4 quarters of 10 minutes; 5-minute overtimes; baskets worth 1/2/3.
  - **5 personal fouls** and the player is out (technicals count toward the 5).
  - **Team fouls:** from the 5th in a quarter, 2 free throws. Overtime counts as the 4th quarter.
  - **Timeouts:** 2 in the first half, 3 in the second (no more than 2 in the last 2 minutes of the 4th quarter), 1 per overtime.
  - 3x3: game to 21 or 10 minutes; baskets worth 1 and 2; from 7 team fouls, 2 free throws; from 10, 2 free throws plus possession.
- **Who records:** the scorer's table (official scoresheet with running score, points and fouls per player, timeouts) plus a timekeeper. This is a **scorer** role, like the tournament scorer the app already has.
- **Live screen:**
  - Header: score, quarter, optional clock.
  - Grid of shirt numbers for each team.
  - Actions: +1/+2/+3, foul, timeout, substitution.
  - Undo the last event.
  - Personal foul counter (warning at 4 and 5).
  - Team fouls per quarter with a "bonus" alert; timeouts remaining.
- **Standings (FIBA):**
  - W=2, L=1, forfeit=0 (a forfeit is scored 20-0).
  - Tie-breakers: head-to-head results between the tied teams first, then point difference and points scored.
  - Amateur leagues commonly run a regular season, then playoffs (best of 3/5/7).
- **Stats:**
  - Minimum for amateur play: points, 3-pointers, fouls, games played.
  - Full: rebounds, assists, steals, blocks, turnovers, field goal/free throw percentages, per-game averages, personal highs; top-scorer table.
- **Levels:** no handicap; categories by age (open, veterans +35/+40, under-X), gender and division.
- **AI photo:** a photo of the electronic scoreboard gives the final score reliably. The official scoresheet is handwritten and dense: medium reliability (quarter scores and points per player possible), always with admin review.
- **DR context:** the deepest amateur scene.
  - Neighbourhood, club and provincial tournaments; the Torneo Superior de Baloncesto in the Distrito Nacional.
  - A veterans tournament in San Francisco de Macorís 2026 with 12 teams.
  - Scoring is mostly done on paper.

#### FÚTBOL 11 (campo)
- **Scoring:**
  - 2 × 45 minutes (amateur often 2×40, 2×35, or 2×30 for veterans).
  - Goals; yellow cards; red card (direct, or after 2 yellows).
  - Substitutions: 5 in the pro game; many amateur leagues allow unlimited or re-entry substitutions (configurable).
  - Knockouts: optional 2×15 extra time, then penalties (5 kicks, then sudden death).
- **Who records:** the referee (match report) or the league's scorer/delegate.
- **Live screen:**
  - Running clock per half plus added time.
  - Goal button: team, then player, then assist; the minute is filled in automatically.
  - Yellow/red card; substitution; undo; end of half; penalty shootout.
- **Standings:**
  - 3/1/0.
  - Tie-breakers vary by league: goal difference, goals for, head-to-head. The 2026 World Cup put head-to-head first. Fair-play points as a last resort (yellow −1, red −3/−4).
  - Must be configurable.
- **Discipline:** automatic suspensions for accumulated cards (typically 3 or 5 yellows = 1 match; red = at least 1 match, to be configured).
- **Stats:** goals (top-scorer table), assists, yellows and reds, matches played, clean sheets and goals conceded (goalkeeper), man of the match.
- **Levels:** by age category or division.
- **AI photo:** the final score is trivial; the handwritten match report (shirt numbers, goals, cards) is medium reliability.
- **DR context:** growing since 2012.
  - Pitches are rented at US$40–50 an hour.
  - An amateur platform already exists (cancha.do), plus youth leagues such as "7 League RD".
  - Fútbol 7 can be a configuration of this family (number of players and duration), not a separate sport.

#### FÚTBOL SALA / FUTSAL
- **Scoring (FIFA Futsal Laws of the Game 2025-26):**
  - 5 against 5 (including the goalkeeper).
  - 2 × 20 minutes of **stopped clock** (amateur often uses a running clock).
  - **1 timeout per team per half.**
  - Unlimited flying substitutions.
  - **Accumulated fouls per half:** from the 6th, a free kick from 10 m with no wall. The count resets at half-time; extra time counts with the second half.
  - A red card leaves the team one player short for 2 minutes or until it concedes a goal.
  - Penalty shootout: 5 kicks per team (up from 3 in 2025-26).
- **Live screen:** as fútbol 11, plus:
  - Start/stop stopwatch.
  - Accumulated-foul counter per team with an alert at 5.
  - Timeout per half.
  - 2-minute countdown for a player sent off.
- **Standings, stats, discipline:** same as fútbol 11.
- **DR context:** the national football federation (Fedofutbol) runs provincial and school futsal tournaments; futsal courts are often free to use.

#### GOLF (individual, pairs, teams)
- **Unit of play:** strokes per hole over 9 or 18 holes, each with a par and a **stroke index** (difficulty ranking of the hole).
- **Formats:**
  - Stroke play gross and net.
  - **Stableford:** points per hole relative to net par (net par = 2, net birdie = 3, net bogey = 1). This is the most common format in amateur club tournaments.
  - Match play: holes won; result like "3&2".
  - Four-ball (best ball of the pair).
  - Scramble (social events).
- **Handicap (WHS):**
  - Handicap index = average of the best 8 of the last 20 score differentials.
  - Score differential = (adjusted gross score − course rating) × 113 / slope + playing-conditions adjustment.
  - Course handicap = index × slope / 113 + (course rating − par).
  - Playing handicap = course handicap × allowance: 95% individual stroke play/Stableford, 100% singles match play, 85% four-ball stroke play, 90% four-ball match play; scramble 25/20/15/10% (4 players) or 35/15% (2 players).
  - Maximum score per hole for handicap purposes: net double bogey.
  - **In the DR:** FedoGolf has used GHIN since 2009, with 17 clubs and about 6,000 local golfers (an older figure), and has its own app.
  - So the app **should not compute the official index**. It should store the index the player types in and compute course handicap, net and Stableford.
- **Who records:** the "marker" (another player in the group) keeps the card; the player checks and signs it.
- **Live screen:**
  - A card per group (1–4 players), hole by hole.
  - A +/− stepper per player that starts at par.
  - Running total, +/− against par, Stableford points.
  - Live leaderboard with "holes played".
  - Optional putts.
- **Standings:**
  - Lowest net or gross, or highest Stableford.
  - Ties broken by **countback** (last 9, then 6, 3, 1 holes).
  - Season: order of merit (points by finishing position).
- **Stats:** handicap index (manual), best gross and net round, average strokes, Stableford points, eagles/birdies/pars, putts, holes in one.
- **Needs course data:** holes (par, stroke index) and tees (course rating, slope, par).
- **AI photo: high.** This is the best use case after bowling; commercial apps already read handwritten cards hole by hole (SnapCard, Scorecard AI).

#### NATACIÓN (individual and relays)
- **Unit of play:** a time (mm:ss.hh) per race.
  - A race = distance (25/50/100/200/400/800/1500) + stroke (freestyle, backstroke, breaststroke, butterfly, individual medley) + pool (25 m or 50 m; **personal bests kept separately**) + gender + age group.
  - Heats and lanes; seeding by entry time (fastest in the last heat and centre lanes).
  - Timed finals (usual in age-group meets) or prelims plus finals.
  - Statuses: DQ (disqualified), DNS (did not start), DNF (did not finish).
- **Age groups:**
  - CCCAN (the Central American & Caribbean swimming confederation): 11-12, 13-14, 15-17, 18+.
  - Younger groups: 8 and under, 9-10.
  - Masters in 5-year bands from 25-29, with age taken on 31 December.
- **Who records:** touchpads, or manual timekeepers per lane (1–3 stopwatches: middle time, or the average of 2) plus judges.
- **Live screen:**
  - Heat view with a row per lane.
  - One START button that starts a shared stopwatch; a STOP (and optional split) per lane.
  - Manual entry of mm:ss.hh; DQ/DNS toggles.
  - Results sorted automatically.
- **Standings:**
  - Place by time.
  - Team points by place (e.g. 9-7-6-5-4-3-2-1 with 8 lanes; relays double).
  - Medal table; records (club or meet).
- **Stats:** personal best per race and pool, progression over time, improvement %, medals, points.
- **AI photo:** high for printed results (meet-management software output) and electronic boards; medium for handwritten timer cards.
- **DR context:** the national aquatics federation (FEDDA, formerly FEDONA) runs age-group championships (mostly under 16) and masters. It is the least "league-like" scene; the most viable niche is personal-best tracking and club meets.

---

### 2. Scoring families: minimal data model and UI
**Common base (all families):**
- `League.sport` (missing = `'boliche'`, the same backward-compatible pattern as `kind`) and `League.format` (the family's config).
- A generic `Match/Performance` document with a family-specific `result`, a `status` (draft / confirmed / approved) and `confirmedBy[]`.
- Standings and stats as **pure, tested functions per family**, like the current `src/lib/bowling.ts` and `src/lib/stats.ts`.
- One AI prompt per family (`src/lib/scan.ts`).
- The pending → approved flow and the notifications stay generic.

**F1 Pins (bowling):** stays as it is today (`Entry.scores`, `frames`, `hcp`).

**F2 Racket match (pádel / tenis / pickleball):**
- `format`:
  - `{ mode: 'tennis' | 'sideout' | 'rally', deuce: 'ad' | 'noad' | 'golden' | 'star', gamesPerSet: 6|4, tbAt: 6|4, tbTo: 7, bestOf: 3|5|1, finalSet: 'full' | 'mtb10', gameTo: 11|15|21, winBy: 2, doubles: bool }`
  - `pts: { win, loss, walkover }` and `tiebreak: [...]`.
- `Match`: `{ sideA: [playerId, (playerId)], sideB: [...], sets: [[a,b],...], tb?: [[a,b]], walkover?, winner, round/jornada }`.
- Americano/mexicano: `Round` → matches with per-player points.
- Standings: W/L, points, set/game or point differential, head-to-head.
- Optional internal Elo.
- UI: a two-sided point pad, server indicator, undo stack, result screen for "the other side confirms", fixture and bracket generator.

**F3 Team with periods (fútbol 11 / futsal / baloncesto):**
- `format`:
  - `{ periods: 2|4, periodMin, clock: 'running' | 'stopped' | 'none', ot, pts: {w, d, l, forfeit}, tiebreak: [...], events: ['goal' | 'p1' | 'p2' | 'p3', 'foul', 'yellow', 'red', 'sub', 'timeout', 'assist'], teamFoulLimit: {per: 'quarter' | 'half', n}, personalFoulOut: 5, suspensions: {yellows: n, games: m} }`.
- `Team` (persistent per season): `{ name, roster: [{playerId, number}] }`. **This is new:** bowling teams live inside each event.
- `Match`: `{ home, away, score: {h, a}, periodScores: [...], status, events: [{t, team, player, period, clock}], lineup }`.
- Per-player stats and suspensions are derived from `events`.
- UI:
  - Scoreboard with clock.
  - Shirt-number grid per team; action bar; undo.
  - Foul, timeout and bonus counters.
  - Standings table; top scorers; suspended players.

**F4 Strokes per hole (golf):**
- `Course`: `{ holes: [{par, si}], tees: [{name, rating, slope, par}] }`.
- `Round`: `{ playerId, courseId, teeId, hiSnapshot, courseHcp, playingHcp, strokes: [18], putts?: [18] }`.
- Derived values: gross, net, Stableford, +/− against par, hole-by-hole match play.
- `format`: `{ type: 'stroke' | 'stableford' | 'match' | 'fourball' | 'scramble', allowance: 95, holes: 9|18, rounds: n }`.
- UI: group card with steppers, leaderboard, countback.

**F5 Time per race (natación):**
- `Race`: `{ distance, stroke, pool: 25|50, gender, ageGroup, relay: bool }`.
- `Heat`: `{ n, lanes: [{lane, playerId | teamId, seedMs}] }`.
- `Result`: `{ ms, status: 'ok' | 'dq' | 'dns' | 'dnf', splits?, place, points }`.
- Personal best = minimum per (stroke, distance, pool).
- `format`: `{ pointsByPlace: [9,7,6,5,4,3,2,1], relayMult: 2, ageAt: 'dec31' | 'meetStart' }`.
- UI: heat view with lanes, shared start, stop per lane, time keypad, automatic seeding.

**Implications for the rules and the free plan:**
- The security rules (`firestore.rules`, ~400 lines) need per-family shape validation (sizes, ranges), keeping the generic submission/approval pattern.
- Live scoring: a local event log plus a throttled snapshot, or Realtime Database, as described in section 0.
- Photos only where they add value (bowling, golf, swimming, basketball scoreboard). For racket sports and golf, verify with opponent/marker confirmation, which frees the 1 GiB of storage.

---

### 3. Ranking
**Demand in the DR amateur scene, by fit with the app:**

| # | Sport | Why |
|---|---|---|
| 1 | Pádel | Booming; adult players who use apps; weekly tournaments; categories A/B/C. Competitors only handle bookings. |
| 2 | Baloncesto | Largest amateur base (neighbourhood leagues, veterans, TBS), but it needs a scorer and scoring is on paper today. |
| 3 | Fútbol sala + Fútbol 11 | Growing; free futsal courts; a local competitor exists (cancha.do). |
| 4 | Pickleball | Fast growth; players already think in DUPR 3.0/3.5 terms; smaller base. |
| 5 | Tenis | Stable club and veterans scene; comes almost free with F2. |
| 6 | Golf | About 6,000 federated golfers, already covered by the FedoGolf/GHIN app; niche: club and friends' tournaments with Stableford. |
| 7 | Natación | Youth age groups and masters with dedicated meet software; the niche is personal bests. |

**Difficulty, easiest first (taking reuse into account):**

| # | Sport | Effort |
|---|---|---|
| 1 | Pádel | Medium: builds F2 plus americano/mexicano. |
| 2 | Tenis | Low after pádel: AD/no-ad and singles. |
| 3 | Pickleball | Low to medium after pádel: side-out with server number, rally scoring, games to 11, point differential. |
| 4 | Golf | Medium: course data, WHS handicap maths, Stableford, countback; simple UI; AI photo already proven. |
| 5 | Fútbol sala / Fútbol 11 | Medium to high: persistent teams and rosters, events, clock, card suspensions; futsal adds accumulated fouls and a stopped clock. |
| 6 | Baloncesto | High with a full live box score; medium with only final score plus points and fouls per player. |
| 7 | Natación | High for full meets (races, heats, seeding, age groups, relays, team points); low for a personal-best log only. |

**Suggested order of phases:**
- **0 — Multi-sport foundation:** `sport` field, family modules, generic match document, standings engine. Bowling stays untouched, with regression tests.
- **1 — Pádel.**
- **2 — Tenis + Pickleball.**
- **3 — Fútbol sala + Fútbol 11.**
- **4 — Baloncesto.** Its higher demand could justify moving it up to phase 3 as a "final score plus points and fouls" version.
- **5 — Golf.**
- **6 — Natación.**

---

### Sources
- Pickleball rally vs side-out (2026 rulebook): https://usapickleball.org/docs/rules/USAP-Rulebook-Change-Document.pdf · https://usapickleball.org/pickleball-skills/level-three/pickleball-scoring-positioning-rally-scoring/ · https://thekitchenpickle.com/blogs/news/usa-pickleball-rule-changes-2026/
- Pickleball round-robin tie-breakers: https://www.playpickleball.com/2025-usa-pickleball-rules-section-12-sanctioned-tournament-policies/
- DUPR: https://www.dupr.com/how-it-works
- Pádel — punto de oro and super tie-break: https://www.padelfip.com/wp-content/uploads/2023/09/2-Reglamento-Juego.pdf
- Pádel — Star Point 2026: https://www.padeladdict.com/nuevo-sistema-puntuacion-padel-punto-estrella-star-point-2026/
- Pádel — levels: https://helpmanager.playtomic.com/hc/es/articles/20563641264145-Los-Niveles-y-Algoritmo-de-Playtomic
- Pádel — americano/mexicano: https://www.padelfast.com/formats/mexicano
- Pádel — amateur league standings and tie-breakers: https://www.xporty.com/blog/como-redactar-la-normativa-de-una-liga-social-de-padel
- Pádel in the DR: https://n.com.do/2025/03/06/united-capital-padel-tour-2025-torneo-rfdp-republica-dominicana/ · https://ensegundos.do/2026/04/21/el-auge-del-padel-en-republica-dominicana/ · https://www.interpadelmedia.com/nuevas-federaciones-nacionales-se-suman-a-la-fip-para-alcanzar-los-100-miembros-y-con-novedades-para-2026/
- Pickleball in the DR: https://colimdo.org/noticias/dupla-de-ricardo-vila-y-erick-trujillo-gana-torneo-pickleball-internacional/ · https://almomento.net/anuncian-copa-confraternidad-de-pickleball-en-juan-dolio/
- Tenis — no-ad and match tie-break: https://sportrules.org/tennis/advantage-and-no-ad-scoring/ · https://www.usta.com/en/home/improve/tips-and-instruction/national/tennis-scoring-rules.html
- Tenis — NTRP: https://www.usta.com/en/home/coach-organize/tennis-tool-center/run-usta-programs/national/understanding-ntrp-ratings.html
- Tenis in the DR (Fedotenis 2026): https://7dias.com.do/2026/01/06/la-federacion-dominicana-de-tenis-realizara-71-eventos-nacionales-regionales-e-internacionales/
- Baloncesto (FIBA): https://assets.fiba.basketball/image/upload/documents-corporate-fiba-official-rules-2026-v1-1.pdf · https://www.judgemate.com/en/guides/how-basketball-scoring-works
- Baloncesto in the DR: https://en.wikipedia.org/wiki/Torneo_Superior_de_Baloncesto · https://www.eljaya.com/265159/torneo-de-baloncesto-de-veteranos-reunira-a-12-equipos-desde-el-29-de-agosto/
- Futsal: https://www.fifa.com/en/tournaments/mens/futsalworldcup/articles/futsal-world-cup-rules · https://digitalhub.fifa.com/m/20d52e6779b53321/original/FUTSAL-Laws-of-the-Game-2025-2026.pdf · https://futsalfeed.com/original-content/fifa-updated-the-futsal-rules-and-we-have-the-summary
- Fútbol tie-breakers: https://www.judgemate.com/en/guides/world-cup-2026-group-stage-tiebreakers-explained
- Card accumulation and suspensions: https://superligadefutbol.com.ar/sl/sanciones/
- Fútbol in the DR: https://es.wikipedia.org/wiki/F%C3%BAtbol_en_Rep%C3%BAblica_Dominicana · https://cancha.do/ · https://www.fedofutbol.do/category/futbol-sala/
- Golf WHS: https://www.randa.org/en/roh/the-rules-of-handicapping/rule-3 · https://www.randa.org/en/roh/appendices/appendix-c · https://gapgolf.org/play/handicapping/handicap-index-computation/
- FedoGolf/GHIN: https://thegolfwire.com/137017-2/ · https://www.diariolibre.com/deportes/rd-ingresa-a-la-red-del-golf-handicap-HODL174056
- AI golf scorecard readers: https://www.snapcardgolf.app/ · https://scorecardai.app/
- Natación — meets: https://blog.myswimpro.com/2018/03/16/swim-meet-terminology-faqs/ · https://swimlpac.org/meets/swim-meet-scoring/
- Natación — masters: https://www.worldaquatics.com/news/3911436/about-doha-2024-everything-you-need-to-know-about-the-world-aquatics-masters-championships
- Natación — CCCAN age groups: https://es.wikipedia.org/wiki/Federaci%C3%B3n_de_Nataci%C3%B3n_de_Am%C3%A9rica_Central_y_el_Caribe
- Natación in the DR: https://es.wikipedia.org/wiki/Federaci%C3%B3n_Dominicana_de_Deportes_Acu%C3%A1ticos
- Realtime Database limits on Spark: https://firebase.google.com/docs/database/usage/limits

Files I looked at (none modified): `C:\Users\rgrullon\code\bowlinx\src\lib\types.ts`, `C:\Users\rgrullon\code\bowlinx\src\lib\bowling.ts`, `C:\Users\rgrullon\code\bowlinx\src\lib\stats.ts`, `C:\Users\rgrullon\code\bowlinx\src\lib\live.ts`, `C:\Users\rgrullon\code\bowlinx\src\lib\scan.ts`, `C:\Users\rgrullon\code\bowlinx\firestore.rules`