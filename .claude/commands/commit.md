Read all staged and unstaged changes relative to main, then do the following steps in order:

1. Run `git diff main` and `git status` to understand every file that changed.

2. Infer a short topic title from the diff (e.g. "Zod Env Validation", "JWT Signing", "AsyncLocalStorage Tenant Context"). Do not ask the user.

3. Create a new file at `resources/<kebab-case-title>.md` with this exact structure:

```
# <Topic Title>

## What it is
<2–3 sentences explaining the concept in plain English.>

## Business use case
<What real problem does this solve? Think: what would break or be insecure without it? Give a concrete scenario (e.g. "A SaaS app serving multiple tenants…").>

## What this implementation solves
- <bullet per concrete thing the code now handles>

## What it still doesn't solve
- <bullet per known limitation, missing production concern, or follow-up topic — be honest about gaps>

## Key insight
<The one thing worth remembering — the common mistake to avoid avoided, the non-obvious decision, the "aha" moment.>
```

4. Read the existing `README.md` at the repo root (if it exists). If it does not exist, create it with:
   - A top-level heading `# Web Security Lab`
   - A short description: "A hands-on auth engineering lab built topic by topic."
   - A `## Topics` section as an empty list.
   
   Then append a new bullet to the `## Topics` section linking to the new resource file:
   `- [<Topic Title>](resources/<kebab-case-title>.md)`

5. Read the existing `CHANGELOG.md` at the repo root (if it exists). If it does not exist, create it with a top-level heading `# Changelog`.

6. Prepend a new entry to CHANGELOG.md (most recent at top):

```
## <title> — <today's date YYYY-MM-DD>

**What changed:**
- <bullet per meaningful file or feature added or modified>

**What we learned:**
- <1–3 sentences: the concept, the common mistake to avoid, the key insight>
```

7. Stage everything: `git add -A`

8. Commit: `git commit -m "<topic title>"`

9. Push to main: `git push origin main`

10. Report back: print the commit hash, confirm push succeeded, and print the path to the new resource file.
