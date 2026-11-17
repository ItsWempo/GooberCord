# String inventory - GooberCord rewrite client (branch `rewrite`)

Repo: /Users/itswempo/gc-rewrite

Method: all string literals + template literals extracted from public/js/** (vendor excluded), machine-filtered for CSS-class/selector/internal-identifier junk (documented below). Each row: source file:line + the string. Server-class strings (HttpError / json message strings that render as client toasts) are the last section - catalogued only, nothing edited.

## public/js/core/api.js

| lines | string |
|---|---|
| 36 | Your security token is out of date. |
| 63 | Invalid response (${response.status}) |
| 63, 71 | Request failed (${response.status}) |

## public/js/core/ws.js

| lines | string |
|---|---|
| 2 | GET /api/ws?channel=<id> |
| 199 | s registry — the lane |

## public/js/main.js

| lines | string |
|---|---|
| 64 | A new build is available. |

## public/js/ui/chat.js

| lines | string |
|---|---|
| 440 | s seat (the store |
| 451 | In here — ${members.length} |
| 499 | That message could not be sent. |
| 538 | Fetching the channel… |
| 540 | Nothing here yet — say the first word. |
| 544 | Load earlier |
| 581 | ) + (message.pending ? |
| 648 | See reactions |
| 673 | Delete this message? |
| 675 | The message and its attachments go with it. |
| 676 | ${message.authorName}'s message and its attachments go with it. |
| 691 | Message not found. |
| 706 | Edit message |
| 753 | The super set is Goober+ — the server answers without it. |
| 794 | No reactions left. |
| 824 | Write in the well — Enter sends, Shift+Enter breaks a line. |
| 912 | The file is larger than the ${Math.round(tierCap / 1048576)} MiB cap for this tier. |
| 916 | Attach at most one image. |
| 923 | Attachment failed. |
| 934 | Pending review |
| 941 | Attach an image |
| 984, 991 | Slowmode — wait ${left}s. |
| 999 | Search GIFs |
| 1000 | GIF search |
| 1021 | No GIFs for that — try another word. |
| 1029 | GIF search is not configured yet. |
| 1053 | Expressions are a server thing. |
| 1060 | This server hasn't added any emoji yet. |
| 1061 | This server hasn't added any stickers yet. |
| 1099 | This server hasn't added any sounds yet. |
| 1131 | someone is typing… |
| 1154 | The voice room is not connected yet. |
| 1175 | Up to ${UI_VOICE_MAX_PARTICIPANTS} ears here; audio rides the voice relay lane. |
| 1185 | ${member.username}${member.muted ? " (muted)" : ""} |
| 1201 | Nothing pinned in this channel yet. |
| 1210 | Pins cap at 250 per channel — the server's text is the truth at the cap. |
| 1223 | Search this server |
| 1225 | Words from the message |
| 1225 | Search term |
| 1243 | No hits for that here. |
| 1246 | That search term is invalid. |
| 1266 | Direct messages |
| 1318 | s socket seat also feeds the composer |

## public/js/ui/economy.js

| lines | string |
|---|---|
| 63 | absent body = full |
| 149 | Coin shop |
| 183 | Claim ${daily.grant ?? 25} coins |
| 196 | Daily claim |
| 197 | Balance |
| 198 | — earned today ${payload.earnedToday} / ceiling ${payload.dailyCeiling}. |
| 210 | Tenure started |
| 215 | You're not a Goober+ member yet — the bundle below buys your first term. |
| 222 | ${offer.price} now · ${offer.renewalPrice} renewal · ${offer.termDays}-day term |
| 239 | In grace until ${plus.graceUntil} — renewal keeps the perks coming. |
| 246 | Buy ${offer.name}? |
| 248 | ${offer.price} coins now. Renewal later is ${offer.renewalPrice} for another ${offer.termDays} days. |
| 292 | Banner color (#rrggbb) |
| 296 | Flair (2–16 characters, one line) |
| 299 | Your cosmetics |
| 324 | Gift Goober+ to a username |
| 325 | Priced on THEIR row — their first term costs full price. |
| 332 | Gift Goober+ to ${username \|\| "this member"}? |
| 334 | Their row prices it: their first term costs full price; a renewal extends their term 30 days. |
| 361 | Sign in to read your ledger. |
| 368 | No coin moves yet — claim your daily grant to start the ledger. |
| 374 | Load earlier |
| 408 | Goober Coins — open the shop |

## public/js/ui/expressions.js

| lines | string |
|---|---|
| 57 | This server already has <cap> <kind>. |
| 60, 66 | 2–32 characters: letters, numbers and underscores. |
| 63 | 2–30 characters: letters, numbers and underscores. |
| 93 | Emoji, stickers, and soundboard sounds — counts ride the current cap (a boost blessing shows here; history stays quiet). |
| 98, 106, 243 | You do not have permission to do that. |
| 114 | Fetching the inventory… |
| 143 | ${rows.length} / ${cap} — the cap rides the current boost tier. |
| 149 | This server already has ${cap} ${kind.singular}s. Delete one to add another. |
| 152 | Add the first ${kind.singular} |
| 156 | Add a ${kind.singular} |
| 159 | This server hasn't added any ${kind.singular}s yet. |
| 169 | expr-sound${kind.key === "sounds" ? " expr-sound-active" : ""} |
| 195 | Save name |
| 215 | Delete “${row.name}”? |
| 217 | The upload's bytes go with the row when nothing else uses them. |
| 240 | Add an expression |
| 264 | What are you adding? |
| 274 | File (emoji/sticker ≤256 KB image; sound ≤512 KB MP3 or OGG) |
| 287 | This server already has ${cap} ${entry.singular}s. Delete one to add another. |

## public/js/ui/landing.js

| lines | string |
|---|---|
| 62 | Your account is currently banned |
| 67 | No reason was provided. |
| 73 | Reactivates |
| 78 | Can't sign in right now |
| 81 | The Wempo Accounts sign-in isn't completing. Your sign-in link is single-use and may have expired or already been used. |
| 86 | Try again from Wempo Accounts |

## public/js/ui/members.js

| lines | string |
|---|---|
| 56, 141 | Fetching the roster… |
| 65 | It's just you in here so far — invite someone. |
| 66 | Invite or discover a server |
| 112 | Your nickname here |
| 115 | Save nickname |
| 152 | That member is not in this server. |
| 166 | No nickname set. |
| 183 | Joined |
| 184 | · account made |
| 190 | Came in on invite |
| 191 | Still owes verification. |
| 194 | Moderation notes |
| 205 | Friends & DMs |

## public/js/ui/mentions.js

| lines | string |
|---|---|
| 51 | No mentions waiting — the count pill in the rail tracks it. |

## public/js/ui/mod.js

| lines | string |
|---|---|
| 61 | Mod desk |
| 64, 448 | You do not have permission to do that. |
| 84 | Mod sections |
| 100 | AutoMod rules |
| 104 | No filter rules yet — add the first one to catch a word or pattern. |
| 108 | member-row rule-row |
| 115 | This server already has ${UI_FILTER_RULE_MAX} filter rules. |
| 119, 147 | New rule |
| 147 | Edit rule |
| 149 | Rule name |
| 150 | Shown in the alerts feed. |
| 152 | Terms: one per line. |
| 156 | Terms, one per line |
| 156 | One term or pattern per line. |
| 160 | Stops accepting input at the bound |
| 164 | ${termsBox.value.split("\n").length} lines · |
| 165 | ${termsBox.value.length} / ${UI_FILTER_RULE_TERM_CHARS * UI_FILTER_RULE_MAX_TERMS} characters |
| 166 | — one term or pattern per line. |
| 173 | Timeout minutes (the timeout action) |
| 180 | Block message |
| 182 | What a blocked send hears (≤ ${UI_FILTER_RULE_BLOCK_MESSAGE_MAX}; empty = the server's default). |
| 186 | Care flag (never acts — adds the care notice) |
| 189 | Screen nicknames too |
| 199 | Save rule |
| 208, 226 | input[name='rule-actions'] |
| 266 | Exempt roles (≤ ${UI_FILTER_RULE_EXEMPT_ROLES_MAX}) |
| 270 | Exempt channels (≤ ${UI_FILTER_RULE_EXEMPT_CHANNELS_MAX}) |
| 276 | input[name='exempt-roles'] |
| 279 | input[name='exempt-channels'] |
| 284 | input[name='exempt-roles']:checked |
| 288 | input[name='exempt-channels']:checked |
| 300 | No rule hits yet. |
| 318 | channel ${alert.channelId \|\| "unknown"} |
| 335 | No bans in place. |
| 339 | member ${ban.id} |
| 340 | ${ban.reason ? ban.reason + " · " : ""}${ban.bannedAt} |
| 357 | Ban by member id |
| 358 | The member's numeric id — the server refuses anything else. |
| 361, 569 | Reason (optional) |
| 391 | Inactivity window |
| 395 | Role filter (optional) |
| 400 | Candidates: joined before the cutoff, zero server-wide message activity, never the owner; non-owner actors prune strictly below their own position. |
| 402 | Count first (dry run) |
| 416 | Prune ${result.count} members? |
| 420 | Run prune |
| 445 | Attachment queue |
| 455 | The queue is empty. |
| 470 | ${attachment.uploaderName} · ${attachment.sizeBytes} bytes · ${attachment.mime} · ${attachment.createdAt} |
| 484 | Reject attachment #${attachment.id}? |
| 485 | The bytes are deleted with the flip. |
| 553 | Clear timeout |
| 567 | Ban ${member.nickname \|\| member.username}? |
| 586 | Kick ${member.nickname \|\| member.username}? |
| 588 | Their role assignments come off with the kick. |
| 601 | Mark rules verified |

## public/js/ui/rules-gate.js

| lines | string |
|---|---|
| 17 | You must accept this server's rules before doing that. |
| 38 | To keep going here, accept this server's rules. |
| 41 | This server has rules |
| 47 | Accept and continue |
| 60 | Not now |

## public/js/ui/settings.js

| lines | string |
|---|---|
| 77 | Manage sections |
| 83 | Mod desk |
| 100, 103, 109, 414 | You do not have permission to do that. |
| 119 | Server settings |
| 129 | Server name |
| 134 | Private (invite only) |
| 135 | Public (listed in discover) |
| 140 | Verification level |
| 141 | 0–4: higher levels ask newer accounts and members to verify. |
| 145 | Save settings |
| 176, 185 | Rules document |
| 176 | Leave empty to keep the gate off. |
| 181 | ${docBox.value.length} / ${UI_RULES_MAX} characters — clearing saves with the gate off. |
| 182 | Empty saves with the gate off. |
| 185 | Save rules |
| 206 | Rules gate |
| 211 | Delete this server |
| 213 | Delete server |
| 214 | Delete this server? |
| 215 | Everything goes: messages, channels, roles, invites. This cannot be undone. |
| 224 | Server deleted |
| 232, 363 | Could not delete |
| 272 | Create channel |
| 294 | Create a channel |
| 297 | That server has reached its channel limit. (${counts} of ${UI_MAX_CHANNELS_PER_SERVER} — the one pool counts text, voice, and categories.) |
| 307 | ${(server.categories \|\| []).length} of ${UI_CATEGORIES_MAX_PER_SERVER} |
| 309 | New category |
| 334 | Rename category |
| 355 | Delete this category? |
| 356 | Its channels un-file; they are not deleted. |
| 377 | Channel rows |
| 391 | Delete #${channel.name}? |
| 392 | Its messages, attachments, and read states go with it. |
| 440 | allow ${bit} |
| 446 | deny ${bit} |
| 464 | (read-only — above your position) |
| 468 | Clear overwrite |
| 469 | Clear this overwrite? |
| 470 | The role falls back to the layer underneath it. |
| 481 | Save overwrite |
| 515 | Create role |
| 533 | ${list.length} of ${UI_ROLES_MAX} (the parity cap includes @everyone and is never raised by boosts). |
| 541 | · position ${role.position} |
| 546 | New role |
| 557 | Fetching the roster… |
| 564 | That role does not exist. |
| 580 | Color (#rrggbb, empty = none) |
| 585 | Moving onto an occupied position swaps the two roles. |
| 594 | Save role |
| 621 | Delete role |
| 622 | Delete ${role.name}? |
| 623 | Members holding it lose it; assignments go with the row. |
| 634 | Members holding this role |
| 685 | · you (owner, immune) |
| 719 | Empty selects never — the server treats empty, 0 and absent alike as never. |
| 723 | Use cap |
| 723 | Empty selects unlimited. |
| 725 | Mint invite |
| 735 | Fresh invite: |
| 750 | Revoke ${invite.code}? |
| 751 | New joins stop immediately; past uses stay counted. |
| 757 | Could not revoke |
| 773 | expires |
| 788 | Join a server |
| 796 | Invite code or link |
| 797 | Paste the code, or a full invite link — the last path segment is the code. |
| 805 | That invite is no longer valid. |
| 812 | You are already in that server. |
| 820 | With an invite |
| 833, 858 | Open for discovery |
| 834 | Fetching open servers… |
| 840 | Join ${server.name} (${server.memberCount} members) |
| 860 | Nothing open right now — an invite link still works. |

## public/js/ui/shell.js

| lines | string |
|---|---|
| 63, 64, 285, 296 | Direct messages |
| 113 | Messages land here — the chat wave is next. |
| 126 | No channels yet — the manage wave adds creating them. |
| 201, 202 | Join a server |
| 229 | Manage this server |
| 238 | Mentions inbox |
| 248, 261 | Text channels |
| 270 | Join a server to see your channels. |
| 286 | Friends & requests |
| 290 | No conversations yet — start one from a member card. |
| 303 | Fetching conversations… |
| 339, 344 | Light theme |
| 339, 344 | Dark theme |
| 350 | Sign out |
| 358 | s rethink #4): "You |
| 368 | You're in. |
| 369 | Join with an invite link, or create a server from the + tile. |
| 377 | Pick a channel — its messages land here in the next build wave. |
| 398 | Pick a server to see its members. |

## public/js/ui/social.js

| lines | string |
|---|---|
| 109 | Leave the id filled in instead — one or the other. |
| 112 | By member id |
| 114 | Send request |
| 130 | Add a friend |
| 139 | Custom status |
| 140 | Optional, 128 characters or fewer. |
| 143 | Expires at (epoch, empty = no expiry) |
| 152 | Do not disturb |
| 156 | Clear the custom status |
| 158 | Clear the status text |
| 162 | Save status |
| 170 | )) body.statusText = text === |
| 186 | Your status |
| 193 | No friends yet — add one by username above. |
| 212 | Incoming request from |
| 227 | Outgoing request to |
| 236 | No requests waiting. |
| 242 | Blocked & ignored |
| 245 | No blocked or ignored accounts. |
| 249 | member ${block.userId} |
| 268, 364 | Friends & DMs |
| 270 | Who can send you requests |
| 273, 278 | Accepting requests — turn off |
| 273, 278 | Requests off — turn on |
| 299 | Block kind |
| 300 | Block (dissolves friendship) |
| 303 | Block or ignore |
| 306 | Block ${username}? |
| 341 | Direct messages |
| 349 | Messages land here — the chat wave is next. |
| 369 | Rename the group |
| 389 | Leave this group? |
| 393 | You are the last member — leaving makes the conversation gone. |
| 394 | You will stop receiving its messages. |

## Server class (HTTP error strings rendered to users - not edited, catalogued only)

| source | status | string |
|---|---|---|
| worker.mjs:165 | 404 | That API endpoint does not exist. |
| worker.mjs:166 | 404 | Not found. |
| worker.mjs:196 | 503 | The GooberCord database is not configured. |
| api/accounts.mjs:54 | 503 | Forum network-ban verification is unavailable. |
| api/accounts.mjs:69 | 403 | This network is banned from the forum. |
| api/accounts.mjs:105 | 403 | This account or network is currently banned. |
| api/accounts.mjs:184 | 400 | Enter your current password to generate new backup codes. |
| api/accounts.mjs:189 | 404 | Your account could not be found. |
| api/accounts.mjs:191 | 401 | Your current password is incorrect. |
| api/accounts.mjs:196 | 400 | Enter the 6-digit code from your authenticator app, or a backup code. |
| api/accounts.mjs:199 | 401 | That code is not correct. Nothing has been changed. |
| api/accounts.mjs:243 | 503 | TOTP challenge signing is not configured. Set the matching PASSWORD_PEPPER. |
| api/accounts.mjs:309 | 400 | Username must be 3–24 characters and use only letters, numbers, and underscores. |
| api/accounts.mjs:312 | 400 | Password must be 12–128 characters long. |
| api/accounts.mjs:338 | 409 | That username is already taken. |
| api/accounts.mjs:417 | 400 | Accent color must be a lowercase #rgb or #rrggbb hex color. |
| api/accounts.mjs:426 | 400 | Tagline must be 80 characters or fewer. |
| api/accounts.mjs:458 | 403 | Those are Goober+ perks. Get Goober+ in the coin shop to use them. |
| api/accounts.mjs:475 | 403 | Buy that cosmetic in the coin shop first. |
| api/accounts.mjs:478 | 403 | Buy that cosmetic in the coin shop first. |
| api/accounts.mjs:489 | 400 | Banner color must be a lowercase #rgb or #rrggbb hex color. |
| api/accounts.mjs:499 | 400 | Flair must be 2 to 16 characters, one line. |
| api/accounts.mjs:586 | 400 | Enter your username and password. |
| api/accounts.mjs:609 | 401 | The username or password is incorrect. |
| api/accounts.mjs:705 | 400 | Enter the 6-digit code from your authenticator app, or a backup code. |
| api/accounts.mjs:711 | 401 | This verification request has expired. Sign in again. |
| api/accounts.mjs:721 | 401 | This verification request has expired. Sign in again. |
| api/accounts.mjs:725 | 401 | This verification request has expired. Sign in again. |
| api/accounts.mjs:728 | 401 | That code is not correct. |
| api/accounts.mjs:761 | 403 | Only the owner can reset a password. |
| api/accounts.mjs:767 | 400 | Enter a username and a 12–128 character password. |
| api/accounts.mjs:771 | 503 | Password reset relay is not available. Try again shortly. |
| api/avatars.mjs:20 | 405 | That method is not supported. |
| api/avatars.mjs:22 | 404 | Picture not found. |
| api/avatars.mjs:26 | 404 | Picture not found. |
| api/avatars.mjs:43 | 404 | Picture not found. |
| api/coins.mjs:571 | 400 | That cosmetic is not in the shop. |
| api/coins.mjs:574 | 403 | That one is a Goober+ pack. Get Goober+ in the shop first. |
| api/coins.mjs:605 | 400 | Not enough Goober Coins for that. |
| api/coins.mjs:607 | 409 | You already own that cosmetic. |
| api/coins.mjs:627 | 400 | That ledger cursor is invalid. |
| api/coins.mjs:637 | 400 | That ledger page size is invalid. |
| api/coins.mjs:678 | 409 | Already claimed today. Come back tomorrow. |
| api/coins.mjs:692 | 400 | That voice channel is invalid. |
| api/coins.mjs:722 | 400 | That tier is not in the shop. |
| api/coins.mjs:751 | 409 | You already have full Goober+. |
| api/coins.mjs:778 | 400 | Not enough Goober Coins for that. |
| api/coins.mjs:799 | 400 | Enter the member you want to gift Goober+. |
| api/coins.mjs:803 | 404 | No member by that name. |
| api/conversations.mjs:136 | 400 | Send the member ids as an array. |
| api/conversations.mjs:143 | 400 | Member ids must be positive user ids. |
| api/conversations.mjs:145 | 400 | You are already a member of the conversation. |
| api/conversations.mjs:150 | 400 | A conversation needs at least one other member. |
| api/conversations.mjs:153 | 400 | A group chat can have at most 8 other members. |
| api/conversations.mjs:168 | 400 | One of those members does not exist. |
| api/conversations.mjs:189 | 403 | That member only accepts messages from friends. |
| api/conversations.mjs:222 | 500 | The conversation could not be created. Please try again. |
| api/conversations.mjs:236 | 500 | The conversation could not be created. Please try again. |
| api/conversations.mjs:320 | 404 | This conversation does not exist or you cannot view it. |
| api/conversations.mjs:356 | 404 | This conversation does not exist or you cannot view it. |
| api/conversations.mjs:359 | 400 | Group chats only. A dm IS its member list. |
| api/conversations.mjs:381 | 400 | Attach exactly one image. |
| api/conversations.mjs:403 | 400 | iconMediaId must be an attachment id, or null to clear it. |
| api/conversations.mjs:409 | 400 | Nothing to change. Send a name or an icon. |
| api/conversations.mjs:445 | 400 | That change did not apply. |
| api/conversations.mjs:471 | 400 | A valid user id is required. |
| api/conversations.mjs:479 | 409 | That group chat is full. |
| api/conversations.mjs:488 | 400 | That member does not exist. |
| api/conversations.mjs:517 | 409 | That member is already in this group chat. |
| api/conversations.mjs:539 | 404 | This conversation does not exist or you cannot view it. |
| api/conversations.mjs:563 | 404 | This conversation does not exist or you cannot view it. |
| api/conversations.mjs:602 | 400 | That read position is invalid. |
| api/conversations.mjs:612 | 404 | This conversation does not exist or you cannot view it. |
| api/conversations.mjs:615 | 400 | That read position is behind the current one. |
| api/conversations.mjs:627 | 400 | That message is not part of this thread. |
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
| api/core/http.mjs:78 | 403 | Human verification is required. |
| api/core/http.mjs:97 | 403 | Human verification could not be completed. Please try again. |
| api/core/http.mjs:109 | 403 | Human verification failed. Please try again. |
| api/core/images.mjs:19 | 500 | Stored picture data is invalid. |
| api/core/passwords.mjs:49 | 503 | Password security is not configured. Set PASSWORD_PEPPER using Wrangler. |
| api/emoji.mjs:233 | 400 | That id is invalid. |
| api/emoji.mjs:244 | 404 | That server does not exist or you are not in it. |
| api/emoji.mjs:329 | 400 | Attach exactly one image. |
| api/emoji.mjs:331 | 400 | Attach the image for this |
| api/emoji.mjs:343 | 400 | Reference one of your own uploaded images. |
| api/emoji.mjs:394 | 404 | That server does not exist or you are not in it. |
| api/emoji.mjs:395 | 403 | You do not have permission to do that. |
| api/emoji.mjs:397 | 400 | This server already has |
| api/emoji.mjs:405 | 400 | That image is already referenced elsewhere. |
| api/emoji.mjs:410 | 400 | Reference one of your own uploaded images. |
| api/emoji.mjs:451 | 404 | That server does not exist or you are not in it. |
| api/emoji.mjs:453 | 403 | You do not have permission to do that. |
| api/emoji.mjs:496 | 404 | That server does not exist or you are not in it. |
| api/emoji.mjs:498 | 403 | You do not have permission to do that. |
| api/emoji.mjs:538 | 403 | You do not have permission to do that. |
| api/filterrules.mjs:195 | 400 | A wildcard term must carry at least one character beside its stars. |
| api/filterrules.mjs:205 | 400 | A filter term must be at most |
| api/filterrules.mjs:237 | 400 | That regex term does not compile: |
| api/filterrules.mjs:301 | 400 | Too many terms for this server (at most |
| api/filterrules.mjs:307 | 400 | Enter at least one filter term. |
| api/filterstore.mjs:102 | 400 | Paste at least one entry to add. |
| api/filterstore.mjs:119 | 413 | The filter list is full (256 KiB cap). Remove entries first. |
| api/filterstore.mjs:142 | 413 | The filter list must be 256 KiB or smaller. |
| api/gifs.mjs:71 | 400 | Search for something between 1 and 64 characters. |
| api/gifs.mjs:77 | 400 | That page size is invalid. |
| api/media.mjs:76 | 415 | Send this upload as multipart/form-data. |
| api/media.mjs:91 | 400 | The upload could not be read. |
| api/media.mjs:102 | 400 | The upload could not be read. |
| api/media.mjs:114 | 400 | Attach the |
| api/media.mjs:198 | 500 | That image could not be stored. Please try again. |
| api/media.mjs:353 | 404 | Attachment not found. |
| api/media.mjs:364 | 404 | Attachment not found. |
| api/media.mjs:372 | 404 | Attachment not found. |
| api/media.mjs:393 | 404 | Attachment not found. |
| api/media.mjs:399 | 404 | Attachment not found. |
| api/media.mjs:406 | 400 | Attach exactly one image. |
| api/media.mjs:446 | 404 | Attachment not found. |
| api/media.mjs:464 | 404 | Attachment not found. |
| api/messages.mjs:404 | 404 | This channel does not exist or you cannot view it. |
| api/messages.mjs:406 | 403 | You do not have permission to do that. |
| api/messages.mjs:762 | 400 | Client message id must be between 8 and 64 characters. |
| api/messages.mjs:786 | 403 | Large-file uploads are a full Goober+ perk. |
| api/messages.mjs:790 | 400 | That upload reference is invalid. |
| api/messages.mjs:838 | 500 | The message could not be saved. Please try again. |
| api/messages.mjs:897 | 400 | That message cursor is invalid. |
| api/messages.mjs:906 | 400 | That message limit is invalid. |
| api/messages.mjs:912 | 404 | This channel does not exist or you cannot view it. |
| api/messages.mjs:1015 | 404 | This channel does not exist or you cannot view it. |
| api/messages.mjs:1046 | 400 | That upload reference is invalid. |
| api/messages.mjs:1058 | 400 | Attach at most one image. |
| api/messages.mjs:1062 | 404 | This channel does not exist or you cannot view it. |
| api/messages.mjs:1079 | 400 | Attach at most one image. |
| api/messages.mjs:1138 | 404 | Message not found. |
| api/messages.mjs:1142 | 404 | Message not found. |
| api/messages.mjs:1192 | 404 | Message not found. |
| api/messages.mjs:1240 | 404 | Message not found. |
| api/messages.mjs:1248 | 403 | You do not have permission to do that. |
| api/messages.mjs:1264 | 400 | This channel already has |
| api/messages.mjs:1287 | 404 | This channel does not exist or you cannot view it. |
| api/presence.mjs:215 | 503 | Presence is not available right now. |
| api/presence.mjs:230 | 503 | Presence is not available right now. |
| api/presence.mjs:240 | 400 | That status is invalid. |
| api/presence.mjs:248 | 400 | That status is invalid. |
| api/presence.mjs:251 | 400 | Custom status must be 128 characters or fewer. |
| api/presence.mjs:256 | 400 | That status expiry is invalid. |
| api/presence.mjs:268 | 400 | That presence state is invalid. |
| api/servers.mjs:151 | 409 | You already boosted this server. |
| api/servers.mjs:152 | 403 | You do not have permission to do that. |
| api/servers.mjs:176 | 404 | You have not boosted this server. |
| api/servers.mjs:207 | 500 | The server could not be created. Please try again. |
| api/servers.mjs:506 | 400 | Attach exactly one image. |
| api/servers.mjs:531 | 400 | is_public must be true or false. |
| api/servers.mjs:542 | 400 | iconMediaId must be an attachment id or null. |
| api/servers.mjs:556 | 400 | verification_level must be one of 0, 1, 2, 3, 4. |
| api/servers.mjs:573 | 400 | rules_text must be a rules document or null to clear it. |
| api/servers.mjs:595 | 400 | Nothing to change. Send a new name and/or a new icon. |
| api/servers.mjs:654 | 403 | You do not have permission to do that. |
| api/servers.mjs:667 | 403 | You do not have permission to do that. |
| api/servers.mjs:813 | 400 | category_id must be a category id or null. |
| api/servers.mjs:823 | 400 | Channel kind must be either text or voice. |
| api/servers.mjs:835 | 400 | private must be true or false. |
| api/servers.mjs:876 | 400 | That server has reached its channel limit. |
| api/servers.mjs:880 | 403 | You do not have permission to do that. |
| api/servers.mjs:967 | 400 | Send this form as JSON. |
| api/servers.mjs:978 | 400 | That invite expiry is invalid. |
| api/servers.mjs:984 | 400 | That invite use cap is invalid. |
| api/servers.mjs:1026 | 404 | That server does not exist. |
| api/servers.mjs:1029 | 403 | You do not have permission to do that. |
| api/servers.mjs:1037 | 500 | The invite could not be created. Please try again. |
| api/servers.mjs:1080 | 403 | You are banned from that server. |
| api/servers.mjs:1098 | 404 | That invite is no longer valid. |
| api/servers.mjs:1191 | 404 | That invite does not exist. |
| api/servers.mjs:1199 | 404 | That invite does not exist. |
| api/servers.mjs:1289 | 400 | Role color must be a #rrggbb hex string or null. |
| api/servers.mjs:1301 | 400 | Unknown permission: |
| api/servers.mjs:1331 | 403 | You do not have permission to do that. |
| api/servers.mjs:1392 | 403 | You do not have permission to do that. |
| api/servers.mjs:1400 | 500 | The role could not be created. Please try again. |
| api/servers.mjs:1421 | 403 | You do not have permission to do that. |
| api/servers.mjs:1425 | 404 | That role does not exist. |
| api/servers.mjs:1441 | 400 | position must be a non-negative integer. |
| api/servers.mjs:1446 | 400 | Nothing to change. Send a name, a color, or a position. |
| api/servers.mjs:1455 | 403 | You do not have permission to do that. |
| api/servers.mjs:1476 | 403 | You do not have permission to do that. |
| api/servers.mjs:1496 | 403 | You do not have permission to do that. |
| api/servers.mjs:1518 | 403 | You do not have permission to do that. |
| api/servers.mjs:1548 | 403 | You do not have permission to do that. |
| api/servers.mjs:1566 | 404 | That role does not exist. |
| api/servers.mjs:1574 | 404 | That member is not in this server. |
| api/servers.mjs:1604 | 403 | You do not have permission to do that. |
| api/servers.mjs:1635 | 403 | You do not have permission to do that. |
| api/servers.mjs:1654 | 403 | You do not have permission to do that. |
| api/servers.mjs:1787 | 400 | Nothing to change. Send a nickname (or null to clear it). |
| api/servers.mjs:1832 | 403 | You do not have permission to do that. |
| api/servers.mjs:1864 | 403 | You do not have permission to do that. |
| api/servers.mjs:1923 | 400 | That list is too long — at most |
| api/servers.mjs:1935 | 400 | A filter rule needs a name and at least one term. |
| api/servers.mjs:1944 | 400 | actions must be an array. |
| api/servers.mjs:1947 | 400 | actions rides one or more of |
| api/servers.mjs:1959 | 400 | blockMessage must be a string. |
| api/servers.mjs:1968 | 400 | timeoutMinutes must be one of |
| api/servers.mjs:2045 | 400 | This server already has |
| api/servers.mjs:2047 | 403 | You do not have permission to do that. |
| api/servers.mjs:2077 | 403 | You do not have permission to do that. |
| api/servers.mjs:2090 | 403 | You do not have permission to do that. |
| api/servers.mjs:2107 | 400 | That alerts limit is invalid. |
| api/servers.mjs:2160 | 403 | You do not have permission to do that. |
| api/servers.mjs:2178 | 400 | A ban reason must be a non-empty string or omitted. |
| api/servers.mjs:2182 | 400 | A ban reason must be at most |
| api/servers.mjs:2194 | 400 | user_id must be a user id. |
| api/servers.mjs:2198 | 400 | You cannot ban yourself. |
| api/servers.mjs:2254 | 403 | You do not have permission to do that. |
| api/servers.mjs:2280 | 403 | You do not have permission to do that. |
| api/servers.mjs:2302 | 400 | minutes must be one of |
| api/servers.mjs:2316 | 403 | You do not have permission to do that. |
| api/servers.mjs:2339 | 403 | You do not have permission to do that. |
| api/servers.mjs:2378 | 400 | days must be one of 7 or 30. |
| api/servers.mjs:2381 | 400 | dry_run must be true or false — preview counts, the false run kicks. |
| api/servers.mjs:2387 | 400 | role_filter_id must be a role id or omitted. |
| api/servers.mjs:2396 | 403 | You do not have permission to do that. |
| api/servers.mjs:2439 | 403 | You do not have permission to do that. |
| api/servers.mjs:2489 | 400 | is_spoiler must be true or false. |
| api/servers.mjs:2580 | 404 | That channel does not exist. |
| api/servers.mjs:2583 | 403 | You do not have permission to do that. |
| api/servers.mjs:2688 | 404 | That channel does not exist. |
| api/servers.mjs:2691 | 403 | You do not have permission to do that. |
| api/servers.mjs:2843 | 404 | That server does not exist. |
| api/servers.mjs:2846 | 403 | You do not have permission to do that. |
| api/servers.mjs:2923 | 400 | That server has reached its category limit. |
| api/servers.mjs:2927 | 403 | You do not have permission to do that. |
| api/servers.mjs:2942 | 403 | You do not have permission to do that. |
| api/servers.mjs:2961 | 403 | You do not have permission to do that. |
| api/servers.mjs:2965 | 404 | That category does not exist. |
| api/servers.mjs:2975 | 400 | position must be a non-negative integer. |
| api/servers.mjs:2980 | 400 | Nothing to change. Send a name or a position. |
| api/servers.mjs:2991 | 400 | position must be between 0 and |
| api/servers.mjs:3020 | 403 | You do not have permission to do that. |
| api/servers.mjs:3032 | 403 | You do not have permission to do that. |
| api/servers.mjs:3058 | 403 | You do not have permission to do that. |
| api/servers.mjs:3084 | 400 | Unknown |
| api/servers.mjs:3156 | 403 | You do not have permission to do that. |
| api/servers.mjs:3185 | 403 | You do not have permission to do that. |
| api/servers.mjs:3200 | 403 | You do not have permission to do that. |
| api/servers.mjs:3206 | 404 | That channel does not exist. |
| api/social.mjs:187 | 400 | Send a username or a user id for the friend request. |
| api/social.mjs:230 | 400 | That friend request is already pending. |
| api/social.mjs:259 | 400 | Your friends list is full. |
| api/social.mjs:382 | 400 | Send acceptRequests as true or false. |
| api/social.mjs:416 | 400 | That user id is invalid. |
| api/social.mjs:457 | 500 | The block could not be saved. Please try again. |
| api/social.mjs:468 | 400 | That user id is invalid. |
| api/social.mjs:501 | 404 | Message not found. |
| api/social.mjs:508 | 400 | Send an emoji shorter than |
| api/social.mjs:525 | 404 | This channel does not exist or you cannot view it. |
| api/social.mjs:533 | 403 | Super reactions are a Goober+ perk. |
| api/social.mjs:583 | 400 | That user id is invalid. |
| api/social.mjs:586 | 400 | Remove your own reaction with your own request. |
| api/social.mjs:601 | 403 | Only the author can remove that reaction. |
| api/social.mjs:611 | 403 | You do not have permission to do that. |
| api/social.mjs:631 | 404 | This channel does not exist or you cannot view it. |
| api/soundboard.mjs:77 | 400 | That id is invalid. |
| api/soundboard.mjs:88 | 404 | That server does not exist or you are not in it. |
| api/soundboard.mjs:164 | 500 | That sound could not be stored. Please try again. |
| api/soundboard.mjs:216 | 400 | Attach exactly one sound. |
| api/soundboard.mjs:218 | 400 | Attach the sound file for this sound. |
| api/soundboard.mjs:225 | 400 | Reference one of your own uploaded sounds. |
| api/soundboard.mjs:242 | 400 | Reference one of your own uploaded sounds. |
| api/soundboard.mjs:268 | 409 | That sound name is already taken in this server. |
| api/soundboard.mjs:293 | 404 | That server does not exist or you are not in it. |
| api/soundboard.mjs:294 | 403 | You do not have permission to do that. |
| api/soundboard.mjs:296 | 400 | This server already has |
| api/soundboard.mjs:303 | 400 | That sound is already referenced elsewhere. |
| api/soundboard.mjs:308 | 400 | Reference one of your own uploaded sounds. |
| api/soundboard.mjs:316 | 500 | The sound could not be saved. Please try again. |
| api/soundboard.mjs:337 | 409 | That sound name is already taken in this server. |
| api/soundboard.mjs:343 | 404 | That server does not exist or you are not in it. |
| api/soundboard.mjs:344 | 404 | That sound does not exist. |
| api/soundboard.mjs:345 | 403 | You do not have permission to do that. |
| api/soundboard.mjs:375 | 404 | That server does not exist or you are not in it. |
| api/soundboard.mjs:376 | 404 | That sound does not exist. |
| api/soundboard.mjs:377 | 403 | You do not have permission to do that. |
| api/soundboard.mjs:416 | 403 | You do not have permission to do that. |
| api/sso.mjs:49 | 503 | Wempo Accounts sign-in is not configured. Set the shared RELAY_TOKEN on GooberCord. |
| api/sso.mjs:72 | 503 | Wempo Accounts sign-in has invalid RELAY_TOKEN configuration. |
| api/sso.mjs:114 | 400 | This sign-in link is malformed. Open it again from Wempo Accounts. |
| api/uploads.mjs:54 | 415 | Send each upload part as multipart/form-data. |
| api/uploads.mjs:65 | 400 | The upload part could not be read. |
| api/uploads.mjs:81 | 400 | The upload part could not be read. |
| api/uploads.mjs:204 | 400 | That file size is not a large upload. |
| api/uploads.mjs:224 | 400 | That file size is not a large upload. |
| api/uploads.mjs:278 | 400 | That request body is invalid. |
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
| api/ws.mjs:31 | 400 | That channel is invalid. |
| api/ws.mjs:40 | 404 | This channel does not exist or you cannot view it. |
| api/ws.mjs:64 | 503 | Chat is not available right now. |

**Server strings:** 314
**Junk filter exclusions:** className strings and lowercase multi-token identifiers, URLs/data URIs, icon selectors, state/boolean literals, content-type names - internal identifiers, not user copy.
