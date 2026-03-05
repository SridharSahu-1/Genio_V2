# Fix GitHub push blocked by secrets

GitHub is blocking the push because **past commits** on your branch contain AWS (and other) secrets. Fixing the files alone is not enough; you must either rewrite history or push a new clean branch.

---

## What was changed in the repo

- **deploy-to-ec2.sh**: Replaced hardcoded AWS keys, MongoDB URI, and Redis password with placeholders (`YOUR_AWS_ACCESS_KEY_ID`, `YOUR_AWS_SECRET_ACCESS_KEY`, `YOUR_UPSTASH_REDIS_PASSWORD`, `YOUR_MONGO_USER`, `YOUR_MONGO_PASSWORD`).
- **worker/task-definition.json**: Replaced AWS Access Key ID and Redis password with placeholders.

You must **never** commit real secrets. On EC2, keep using your real values in `~/Genio_V2/.env.production` (that file is not in git).

---

## Option 1: One clean commit and force-push (recommended)

This makes your branch a single commit on top of `main` (or `master`) with no secrets in history.

```bash
# Use your default branch name (main or master)
git fetch origin main

# Point branch at origin/main, keep all your file changes staged
git reset --soft origin/main

# Stage everything (includes the secret-removal edits)
git add -A
git status   # check what will be committed

# One commit with no secrets
git commit -m "Add ratio feature; remove hardcoded secrets (use placeholders)"

# Overwrite remote branch (only if you’re the only one using add-ratio)
git push origin add-ratio --force
```

If your default branch is `master`:

```bash
git fetch origin master
git reset --soft origin/master
git add -A
git commit -m "Add ratio feature; remove hardcoded secrets (use placeholders)"
git push origin add-ratio --force
```

---

## Option 2: New branch and push

If you prefer not to force-push `add-ratio`:

```bash
git checkout main
git pull origin main
git checkout -b add-ratio-clean
git merge add-ratio    # or cherry-pick the commits you want
# Resolve conflicts if any; ensure no secret is in any file
git add -A
git commit -m "Add ratio feature; remove hardcoded secrets"
git push origin add-ratio-clean
```

Then open a PR from `add-ratio-clean`.

---

## After pushing

- **EC2**: Keep using your real credentials only in `~/.env.production` on the server (create or edit it there; do not commit it).
- **task-definition.json**: When you deploy to ECS, replace the placeholders with real values (e.g. via env vars or a one-off edit that is not committed).

Do **not** use GitHub’s “allow the secret” for these – the keys would remain in history and should be rotated if they were ever committed.
