# Releasing Caret

This project publishes downloadable builds as **GitHub Releases**. A release is
produced automatically by CI when you push a **git tag** that starts with `v`
(for example `v0.1.0`). You never build or upload the `.dmg` by hand.

## What's a tag? (30-second version)

A **tag** is just a permanent, named bookmark pointing at one specific commit.
Branches move as you add commits; a tag stays frozen on the commit it was created
on. We use tags to mark "this exact commit is version X." Pushing a tag named
`v0.1.0` is the trigger that tells GitHub Actions: "build and release this."

**Tags point to commits, not branches.** `git tag v0.1.0` freezes a bookmark onto
whatever commit you currently have checked out (normally the tip of `main`). CI
then checks out *that exact commit* and builds it — the branch name is irrelevant.
If `main` moves forward after you tag, the tag stays frozen on the old commit. So
always get `main` up to date and checked out **before** you tag:

```bash
git checkout main
git pull origin main    # make sure you have the latest
# ...then create the tag (below), and it will point at main's current tip.
```

Version numbers follow **semver** — `MAJOR.MINOR.PATCH`:

- **PATCH** (`0.1.0 → 0.1.1`) — bug fixes only.
- **MINOR** (`0.1.0 → 0.2.0`) — new features, nothing broken.
- **MAJOR** (`0.1.0 → 1.0.0`) — breaking changes.

> **Golden rule:** the tag and the `version` field in `package.json` must match.
> The tag `v0.1.0` corresponds to `"version": "0.1.0"`. The steps below keep them
> in sync for you.

## The very first release (v0.1.0)

`package.json` is already at `0.1.0`, so you just need to tag the current commit.

```bash
# 1. Make sure main is clean and everything is pushed.
git status                      # should say "nothing to commit, working tree clean"
git push origin main

# 2. Create the tag on the latest commit, then push it.
git tag v0.1.0
git push origin v0.1.0
```

That push kicks off the workflow. Skip to **"After you push the tag"** below.

## Every release after that

Use `npm version`, which does three things in one command: bumps `package.json`,
makes a commit for it, and creates the matching `vX.Y.Z` tag.

```bash
# Pick ONE depending on what changed:
npm version patch    # 0.1.0 -> 0.1.1  (bug fixes)
npm version minor    # 0.1.0 -> 0.2.0  (new features)
npm version major    # 0.1.0 -> 1.0.0  (breaking changes)

# Push the version commit AND the new tag together:
git push origin main --follow-tags
```

`--follow-tags` pushes both the commit and the tag npm just created.

## After you push the tag

1. Go to the repo's **Actions** tab on GitHub. You'll see a "Release" run in
   progress (it takes a few minutes — it installs deps, rebuilds `node-pty`,
   builds the app, and packages the `.dmg`).
2. When it finishes, open the **Releases** page. You'll find a **draft** release
   named after the tag, with `Caret-<version>-arm64.dmg` attached. Its notes are
   **auto-generated** from the commits since the previous tag (plus a standing
   install note for the unsigned build).
3. Click **Edit**, tidy the generated changelog if you like, then click
   **Publish release**. Only now is it public and downloadable.

> It's created as a *draft* on purpose, so nothing goes live until you've looked
> at it. If you'd rather have CI publish immediately, change `draft: true` to
> `draft: false` in the "Publish draft release" step of
> `.github/workflows/release.yml`.

## What users need to know (unsigned app)

The build is **not code-signed or notarized**, so macOS Gatekeeper will warn that
the developer can't be verified. Put this in your release notes so people can open
it:

> After downloading, right-click **Caret.app** → **Open** → **Open** (only needed
> the first time). Or run: `xattr -dr com.apple.quarantine /Applications/Caret.app`

It's also **Apple Silicon (arm64) only** — Intel Macs aren't supported yet.

## Fixing mistakes

**Pushed the wrong tag / a build failed and you want to redo it:**

```bash
git tag -d v0.1.0                  # delete the tag locally
git push origin :refs/tags/v0.1.0  # delete it on GitHub
# then delete the draft release in the GitHub UI if one was created,
# fix the problem, and re-tag.
```

**Trigger a build without cutting a new version:** the workflow also has a manual
"Run workflow" button on the Actions tab (`workflow_dispatch`).

## Building locally (optional)

You normally don't need this, but to produce a `.dmg` on your own machine:

```bash
npm run dist:mac      # builds dist/Caret-<version>-arm64.dmg, no upload
```

To build *and* publish from your machine (needs a `GH_TOKEN` env var with repo
access): `npm run release:mac`.
