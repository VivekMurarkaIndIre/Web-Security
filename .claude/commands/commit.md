Read all staged and unstaged changes relative to main, then do the following steps in order:

1. Run `git diff main` and `git status` to understand every file that changed.

2. Read the existing CHANGELOG.md at the repo root (if it exists). If it does not exist, create it with a top-level heading `# Changelog`.

3. Decide on a short section title that describes what was built or learned in this batch of changes (e.g. "Zod env validation", "JWT signing + verification"). Use the diff to infer this — do not ask the user.

4. Prepend a new entry to CHANGELOG.md in this format (most recent at top):

```
## <title> — <today's date YYYY-MM-DD>

**What changed:**
- <bullet per meaningful file or feature>

**What we learned:**
- <1–3 sentences on the concept covered, written as learning notes — why it matters, what the footgun was, what the key insight is>
```

5. Stage everything: `git add -A`

6. Commit with a concise message: `git commit -m "<same title as the changelog section>"`

7. Push to main: `git push origin main`

8. Report back: print the commit hash and confirm the push succeeded.
