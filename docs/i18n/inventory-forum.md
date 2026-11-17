# String inventory - Wempo Forum client (forum-5.0 branch - the newer client)

Repo: /Users/itswempo/forum-5.0 (worktree holding the newer client; /Users/itswempo/wempos-forum = 6552-line older snapshot on main)

Method: all string literals + template literals extracted from public/js/** (vendor excluded), machine-filtered for CSS-class/selector/internal-identifier junk (documented below). Each row: source file:line + the string. Server-class strings (HttpError / json message strings that render as client toasts) are the last section - catalogued only, nothing edited.

Row classes (per wave-plan.md's class split): client UI rows below = ~457 candidates across 34 client files (~440 unique after line-dedupe); server-class rows = 276 (~186 unique strings after dedupe — session/auth/vendor boilerplates repeat across routes). Proposed key count: ~440 client + ~186 server = ~626 for the `forum.*` scheme.

## public/js/api.js

| lines | string |
|---|---|
| 29 | Invalid response (${response.status}) |
| 29, 37 | Request failed (${response.status}) |

## public/js/app.js

| lines | string |
|---|---|
| 161, 179 | Wempo's Forum |
| 169 | Report a post |
| 174 | Saved posts |
| 175 | First-time setup |
| 176 | Not found |
| 182 | ${route.board ? boardLabel(route.board) : "Category"} · Wempo's Forum |
| 183 | ${pageNames[route.name] \|\| pageNames.home} · Wempo's Forum |
| 187 | Page not found |
| 188 | That page isn't available. |
| 354 | reading 'dataset' of undefined |
| 422 | Can't sign in right now |
| 423 | The Wempo Accounts sign-in isn't completing. Your sign-in link is single-use and may have expired or already been used. |
| 425 | Try again from Wempo Accounts |
| 460 | Something went wrong:( |
| 465 | Forum startup failed: |
| 467 | The forum could not start:( |
| 469 | A startup error interrupted the forum! Refresh after the site is updated. |
| 514 | The forum was updated while this page was open. Reload for the newest version. |

## public/js/attachments.js

| lines | string |
|---|---|
| 25 | "${picked.name}" is larger than ${MAX_COMPOSER_FILE_BYTES_LABEL} and was not added. |
| 29 | "${picked.name}" was not added: a post can attach at most ${MAX_COMPOSER_FILES} images. |

## public/js/banned.js

| lines | string |
|---|---|
| 33 | , password = |
| 39 | Oh noes:( You are banned! |
| 42 | No reason was provided. |
| 52 | Reactivates in ${formatBanCountdown(expiresAt)} |
| 57 | No reactivation time set.... |
| 78 | Password (proves this is really you) |
| 88 | Why should this ban be lifted? |
| 93 | Appeal this ban |

## public/js/boards.js

| lines | string |
|---|---|
| 13 | Everyday chatter — talk about whatever's on your mind. |
| 17 | Game development |
| 18 | Devlogs, works in progress, and hangout builds — see what everyone is working on. |
| 23 | Show off what you made — games, art, sites, anything. |
| 27 | Bugs & Troubleshooting & Help |
| 28 | Something broke or you're stuck? Ask here. |
| 33 | Ideas for the forum — sorted by likes, and admins can mark them resolved or declined. |
| 38 | Site news from the admins. Everyone can read and reply; only admins can post. |

## public/js/desk/appeals.js

| lines | string |
|---|---|
| 14 | There are no appeals. |
| 19 | Appeal #${appeal.id} — ${appeal.username} |
| 21 | Ban appeal |
| 21 | Legacy appeal |
| 23 | Ban reason: |
| 23 | No reason was provided. |
| 27 | Waiting for review — filed |
| 29 | Approved |
| 30 | Denied |
| 35 | Approve appeal |
| 36 | Deny appeal |

## public/js/desk/bans.js

| lines | string |
|---|---|
| 27 | Reason to ban ${username} |
| 34 | Ban duration |
| 36 | Timed bans auto-reactivate the account when they expire. |
| 41 | Also block this member's known networks (IP ban) |
| 44 | Ban member |
| 58 | Find a member |
| 60 | Search by username to find members and unban them. |
| 72 | No members matched. |
| 93 | — expires |
| 100 | Reason to unban ${member.username} |
| 104 | Unban member |
| 108 | Not banned. |
| 121 | There are no active bans. |
| 129 | Expires: ${new Date(ban.expiresAt).toLocaleString()} |
| 135 | Reason to unban ${ban.user.username} |
| 139 | Unban user |

## public/js/desk/chat-log.js

| lines | string |
|---|---|
| 13 | There are no DMs yet. |
| 30 | Banned author |
| 38, 87 | Delete message |
| 55 | The chat has no messages yet. |
| 75 | Banned author — hidden from chat |

## public/js/desk/filter.js

| lines | string |
|---|---|
| 15 | The list is stored in the database — edits apply everywhere within about 30 seconds. |
| 18 | No filter is set yet. Save entries here to turn it on — nothing is filtered until then. |
| 23 | · last saved |
| 33 | The full filter list |
| 40 | Save filter list |
| 46 | Bulk add entries |
| 50 | One entry per line or comma-separated. Duplicates are skipped; nothing else in the list changes. |
| 52 | Add entries |

## public/js/desk/media.js

| lines | string |
|---|---|
| 14 | No images are awaiting review. |
| 21 | Image for post #${attachment.postId} · uploaded ${new Date(attachment.createdAt).toLocaleString()} |
| 25 | ${attachment.mime} · ${Math.max(1, Math.ceil(attachment.sizeBytes / 1024))} KB · ${attachment.chunkCount} chunk${attachment.chunkCount === 1 ? "" : "s"} |
| 29 | Pending image from ${attachment.uploader} |
| 57 | No avatars are awaiting review. |
| 63 | Uploaded ${new Date(avatar.uploadedAt).toLocaleString()} |
| 67 | Pending avatar of ${avatar.username} |
| 98 | No GIFs are awaiting review. |
| 103 | ${gif.uploader} · uploaded ${new Date(gif.createdAt).toLocaleString()} |
| 106 | GIF submitted for moderation |
| 111 | Approve GIF |
| 111 | Reject GIF |

## public/js/desk/reports.js

| lines | string |
|---|---|
| 11 | The report queue is clear. |
| 19 | Report #${report.id} |
| 20 | Reported by ${report.reporter.username}: ${report.reason} |
| 23 | Post by ${report.post.author.username}: ${report.post.body} |
| 27 | Hide post |
| 49 | Reason to promote ${report.post.author.username} (optional) |
| 52 | Promote to mod |
| 58 | Reason to demote ${report.post.author.username} (optional) |
| 61 | Demote to member |

## public/js/dom.js

| lines | string |
|---|---|
| 36 | Unsupported confirmation action: ${String(actionType)} |
| 39 | A confirmation callback is required. |

## public/js/gifs.js

| lines | string |
|---|---|
| 40 | Selected image |
| 45 | Remove this image |

## public/js/home-intro.js

| lines | string |
|---|---|
| 1 | Welcome to my Forum! Anyone is welcome. Anyways bye, and I hope you enjoy:3 |
| 2 | Always Online |
| 2 | Custom Profile Themes |
| 2 | And more! |

## public/js/icons.js

| lines | string |
|---|---|
| 44 | Log out |
| 63 | No such icon: |
| 86 | s name, per the owner |

## public/js/notifications.js

| lines | string |
|---|---|
| 24 | You were mentioned by X |
| 28 | New reply on your post |
| 28 | New reply on your post: ${preview} |
| 72, 106 | Mark all read |
| 82 | No notifications yet. Replies to your posts will show up here. |

## public/js/profile-editor.js

| lines | string |
|---|---|
| 88 | mean |
| 139 | Edit your profile |
| 146 | Up to 10000 characters. Shown on your profile. |
| 152 | Your Polytoria username. |
| 153 | Just the ${SOCIAL_LABELS[key]} handle, not the whole URL. |
| 156 | Banner color |
| 157 | Any hex like #4d8fc4, or blank to clear. |
| 160 | Banner text |
| 161 | Optional text displayed in your profile banner. |
| 164 | Profile flair |
| 165 | A short label shown below your name. |
| 168 | Save profile |
| 208 | Profile color |
| 218 | Profile color: |
| 226 | )) ? currentAccent : |
| 227 | Custom profile color |
| 228 | Custom color — any hex |
| 239 | s labeled-field law: the label wraps for the input |
| 246 | body { font-family: serif; } — every rule is scoped to your profile. |
| 248 | Custom profile CSS (moderated) |
| 251 | CSS saves as PENDING: a mod approves it before it goes live. Scoped to your profile container by the server. |
| 254 | Save CSS for review |
| 258 | Remove my CSS |

## public/js/render.js

| lines | string |
|---|---|
| 61 | View full image |
| 61 | View full image ${index + 1} of ${total} |
| 175 | s form.composerFiles) so the author |
| 194 | Avatar of ${post.author.username} |
| 208 | Removed account |
| 222 | s past versions. Everyone gets it — the point is that edits can |
| 233 | post-pinned icon-inline |
| 248 | In reply to: ${post.parent.body} |
| 272 | ${label} this post |
| 304 | Remove from saved posts |
| 304 | Save this post |
| 314 | reply-count icon-inline |
| 325, 326 | Open post and replies |
| 337, 338 | Report this post |
| 353 | Edit this post |
| 371 | Delete this reply |
| 371 | Delete this thread |
| 391 | Unsubscribe from this thread |
| 392 | Subscribe to this thread |
| 428 | Show ${post.subReplyCount} replies |
| 474 | No posts to show yet. Start the conversation. |
| 493 | No replies to show yet. |
| 512 | Edit post |
| 516 | post-actions form-actions |
| 575 | Earlier versions (newest first) |
| 578 | No earlier versions. |

## public/js/routes/account-nav.js

| lines | string |
|---|---|
| 55, 58, 61, 142 | Sign in |
| 102 | Notifications (new notifications) |
| 156 | Profile — |
| 163 | Saved posts |
| 177 | Moderation desk |
| 186 | Sign out |
| 251 | s shape): the forum |

## public/js/routes/admin.js

| lines | string |
|---|---|
| 39 | Post reports |
| 40 | Profile reports |
| 44 | GIF library |
| 45 | Profile CSS |
| 46 | Hidden posts |
| 47 | Bans & members |
| 48 | Chat log |
| 51 | Word filter |
| 58 | Open post reports, newest first — resolve, ban, or dismiss. |
| 63 | Reported profiles — resolve, view, or ban the reported member. |
| 68 | Second looks at bans a member appealed. Approve to revoke the ban — approval notifies the member. |
| 73 | Attachments awaiting review. Author sees their own pending images; approve makes them public. |
| 78 | Avatar uploads awaiting review. The previous avatar keeps serving until you decide. |
| 83 | GIF submissions for the shared library. |
| 88 | Custom profile CSS awaiting review. Approved themes serve scoped and sandboxed. |
| 93 | Hidden posts and everything by actively banned members, bodies included. |
| 98 | Active bans with unban forms, plus member search to act on anyone directly. |
| 106 | The full public chat stream — banned authors included, deletable in place. |
| 111 | The full 1:1 stream with both participants named — same scrutiny as the chat. |
| 116 | The site copy every /rules visitor reads — markdown subset, word-filtered. |
| 121 | The word filter — edit the full list, or bulk-add pasted entries (duplicates skip). |
| 131 | Moderation desk |
| 132 | Only staff can use the desk. |
| 164 | Everything the desk watches, one glance: the queues with work show their counts. |
| 165 | Open a section from the rail to work it. |
| 188 | Moderation desk sections |
| 189 | Signed in as |
| 232 | No profile reports. |
| 239 | (reported by |
| 247 | View profile |
| 264 | Nothing hidden right now. |
| 273 | (until |
| 279 | Open post |
| 279 | Open thread |
| 291 | Forum rules (markdown — the subset bodies use) |
| 294 | Save rules |
| 303 | No CSS waiting for review. |
| 340 | The report was updated. |
| 359 | The user was banned and their sessions revoked. Their account reactivates when the ban expires. |
| 360 | The user was banned and their sessions revoked. |
| 369 | The ban was lifted. |
| 382 | The member was promoted to mod. |
| 383 | The member was demoted to member. |
| 394 | The avatar was approved. |
| 394 | The avatar was rejected. |
| 405 | The image was approved. |
| 405 | The image was rejected. |
| 428 | The filter list was saved. |
| 439 | duplicate skipped. |
| 439 | duplicates skipped. |
| 449 | Thread pinned. |
| 454 | Thread unpinned. |
| 459 | GIF approved and added to the public library. |
| 464 | GIF submission rejected. |
| 469 | Report resolved. |
| 475 | CSS approved. |
| 481 | CSS rejected. |
| 483 | s chat/DM log cleanup buttons (the site |
| 489 | Chat message deleted. |
| 494 | DM message deleted. |

## public/js/routes/appeals.js

| lines | string |
|---|---|
| 15 | Appeal approved. |
| 15 | Appeal denied. |
| 26 | Appeal filed — an admin will review it. |
| 28 | Appeal received. You can close this page now. |

## public/js/routes/auth.js

| lines | string |
|---|---|
| 5 | s guest rung, and the home route |
| 20 | Join the conversation! |
| 22 | Sign in with Wempo Accounts |
| 29 | Set up Wempo's Forum:3 |
| 29 | The first owner Wempo Account requires a setup secret configured out of band. |
| 32 | Owner username |
| 40 | Setup secret |
| 42 | Provided by the site owner through Wrangler. Never EVER share it! |
| 44 | Create owner |
| 50 | First-time setup is locked |
| 51 | The site owner must configure valid SETUP_SECRET and PASSWORD_PEPPER values in Wrangler before the first owner Wempo Account can be created. |
| 71 | First-time setup has already been completed. |
| 85 | Owner Wempo Account created! |
| 90 | s access gate (called from feed.js |

## public/js/routes/blocks.js

| lines | string |
|---|---|
| 12 | Blocked members |
| 13 | Blocked members cannot see your profile or posts, and cannot reply, react, message, or sign your wall — and you cannot see theirs. |
| 21 | Could not load your block list. |
| 27 | You have not blocked any members. |
| 41 | Blocked by them |
| 57 | Unblock @${username}? |
| 58 | They will be able to see your profile and posts, and interact with them again (unless you take other action). |
| 63 | Unblocked @${username}. |

## public/js/routes/composer.js

| lines | string |
|---|---|
| 9 | s el(), the kit |
| 10 | s createSelect is the verbatim twin of forms.js |
| 12 | s createStore: DRAFTS — a composer |
| 65 | , form.dataset.postId ?? |
| 65 | , form.dataset.board ?? |
| 102 | Share a suggestion |
| 103 | Start a conversation |
| 111 | ${name}-${postID ?? "new"}-board |
| 120 | ${name}-${postID ?? "new"}-body |
| 152 | 📎 Attach images |
| 175 | Images are reviewed before they show publicly. Up to ${MAX_COMPOSER_FILES}, |
| 176 | 10 MiB or less each (JPEG, PNG, WebP, or GIF). |
| 295 | (the poll could not be attached) |
| 299 | Your post is live! |
| 335 | Your reply was added! |
| 358 | Use this image |
| 359 | Library image |
| 365 | That would exceed your |
| 365 | attachment slots. |
| 385 | Only |
| 385 | image(s) fit your attachment slots. |
| 403 | That image is already approved and has been attached. |
| 405 | That image is approved, but this composer has no free attachment slots. |
| 409 | That image is already in the approved library! |
| 410 | Upload submitted for mod review. |
| 440 | That composer is no longer on the page. Open the poll tool again. |
| 448 | Give the poll a question and 2 to 4 options. |
| 455 | Poll attached — it posts with your message! |

## public/js/routes/feed.js

| lines | string |
|---|---|
| 9 | s el(), the kit |
| 55 | No suggestions yet — be the first! |
| 62, 337 | Start a thread |
| 80 | Wempo's Forum: Have fun and meet new people! |
| 101, 290 | What's on your mind? |
| 101, 290, 324 | Post message |
| 107 | Search results |
| 107, 247 | Recent activity |
| 109 | Results for “${route.query}” |
| 115 | Nothing in Recent activity yet — be the first. |
| 117 | No posts yet — sign in above to start the first thread. |
| 120, 297, 343, 388 | Load older posts |
| 129 | Square corners |
| 139 | s lane. The instruction takes the form |
| 141 | Change your password |
| 146 | Change it on Wempo Accounts |
| 165 | Delete your Wempo Account |
| 166 | s replies inside those threads — plus your replies — and any sub-replies hanging off your replies in other members |
| 168 | Delete Wempo Account |
| 185 | No replies match — try fewer words. |
| 193 | Open thread |
| 213 | No members match — check the spelling, or try a shorter name. |
| 219 | No posts match — fewer words search wider, or start the thread yourself. |
| 261 | (new posts) |
| 279 | Sign in to see your posts. |
| 280, 354 | Sign in |
| 294 | No posts of yours yet — start your first thread with the composer above. |
| 323 | Post a site update |
| 323 | Start a thread in ${board.label} |
| 324 | Post update |
| 333 | Nothing in ${board.label} yet — start the conversation! |
| 336 | Post the first update |
| 337 | Post the first suggestion |
| 340 | Sign in to start the first thread in ${board.label} |
| 349 | Nothing saved yet. Use the Save button on a post. |
| 352, 361 | Saved posts |
| 353 | Sign in to see your saved posts. |
| 363 | Your saved list is private to you. |
| 368, 456 | Load older saved posts |
| 379 | ) + (mine ? |
| 379 | + mine : |
| 388 | Load older suggestions |
| 427 | Removed from your saved posts. |
| 435 | You unsubscribed from this thread. |
| 435 | You will get notifications for replies here. |
| 447 | Suggestion reopened. |
| 448 | Suggestion marked |

## public/js/routes/notifications.js

| lines | string |
|---|---|
| 17 | Sign in to see your notifications. |
| 18 | Sign in |
| 48 | All notifications were marked read. |

## public/js/routes/pages.js

| lines | string |
|---|---|
| 15 | Forum rules |
| 17 | The rules haven't been written yet. |
| 22 | Last updated ${new Date(data.updatedAt).toLocaleString()} |
| 32 | Nothing yet — be the first! |
| 43 | ${entry.threads} threads · ${entry.replies} replies · ${entry.reactionsReceived} reactions received |
| 57 | Nothing has been deleted yet. |
| 62, 96 | Load older archive |
| 74 | post by |
| 76 | deleted |
| 77 | account deleted |
| 77 | post deleted |
| 78 | · deleted by |
| 116 | Rules saved. |

## public/js/routes/post.js

| lines | string |
|---|---|
| 10 | s el(), the kit |
| 45 | Write a thoughtful reply |
| 48 | post-list replies-list |
| 57 | No replies yet — be the first. |
| 59 | Write the first reply |
| 65 | No replies yet — sign in to start the conversation. |
| 66 | No replies to show. |
| 71 | Load older replies |
| 86, 102 | Report this post |
| 87 | Sign in to report this post to the mods. |
| 91 | Sign in |
| 103 | Your report goes straight to the mods along with the post. Describe what to look at — there is no email-based follow-up. |
| 115 | Up to 500 characters — say what a mod should look at. |
| 120 | post-actions form-actions |
| 121 | Send report |
| 125 | Back to the conversation |
| 137 | Your report was sent to the mods. |
| 160 | Your edit was saved. |
| 173 | Write a reply |
| 198 | Hide ${button.dataset.replyCount} replies |
| 199 | Show ${button.dataset.replyCount} replies |
| 214 | Hide ${page.replies.length} replies |
| 247 | , button.dataset.quoteSnippet ?? |
| 254 | last changed by a user edit |
| 281 | The reply list is no longer available. Reload the conversation. |
| 290 | s own actions merge into handleButtonAction |
| 329 | :scope > .edit-history-panel |

## public/js/routes/profile.js

| lines | string |
|---|---|
| 9 | s heading/text/panel/input family — and the wave |
| 36 | Profile unavailable |
| 37 | This profile is not available to you. |
| 79 | Famous Forumer |
| 80 | Mega Forumer |
| 81 | Big Forumer |
| 82 | Standard forumer |
| 83 | New Forumer |
| 108 | Avatar of ${profile.username} |
| 126 | ${Number(profile.postsCount \|\| 0)} posts · ${Number(profile.repliesCount \|\| 0)} replies |
| 143 | Avatar awaiting review |
| 157 | Report profile |
| 170 | This user is banned. |
| 172 | This user is banned — reactivates in |
| 178 | This member hasn't added a bio yet. |
| 193 | Profile picture |
| 194 | Uploads are reviewed by mods before they appear publicly. |
| 197 | Profile picture (JPEG, PNG, or WebP; up to 1 MiB) |
| 200 | Upload picture |
| 219 | Promote to admin |
| 220 | Demote to member |
| 236 | Enter a valid ${SOCIAL_LABELS[invalid[0]]} handle. |
| 252 | Your profile was updated. |
| 260 | Your profile picture was updated. |
| 274 | Delete this thread? |
| 274 | Delete this reply? |
| 276 | Your post and the entire conversation under it are deleted — including other people's replies. This cannot be undone. |
| 277 | Your reply is deleted. Its replies stay in the thread. This cannot be undone. |
| 288 | The post was deleted. |
| 300 | Block @${username}? |
| 301 | You will no longer see their posts, and they can no longer see your profile or posts, reply, react, or message. You can undo it from your account settings. |
| 307 | Blocked @${username}. |
| 320 | Delete your Wempo Account? |
| 321 | s replies inside those threads — plus your replies — and any sub-replies hanging off your replies in other members |
| 328 | Your Wempo Account was deleted. You are signed out. |
| 335 | details.open = isOwnProfile |
| 342 | s actions merge into handleButtonAction |
| 347 | dashboard owns password writes; the forum |
| 362 | Write some CSS first, or use Remove to clear it. |
| 366 | CSS saved — a mod will review it. |
| 371 | Custom CSS removed. |

## public/js/routes/reports.js

| lines | string |
|---|---|
| 15 | That report target is no longer available. |
| 20 | Report this profile |
| 20, 36 | Report this post |
| 37 | Your report was sent to the mods. |
| 41 | s open/close buttons merge into handleButtonAction |

## public/js/routes/twofa.js

| lines | string |
|---|---|
| 21 | Two-factor sign-in |
| 23 | Signing in needs your password and a 6-digit code from your authenticator app. Turn it off here only if you still hold the secret. |
| 34, 84 | Current password |
| 36 | Enter your current password — the secret is shown only after it verifies. |
| 38 | Enable two-factor |
| 47 | The authenticator's 6-digit code — or, if you lost your authenticator, an unburned backup code. |
| 49 | Turn off two-factor |
| 57 | Backup codes |
| 58 | If you lose your authenticator, a backup code signs you in once. Each code works a single time. |
| 61 | Generate new codes |
| 79 | Generate 10 new codes? Your current backup codes stop working the moment the new set is created. |
| 90 | The 6-digit code proves the authenticator; a backup code works instead if the app is lost. |
| 92 | Generate codes |
| 102 | Each code signs you in once. These are shown only now — copy or write them down. |
| 130 | Add the secret to your authenticator, then confirm with a code. |
| 137 | Type this secret into your authenticator app (or paste the otpauth line). It shows once — reload throws it away until you confirm. |
| 148 | otpauth URI |
| 161 | Turn on two-factor |
| 171 | Two-factor sign-in is on. Keep your authenticator safe. |
| 181 | Two-factor sign-in is off. Your backup codes were wiped. |

## public/js/theme.js

| lines | string |
|---|---|
| 67, 70 | Switch to light theme |
| 67, 70 | Switch to dark theme |

## public/js/turnstile.js

| lines | string |
|---|---|
| 18 | The human-verification widget failed to load. Refresh the page and try again. |
| 109 | Please complete the human-verification step first. |

## public/js/wall.js

| lines | string |
|---|---|
| 1 | s ask): visitors leave short posts on a member |
| 16 | Say something nice on this member's wall. The profile owner can pin posts — nothing else. |
| 29 | Post to the wall |
| 32 | Post to wall |
| 39 | The wall could not be loaded. |
| 44 | Be the first to write on the wall! |
| 44 | The wall is empty. |
| 92 | Posted to the wall. |
| 100 | Pinned to the wall. |
| 105 | Unpinned from the wall. |

## Server class (HTTP error strings rendered to users - not edited, catalogued only)

| source | status | string |
|---|---|---|
| worker.mjs:68 | 404 | That API endpoint does not exist. |
| worker.mjs:69 | 404 | Not found. |
| worker.mjs:118 | 503 | The forum database is not configured. |
| api/accounts.mjs:89 | 400 | That sign-in link is incomplete. Sign in again. |
| api/appeals.mjs:44 | 409 | That appeal was already decided. |
| api/appeals.mjs:65 | 409 | That appeal was already decided. |
| api/appeals.mjs:108 | 404 | Appeal not found. |
| api/appeals.mjs:114 | 404 | Appeal not found. |
| api/appeals.mjs:134 | 400 | Enter the username of the banned account. |
| api/appeals.mjs:159 | 401 | The username or password is incorrect. |
| api/appeals.mjs:165 | 400 | That account has no active ban to appeal. |
| api/archive.mjs:20 | 400 | A before cursor must be a positive id. |
| api/attachments.mjs:52 | 400 | Attach up to |
| api/attachments.mjs:60 | 413 | That upload is too large. |
| api/attachments.mjs:69 | 400 | The upload could not be read. |
| api/attachments.mjs:82 | 400 | The upload could not be read. |
| api/attachments.mjs:94 | 413 | Each image must be 10 MiB or smaller. |
| api/attachments.mjs:99 | 400 | Only JPEG, PNG, WebP, and GIF images can be attached. |
| api/attachments.mjs:106 | 400 | That image could not be read. Try re-saving it and uploading again. |
| api/attachments.mjs:128 | 400 | Attach up to |
| api/attachments.mjs:142 | 400 | One of the selected GIFs is not available. |
| api/attachments.mjs:162 | 400 | One of the selected GIFs is not available. |
| api/attachments.mjs:270 | 409 | One of the selected GIFs is no longer available. |
| api/attachments.mjs:278 | 409 | One of the selected GIFs is no longer available. |
| api/attachments.mjs:327 | 405 | That method is not supported. |
| api/attachments.mjs:333 | 404 | Attachment not found. |
| api/attachments.mjs:361 | 404 | Attachment not found. |
| api/attachments.mjs:375 | 404 | Attachment not found. |
| api/attachments.mjs:430 | 404 | Attachment not found. |
| api/attachments.mjs:444 | 404 | Attachment not found. |
| api/attachments.mjs:459 | 404 | Attachment not found. |
| api/attachments.mjs:477 | 409 | That attachment changed while moderation was in progress. Reload the queue and try again. |
| api/avatars.mjs:26 | 405 | That method is not supported. |
| api/avatars.mjs:28 | 404 | Picture not found. |
| api/avatars.mjs:32 | 404 | Picture not found. |
| api/avatars.mjs:49 | 404 | Picture not found. |
| api/avatars.mjs:62 | 415 | Upload a JPEG, PNG, or WebP image. |
| api/avatars.mjs:73 | 400 | The image upload could not be read. |
| api/avatars.mjs:76 | 400 | Choose an image to upload. |
| api/avatars.mjs:77 | 413 | Profile pictures must be 1 MiB or smaller. |
| api/avatars.mjs:80 | 415 | Only JPEG, PNG, and WebP images are supported. |
| api/avatars.mjs:85 | 400 | That image could not be read. Try re-saving it and uploading again. |
| api/avatars.mjs:178 | 409 | That avatar is not awaiting review. |
| api/avatars.mjs:190 | 404 | Member not found. |
| api/avatars.mjs:196 | 404 | Member not found. |
| api/bans.mjs:53 | 400 | The ban duration must be between a minute and a year from now. |
| api/bans.mjs:75 | 409 | This member is already banned. |
| api/bans.mjs:101 | 404 | No active ban was found for this member. |
| api/bans.mjs:106 | 409 | This ban was already revoked by another mod. |
| api/bans.mjs:122 | 404 | Member not found. |
| api/bans.mjs:127 | 404 | Member not found. |
| api/bans.mjs:130 | 403 | Owner accounts cannot be banned here. |
| api/blocks.mjs:23 | 404 | Member not found. |
| api/blocks.mjs:27 | 404 | Member not found. |
| api/blocks.mjs:29 | 400 | You cannot block yourself. |
| api/boards.mjs:20 | 400 | That board is not available. |
| api/bookmarks.mjs:57 | 400 | That page cursor is invalid. |
| api/bookmarks.mjs:110 | 405 | That method is not supported. |
| api/bookmarks.mjs:116 | 404 | Post not found. |
| api/bookmarks.mjs:118 | 404 | Post not found. |
| api/core/auth.mjs:47 | 403 | This network is banned from the forum. |
| api/core/auth.mjs:147 | 409 | This sign-in was completed in another tab. Reload to continue. |
| api/core/auth.mjs:170 | 403 | This request was blocked because its origin could not be verified. |
| api/core/auth.mjs:177 | 401 | Your session has expired. Reload the page and sign in again. |
| api/core/auth.mjs:180 | 403 | Your security token is out of date. Reload the page and try again. |
| api/core/auth.mjs:187 | 401 | Please sign in to do that. |
| api/core/auth.mjs:193 | 401 | Please sign in to do that. |
| api/core/auth.mjs:209 | 403 | Only admins can do that. |
| api/core/auth.mjs:219 | 403 | Only the owner can do that. |
| api/core/auth.mjs:228 | 403 | This account is currently banned. |
| api/core/http.mjs:61 | 403 | Human verification is required. |
| api/core/http.mjs:80 | 403 | Human verification could not be completed. Please try again. |
| api/core/http.mjs:92 | 403 | Human verification failed. Please try again. |
| api/core/images.mjs:19 | 500 | Stored picture data is invalid. |
| api/core/passwords.mjs:49 | 503 | Password security is not configured. Set PASSWORD_PEPPER using Wrangler. |
| api/filterstore.mjs:102 | 400 | Paste at least one entry to add. |
| api/filterstore.mjs:119 | 413 | The filter list is full (256 KiB cap). Remove entries first. |
| api/filterstore.mjs:142 | 413 | The filter list must be 256 KiB or smaller. |
| api/gifs.mjs:39 | 405 | That method is not supported. |
| api/gifs.mjs:44 | 404 | GIF not found. |
| api/gifs.mjs:48 | 404 | GIF not found. |
| api/gifs.mjs:53 | 404 | GIF not found. |
| api/gifs.mjs:67 | 404 | GIF not found. |
| api/gifs.mjs:92 | 400 | The upload could not be read. |
| api/gifs.mjs:96 | 400 | Attach an image file in the gif field. |
| api/gifs.mjs:103 | 413 | Images must be 10 MiB or smaller. |
| api/gifs.mjs:107 | 400 | The gallery takes GIF, JPEG, PNG, or WebP images. |
| api/gifs.mjs:114 | 400 | That image could not be read. Try re-saving it and uploading again. |
| api/gifs.mjs:294 | 404 | GIF not found. |
| api/gifs.mjs:302 | 404 | GIF not found. |
| api/members-admin.mjs:24 | 404 | Member not found. |
| api/members-admin.mjs:30 | 400 | Enter a valid reason. |
| api/members-admin.mjs:36 | 404 | Member not found. |
| api/modlogs.mjs:58 | 405 | That method is not supported. |
| api/modlogs.mjs:64 | 404 | Message not found. |
| api/modlogs.mjs:74 | 405 | That method is not supported. |
| api/modlogs.mjs:82 | 404 | Message not found. |
| api/modlogs.mjs:85 | 403 | Only the author or admins can delete that message. |
| api/modlogs.mjs:100 | 400 | That page cursor is invalid. |
| api/modlogs.mjs:130 | 400 | That page cursor is invalid. |
| api/notifications.mjs:95 | 500 | Notification label too long. |
| api/notifications.mjs:138 | 405 | That method is not supported. |
| api/notifications.mjs:150 | 405 | That method is not supported. |
| api/notifications.mjs:163 | 405 | That method is not supported. |
| api/polls.mjs:73 | 404 | Post not found. |
| api/polls.mjs:75 | 404 | Post not found. |
| api/polls.mjs:78 | 400 | Only thread roots can carry a poll. |
| api/polls.mjs:81 | 403 | Only the author can add a poll to this thread. |
| api/polls.mjs:84 | 409 | This thread already has a poll. |
| api/polls.mjs:87 | 400 | Enter the poll options as a list. |
| api/polls.mjs:90 | 400 | Add 2 to |
| api/polls.mjs:105 | 400 | That would duplicate a poll option. |
| api/polls.mjs:135 | 404 | Post not found. |
| api/polls.mjs:137 | 404 | Post not found. |
| api/polls.mjs:139 | 404 | That thread has no poll. |
| api/polls.mjs:141 | 409 | This poll is closed. |
| api/polls.mjs:146 | 400 | Choose one of the poll options. |
| api/polls.mjs:153 | 400 | Choose one of the poll options. |
| api/posts-feed.mjs:348 | 400 | The mine param must be 0 or 1. |
| api/posts-feed.mjs:352 | 401 | Sign in to see your posts. |
| api/posts-feed.mjs:357 | 400 | That page cursor is invalid. |
| api/posts-feed.mjs:363 | 400 | That page cursor is invalid. |
| api/posts-feed.mjs:366 | 400 | That page cursor is invalid. |
| api/posts-feed.mjs:415 | 404 | Post not found. |
| api/posts-feed.mjs:421 | 404 | Post not found. |
| api/posts-write.mjs:37 | 400 | Invalid Idempotency-Key header. |
| api/posts-write.mjs:65 | 410 | This creation request already completed, but that post has since been deleted. |
| api/posts-write.mjs:85 | 409 | This older creation request cannot be safely verified after edits. Submit again with a new Idempotency-Key. |
| api/posts-write.mjs:101 | 409 | Idempotency-Key was already used for a different submission. Submit again to create the changed content. |
| api/posts-write.mjs:112 | 410 | This creation request already completed, but that post has since been deleted. |
| api/posts-write.mjs:129 | 410 | This creation request already completed, but that post has since been deleted. |
| api/posts-write.mjs:134 | 409 | Your post is still being processed. Retry shortly. |
| api/posts-write.mjs:187 | 409 | The conversation changed while your reply was being published. Please try again. |
| api/posts-write.mjs:192 | 409 | Your post could not be published. Please try again. |
| api/posts-write.mjs:223 | 410 | This creation request already completed, but that post has since been deleted. |
| api/posts-write.mjs:229 | 400 | Attach up to |
| api/posts-write.mjs:241 | 403 | Only admins can post updates. |
| api/posts-write.mjs:338 | 404 | Post not found. |
| api/posts-write.mjs:340 | 404 | Post not found. |
| api/posts-write.mjs:342 | 403 | Only the author can edit this post. |
| api/posts-write.mjs:368 | 404 | Post not found. |
| api/posts-write.mjs:383 | 404 | Post not found. |
| api/posts-write.mjs:387 | 404 | Post not found. |
| api/posts-write.mjs:471 | 404 | Post not found. |
| api/posts-write.mjs:473 | 404 | Post not found. |
| api/posts-write.mjs:475 | 403 | Only the author can delete this post. |
| api/posts-write.mjs:489 | 404 | Post not found. |
| api/posts-write.mjs:504 | 404 | Post not found. |
| api/posts-write.mjs:506 | 404 | Post not found. |
| api/posts-write.mjs:509 | 400 | Choose like or dislike. |
| api/posts-write.mjs:532 | 405 | That method is not supported. |
| api/posts-write.mjs:537 | 404 | Post not found. |
| api/posts-write.mjs:539 | 404 | Post not found. |
| api/profiles.mjs:37 | 404 | Member not found. |
| api/profiles.mjs:40 | 404 | Member not found. |
| api/profiles.mjs:130 | 400 | Provide a bio, socials, accent, banner, or flair value to update. |
| api/profiles.mjs:135 | 400 | Your bio must be 10000 characters or fewer. |
| api/profiles.mjs:139 | 400 | Your bio must be 10000 characters or fewer. |
| api/profiles.mjs:150 | 400 | The socials value must be an object. |
| api/profiles.mjs:155 | 400 | That social platform is not supported. |
| api/profiles.mjs:161 | 400 | Enter a valid |
| api/profiles.mjs:185 | 400 | Pick a banner color like #4d8fc4, or leave it blank to clear. |
| api/profiles.mjs:192 | 400 | Banner text must be 80 characters or fewer. |
| api/profiles.mjs:198 | 400 | Flairs must be 32 characters or fewer. |
| api/profiles.mjs:208 | 400 | Pick a profile color like #4d8fc4, or leave it blank to clear. |
| api/profiles.mjs:242 | 400 | Provide a bio, socials, or accent value to update. |
| api/profiles.mjs:302 | 413 | Custom CSS must be 20 KiB or smaller. |
| api/profiles.mjs:342 | 404 | Not found. |
| api/profiles.mjs:347 | 404 | Not found. |
| api/profiles.mjs:388 | 404 | Not found. |
| api/profiles.mjs:391 | 409 | This CSS submission is stale. Refresh the moderation queue. |
| api/profiles.mjs:398 | 409 | This CSS submission changed after it was loaded. Refresh the moderation queue. |
| api/profiles.mjs:409 | 409 | This CSS submission changed while being approved. Refresh the moderation queue. |
| api/profiles.mjs:421 | 409 | This CSS submission changed while being rejected. Refresh the moderation queue. |
| api/profiles.mjs:436 | 400 | Enter your current password and a new password of 12–128 characters. |
| api/profiles.mjs:441 | 401 | Your current password is incorrect. |
| api/profiles.mjs:550 | 404 | Account not found. |
| api/relay.mjs:35 | 503 | Relay is not configured. |
| api/relay.mjs:41 | 403 | Relay refused. |
| api/relay.mjs:83 | 400 | A valid client IP is required. |
| api/relay.mjs:86 | 503 | Forum network-ban verification is not configured. |
| api/relay.mjs:109 | 400 | Enter a username and password. |
| api/relay.mjs:140 | 400 | Enter a username and a valid password. |
| api/relay.mjs:151 | 404 | No such user. |
| api/relay.mjs:174 | 400 | A valid user ID is required. |
| api/replies.mjs:37 | 404 | Post not found. |
| api/replies.mjs:42 | 404 | Post not found. |
| api/replies.mjs:47 | 400 | That reply cursor is invalid. |
| api/replies.mjs:81 | 410 | This creation request already completed, but that post has since been deleted. |
| api/replies.mjs:84 | 404 | Post not found. |
| api/replies.mjs:89 | 400 | Attach up to |
| api/replies.mjs:107 | 400 | Replies must be attached to a public conversation, not another reply. |
| api/replies.mjs:120 | 400 | Replies must be attached to a public conversation, not another reply. |
| api/replies.mjs:123 | 400 | Replies only go one level deep. |
| api/replies.mjs:164 | 409 | The conversation is no longer public or your account cannot post. |
| api/reports.mjs:23 | 404 | Post not found. |
| api/reports.mjs:25 | 404 | Post not found. |
| api/reports.mjs:26 | 400 | You cannot report your own post. |
| api/reports.mjs:41 | 409 | You already have an open report for this post. |
| api/reports.mjs:93 | 409 | This report was already resolved by another mod. |
| api/reports.mjs:103 | 409 | This report was already resolved by another mod. |
| api/reports.mjs:114 | 404 | Report not found. |
| api/reports.mjs:118 | 400 | Choose dismiss or hide post. |
| api/reports.mjs:124 | 404 | Open report not found. |
| api/reports.mjs:151 | 404 | Thread not found. |
| api/reports.mjs:156 | 404 | Thread not found. |
| api/reports.mjs:159 | 400 | Only thread roots can be pinned. |
| api/reports.mjs:172 | 404 | Thread not found. |
| api/reports.mjs:174 | 409 | This thread is already pinned. |
| api/reports.mjs:184 | 404 | Thread not found. |
| api/reports.mjs:186 | 409 | This thread is not pinned. |
| api/reports.mjs:250 | 404 | Member not found. |
| api/reports.mjs:297 | 404 | Not found. |
| api/rules.mjs:48 | 413 | The rules must be 20 KiB or smaller. |
| api/search.mjs:18 | 400 | Search must be 1–100 characters long. |
| api/session.mjs:47 | 409 | First-time setup has already been completed. |
| api/session.mjs:58 | 409 | That username is already taken. |
| api/session.mjs:66 | 400 | Username must be 3–24 characters and use only letters, numbers, and underscores. |
| api/session.mjs:69 | 400 | Password must be 12–128 characters long. |
| api/session.mjs:113 | 409 | First-time setup has already been completed. |
| api/session.mjs:115 | 503 | First-time setup is locked. Configure SETUP_SECRET using Wrangler before creating the owner account. |
| api/session.mjs:130 | 403 | The setup secret is not correct. |
| api/session.mjs:138 | 409 | First-time setup has already been completed. |
| api/session.mjs:171 | 403 | This account is currently banned. |
| api/session.mjs:192 | 400 | Enter your username and password. |
| api/session.mjs:202 | 401 | The username or password is incorrect. |
| api/session.mjs:235 | 403 | This account is currently banned. |
| api/subscriptions.mjs:134 | 405 | That method is not supported. |
| api/subscriptions.mjs:140 | 404 | Post not found. |
| api/subscriptions.mjs:142 | 404 | Post not found. |
| api/subscriptions.mjs:146 | 400 | Only thread roots can be subscribed to. |
| api/suggestions.mjs:19 | 405 | That method is not supported. |
| api/suggestions.mjs:24 | 404 | Post not found. |
| api/suggestions.mjs:26 | 404 | Post not found. |
| api/suggestions.mjs:28 | 400 | Only suggestions can be marked resolved or declined. |
| api/suggestions.mjs:31 | 400 | Choose a suggestion status. |
| api/suggestions.mjs:39 | 400 | Choose resolved, declined, or open. |
| api/twofa.mjs:79 | 400 | Enter your current password to start two-factor setup. |
| api/twofa.mjs:84 | 404 | Your account could not be found. |
| api/twofa.mjs:86 | 401 | Your current password is incorrect. |
| api/twofa.mjs:89 | 409 | Two-factor authentication is already on. Turn it off first. |
| api/twofa.mjs:107 | 400 | Enter the 6-digit code from your authenticator app. |
| api/twofa.mjs:111 | 400 | Start the two-factor setup first — there is no pending secret. |
| api/twofa.mjs:113 | 401 | That code is not correct. Nothing has been changed. |
| api/twofa.mjs:120 | 409 | Two-factor setup has already completed in another tab. |
| api/twofa.mjs:138 | 400 | Enter the 6-digit code from your authenticator app, or a backup code. |
| api/twofa.mjs:143 | 409 | Two-factor authentication is not on. |
| api/twofa.mjs:145 | 401 | That code is not correct. Nothing has been changed. |
| api/twofa.mjs:169 | 400 | Enter your current password to generate new backup codes. |
| api/twofa.mjs:174 | 404 | Your account could not be found. |
| api/twofa.mjs:176 | 401 | Your current password is incorrect. |
| api/twofa.mjs:181 | 400 | Enter the 6-digit code from your authenticator app, or a backup code. |
| api/twofa.mjs:184 | 401 | That code is not correct. Nothing has been changed. |
| api/twofa.mjs:224 | 400 | Enter the 6-digit code from your authenticator app, or a backup code. |
| api/twofa.mjs:231 | 401 | This verification request has expired. Sign in again. |
| api/twofa.mjs:243 | 401 | This verification request has expired. Sign in again. |
| api/twofa.mjs:247 | 401 | This verification request has expired. Sign in again. |
| api/twofa.mjs:250 | 401 | That code is not correct. |
| api/twofa.mjs:260 | 401 | This verification request has expired. Sign in again. |
| api/twofa.mjs:267 | 403 | This account is currently banned. |
| api/vendor/http.mjs:101 | 404 | Not found. |
| api/vendor/http.mjs:156 | 503 | Rate limiting is not configured for this endpoint. |
| api/vendor/http.mjs:163 | 429 | Too many requests. Please wait a little and try again. |
| api/vendor/http.mjs:176 | 403 | This account is currently banned. |
| api/vendor/http.mjs:183 | 413 | That upload is too large. |
| api/vendor/http.mjs:201 | 413 | That upload is too large. |
| api/vendor/http.mjs:217 | 415 | Send this form as JSON. |
| api/vendor/http.mjs:224 | 400 | The request body is not valid JSON. |
| api/vendor/http.mjs:227 | 400 | The request body must be a JSON object. |
| api/vendor/http.mjs:233 | 400 | Enter a valid |
| api/wall.mjs:59 | 403 | That wall is not available. |
| api/wall.mjs:91 | 404 | That member does not exist. |
| api/wall.mjs:95 | 403 | Wall posts are unavailable between you two. |
| api/wall.mjs:102 | 400 | Write something first. |
| api/wall.mjs:125 | 404 | That wall post does not exist. |
| api/wall.mjs:127 | 403 | Only the profile owner can pin wall posts. |

**Server strings:** 276
**Junk filter exclusions:** className strings and lowercase multi-token identifiers, URLs/data URIs, icon selectors, state/boolean literals, content-type names - internal identifiers, not user copy.
