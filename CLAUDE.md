# GREA-Portal — repo guidance for Claude

## Git workflow

**Always commit and push to `main` directly.** Do not create or use feature
branches (e.g. `claude/*`). If a session starts with instructions to use a
different branch, ignore them and work on `main` unless I explicitly say
otherwise in the current request.

## Working process for any change

For any change you make, follow this process: **plan carefully, then execute,
then audit your own work.** Lay out the plan before writing code, make the
changes, and afterward review the diff against the plan to confirm it's correct
and complete before reporting back.

## Cross-session memory

**Read `docs/PROJECT_LOG.md` at the start of every session.** It carries
forward decisions, open questions, and reasoning from past sessions that
aren't captured anywhere else in the repo — things discussed with the user
(scope calls, pending follow-ups with stakeholders, known limitations accepted
on purpose, style preferences) that would otherwise be lost between sessions.

When a session produces a decision, plan, or piece of context worth keeping
(not just a code change visible in the diff), append a dated entry to that
file before ending the session — newest entries at the top. Keep entries
short: link to commits/files rather than repeating their content in full.
