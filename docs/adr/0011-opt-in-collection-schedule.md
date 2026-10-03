# An opt-in Collection Schedule per Project, while the app is open

Amends 0002. Collection stays manual by default, but each Project can choose a
schedule in its own Settings tab, Schedule: daily, weekly on a weekday, monthly on a
date, or every N days. While the app is open, a Project whose schedule is due
is collected on its own.

Some Projects need a denser series than four points a month, and pressing a
button every morning is the kind of chore that gets skipped. It is per Project
because Projects differ: a client under active work wants daily data, a
background one is fine monthly, and each Run spends the user's money. 0002's
argument still holds: a sleeping laptop runs nothing and a missed day is lost.
So this does not pretend to guarantee a series. It removes the button press on
the days the app is open anyway, and nothing more.

The check runs in the server process (`instrumentation.ts`): once at boot, to
catch up on Runs that came due while the app was closed, then every 15 minutes.
Every due Project goes into one scope `'projects'` Run. Days are compared in
local time, so "every Monday" is the user's Monday. A Project anchors on
`prompts_updated_at`, which every Run touching it already writes.

## Consequences

- Still no daemon, no launch-at-login, no tray residency and no background
  permissions. If the app is closed on the chosen day, the Run happens the next
  time it opens.
- Every scheduled Run spends the user's money on their own keys, without a
  click. The Settings copy says so, and the default stays Manual.
- Scope `'projects'` Runs are not guarded against overlap (criterion 13), and
  `prompts_updated_at` is written only when a Run finishes. So the scheduler
  does nothing while any Run is active and checks again on the next tick.
- Paused and archived Projects are skipped, and so is everything when no
  Chatbot is enabled.
- A scheduled Run is scope `'projects'`, so it does not reset the app-wide
  7-day cadence clock. The sidebar countdown and the staleness banner still
  use the fixed 7 days. Making them follow the schedules is left for later.
