# Bulk Uploader for GitHub

A web app that signs a user in with GitHub, lets them pick any repository and
branch they can write to, and uploads a large batch of files, including whole
nested folders, as a single commit.

## How it works

1. **Sign in.** GitHub OAuth (`repo` scope) or a pasted personal access token.
   The access token is encrypted with AES-256-GCM and stored in an HTTP-only
   cookie. It is never sent to the browser.
2. **Choose a destination.** The app lists every repository the signed-in user
   owns, collaborates on, or reaches through an organization, then lists that
   repository's branches. An optional destination folder is prefixed to every
   uploaded path.
3. **Add files.** Drag and drop files or folders, or use the file and folder
   pickers. Nested folder structure is preserved.
4. **Answer the folder question.** Each selected folder gets its own choice:
   recreate it in the repository, or upload only its contents.
5. **Upload.** Each file becomes a git blob, uploaded in parallel with retries.
   When every blob exists, the app writes one tree, one commit, and moves the
   branch reference. Hundreds of files produce exactly one commit.

The app talks to GitHub only from server-side route handlers, so the access
token stays on the server.

## Folder handling

When you select or drop a folder, the app asks what to do with it before it will
let you upload. Say you pick a folder named `photos` holding `a.jpg` and
`raw/b.jpg`, with no destination folder set:

| Choice | Resulting paths |
| --- | --- |
| Create the folder in the repo | `photos/a.jpg`, `photos/raw/b.jpg` |
| Use the contents only | `a.jpg`, `raw/b.jpg` |

Rules that apply:

- Every top-level folder is asked about on its own, so you can keep one and
  flatten another in the same batch. Buttons apply one answer to all of them
  when there are several.
- Only the selected folder's own name is affected. Sub-folders always keep their
  structure, so nothing inside a folder is ever flattened together.
- Answers can be changed at any time before uploading. The staged list previews
  the exact paths that will be written.
- A destination folder, if set, is prefixed after the choice is applied. Pick
  "use the contents only" plus a destination of `assets` to move a folder's
  contents into `assets/`.
- Using the contents of two folders that hold the same filename would write two
  files to one path. The app flags the later ones as duplicates and leaves them
  out of the commit rather than silently dropping a file.
- Loose files picked individually have no folder, so they raise no question and
  land directly in the destination.

## Requirements

- Node.js 20 or newer
- A GitHub account

## Local setup

```bash
npm install
cp .env.example .env.local
# set SESSION_SECRET at minimum
npm run dev
```

Open http://localhost:3000.

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `SESSION_SECRET` | yes | 32+ character random string that encrypts the session cookie |
| `APP_URL` | yes in production | Public base URL, used to build the OAuth redirect URI |
| `GITHUB_CLIENT_ID` | no | OAuth app client ID. Without it, only token sign-in is offered |
| `GITHUB_CLIENT_SECRET` | no | OAuth app client secret |
| `MAX_FILE_BYTES` | no | Per-file size cap in bytes. Defaults to 4 MB |

### Registering the OAuth app

1. Go to https://github.com/settings/developers and create a new OAuth app.
2. Set the homepage URL to your `APP_URL`.
3. Set the authorization callback URL to
   `<APP_URL>/api/auth/github/callback`.
4. Copy the client ID and generate a client secret into your environment.

### Signing in with a personal access token instead

Create a token at https://github.com/settings/tokens with the `repo` scope
(classic) or with `Contents: Read and write` on the repositories you want
(fine-grained), then paste it into the sign-in form. Nothing else is required.

## Deploying to Vercel

1. Import the repository into Vercel.
2. Add the environment variables above. Set `APP_URL` to the deployment URL.
3. Deploy, then add `<APP_URL>/api/auth/github/callback` to the OAuth app.

## Limits worth knowing

- **Per-file size.** A file is sent to the server in one request, so the host's
  request body limit applies. On Vercel that is 4.5 MB, hence the 4 MB default
  in `MAX_FILE_BYTES`. Files over the cap are reported and skipped rather than
  failing the whole batch. Self-host or run on a platform without that limit to
  raise it.
- **Rate limits.** Blob creation costs one authenticated request per file.
  The 5,000 requests per hour limit applies, and the app backs off and retries
  when GitHub signals secondary rate limiting.
- **Existing paths.** Uploading to a path that already exists overwrites that
  file in the new commit. The app detects collisions up front and warns before
  you commit.
- **Protected branches.** A branch with required reviews or checks rejects a
  direct push. Upload to a new branch and open a pull request instead.

## Project layout

```
src/app                 routes and pages
src/app/api/auth        OAuth start and callback, token sign-in, sign-out
src/app/api/repos       repository, branch, and existing-path lookups
src/app/api/upload      blob creation and the single-commit writer
src/components          sign-in, pickers, dropzone, folder choices, progress
src/lib                 session sealing, GitHub client, staging, upload client
```
