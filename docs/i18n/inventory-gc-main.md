# String inventory - GooberCord main client (legacy)

NOTE: this client is being REPLACED by the gc-rewrite branch `rewrite`. Inventory kept for completeness only.

Method: all string literals + template literals extracted from public/js/** (vendor excluded), machine-filtered for CSS-class/selector/internal-identifier junk (documented below). Each row: source file:line + the string. Server-class strings (HttpError / json message strings that render as client toasts) are the last section - catalogued only, nothing edited.

## public/js/api.js

| lines | string |
|---|---|
| 31 | Invalid response (${response.status}) |
| 31, 39 | Request failed (${response.status}) |

## public/js/attachments.js

| lines | string |
|---|---|
| 9 | s SINGLE client mirror: the free tier |
| 21 | Images must be |
| 21 | MiB or smaller. |
| 73 | Attached image |
| 81 | Attachment pending review |

## public/js/chat-store.js

| lines | string |
|---|---|
| 3 | s frontend. Task 12 |
| 46 | s OLDEST id (nextAfter is the page |

## public/js/dom.js

| lines | string |
|---|---|
| 33 | Today at |

## public/js/expression-manage.js

| lines | string |
|---|---|
| 11 | s resolver answers PER SERVER — the manage dialog |
| 34, 36 | Use a |
| 35, 37 | character name of letters, numbers and underscores. |
| 47 | Only JPEG, PNG, WebP, and GIF images can be attached. |
| 53 | s parity law — the uploader |
| 68 | Emoji must be |
| 69 | Stickers must be |
| 111 | payload truth (W-B0 |
| 137, 329 | Rename : |
| 143 | Delete : |
| 173 | s OWN file cap (the parity law |
| 189 | Name (2- |
| 190 | The new |
| 194 | Choose the image (JPEG, PNG, WebP, or GIF) |
| 211 | Attach the image for this emoji. |
| 212 | Attach the image for this sticker. |
| 231 | This server already has N emoji. |
| 232, 356 | The expression could not be saved. Please try again. |
| 259 | This server has no emoji yet. |
| 260 | This server has no stickers yet. |
| 296 | That server does not exist or you are not in it. |
| 301 | Manage expressions |
| 302 | Upload, rename, or remove this server's emoji and stickers. |
| 334 | Rename |
| 378 | Delete |
| 379 | This removes : |
| 380 | : from this server. Messages that already used it keep showing it as text — nothing breaks. |
| 395 | The expression could not be deleted. |

## public/js/gifs.js

| lines | string |
|---|---|
| 94 | GIF search results |
| 99 | Search GIFs |
| 100 | GIF search |
| 105 | Load more GIFs |
| 116 | GIF from Tenor |
| 120 | Insert the GIF |
| 148 | Nothing found for that search. |
| 163 | GIF search is unavailable right now. |
| 178 | Search for something between 1 and 64 characters. |
| 189 | GIF picker |
| 190 | Search GIF, then pick one — its link pastes into the message. |

## public/js/icons.js

| lines | string |
|---|---|
| 109 | Log out |
| 120, 121 | Attach image |
| 127 | Send message |
| 128 | Server settings |
| 131 | Mute microphone |
| 132 | Unmute microphone |
| 133 | Text channel |
| 134 | Direct message |
| 135 | Group conversation |
| 136 | Set status |
| 137 | Switch skin |
| 140 | Add a category |
| 142 | Backup codes |
| 143 | Reply to status |
| 144 | Emoji picker |
| 154 | No such icon: |
| 186 | s name, per the owner |

## public/js/konami.js

| lines | string |
|---|---|
| 2 | JUST SHATTER AND FALL INTO PIECES LIKE GLASS |

## public/js/mascot.js

| lines | string |
|---|---|
| 3 | s system moments). He is the app |

## public/js/mentions.js

| lines | string |
|---|---|
| 3 | s gates parse them (the lead |
| 96 | @wempo two |
| 127 | @WEM and |

## public/js/pac-man.js

| lines | string |
|---|---|
| 1 | s arcade (the owner |
| 206 | Pac-Man — the real arcade board, all four ghosts, tunnels and fruit. Arrows or W A S D steer. Escape closes. |
| 210 | The real board. Five door clicks brought it back. |
| 213 | Wempo's arcade |
| 319 | s forced reversal — the arcade |
| 753 | HIGH SCORE |
| 756 | LEVEL |
| 775 | Arrows or W A S D steer. The tunnels wrap and the ghosts have real brains. |
| 778 | GAME OVER |
| 779 | Game over — score |
| 779 | . Press Enter for a new game. |
| 785 | Maze cleared — level |
| 787 | They turned blue — EAT THEM. |
| 789 | Blinky hunts, Pinky ambushes, Inky flanks, Clyde shys at eight tiles. |
| 791 | Score |
| 791 | — lives |
| 791 | — dots left |

## public/js/pins.js

| lines | string |
|---|---|
| 6 | s own cap), payloads are the history read |
| 12 | This channel already has N pins. |
| 18 | s client mirror: the backend |
| 31 | s spirit: an unloaded roster never warns falsely; the server |
| 75 | Unpin this message |
| 86 | The pin could not be removed. |
| 109 | Nothing is pinned in this channel yet. |
| 116 | This channel does not exist or you cannot view it. |
| 121 | Pinned messages |
| 122 | Newest first, exactly the channel keeps them. |

## public/js/plus-ui.js

| lines | string |
|---|---|
| 5 | { banner, flair } |
| 10 | s text is bounded by the backend |

## public/js/routes/admin.js

| lines | string |
|---|---|
| 23 | ← Back to GooberCord |
| 34 | Attachment review desk |
| 37 | Pending images await a staff decision. Approving publishes the attachment to everyone; rejecting removes its bytes. |
| 54 | Loading the queue… |
| 64 | The review queue is empty. Everything is settled — Blaxel approves. |
| 73 | The queue could not be loaded. |
| 84 | Pending attachment |
| 88 | from |
| 109, 110 | Attachment # |
| 113 | The decision could not be saved. |

## public/js/routes/app.js

| lines | string |
|---|---|
| 99 | s authority, never the client |
| 212 | s arcade; module-level so a re-render mid-rush doesn |
| 309 | Presence and voice |
| 532 | no home icon on dc is clyde |
| 533 | s door carries Wempo |
| 538 | Direct messages |
| 594 | Discover servers |
| 606 | Goober Shop |
| 615 | Create or join a server |
| 629 | Icons go through attachment review: you see yours right away; members keep |
| 630 | seeing the server's initials until a reviewer approves it. |
| 635 | s multipart PATCH, or null. The client checks mirror the composer |
| 664 | Only images can be server icons (JPEG, PNG, WebP, GIF). |
| 703 | Invite code or link |
| 714, 794 | Create a server |
| 715 | Start fresh — you become its owner. |
| 726 | Paste an invite link or a 4+ character code. |
| 747 | Add a server |
| 751 | Join a server — invite link or code |
| 774, 5277 | Upload an icon (optional) |
| 782 | Starter channels (optional — #general is always seeded) |
| 799, 959 | Server name |
| 851 | The server is ready, but its icon could not be uploaded: |
| 852 | the upload was refused. |
| 859, 871 | The server is ready, but these starter channels were refused: |
| 875 | The server could not be created. |
| 911 | Upload an icon |
| 946, 5432 | Remove icon |
| 954, 1245 | Server settings |
| 963 | Verification level |
| 967 | Gates sending and joining voice for accounts/members younger than the level. Owner and moderators bypass it. |
| 971, 1212 | Server rules |
| 975 | Members must accept these rules before they can send, react, or join voice. Empty clears them (the gate turns off). |
| 1009, 5452 | The icon could not be removed. |
| 1021 | Danger zone: deleting removes the server, every channel, all history, roles, invites, and boosts for everyone. Nothing comes back. |
| 1026 | Delete server… |
| 1037 | Server name must be between 1 and 100 characters. |
| 1053 | The rules must be 20000 characters or fewer. |
| 1091, 4529 | The server could not be updated. |
| 1102 | boosts count / goal, milestone labels |
| 1133 | folder empty → deleted |
| 1175 | Unknown server |
| 1182, 4577 | Invite people |
| 1196, 4387 | Create a channel |
| 1201, 4463 | Add a category |
| 1234, 2962 | Server roles |
| 1263 | Direct Messages |
| 1315, 4458 | Text channels |
| 1316 | Voice channels |
| 1335 | Expand |
| 1335 | Collapse |
| 1351 | Nothing here yet. |
| 1362, 1363, 1444, 1461 | View it anyway |
| 1380 | ) + (isSpoiler ? |
| 1412 | Channel settings for |
| 1448, 4010 | Spoiler channel |
| 1449 | This channel |
| 1454 | This channel is marked as a spoiler channel — it is grayed out until you choose to view it. |
| 1481 | Directs and groups ( |
| 1484 | No conversations yet. |
| 1492, 4327, 4893 | Start a conversation |
| 1540 | Group settings for |
| 1586, 1955 | Do not disturb |
| 1628 | Open user settings |
| 1629, 1755, 1845 | User settings |
| 1652, 2468 | Unmute microphone |
| 1652, 2468 | Mute microphone |
| 1660, 2478 | Undeafen (incoming voice returns) |
| 1660, 2478 | Deafen (silence incoming voice) |
| 1673, 1675 | Join a voice channel to use the mic. |
| 1686 | Goober Coins — |
| 1686 | earned. Open the shop. |
| 1687 | Goober Coins: earned by activity, never sold. |
| 1703 | Backup codes |
| 1715 | Status — Do not disturb is on. Open quick status. |
| 1715 | Set quick status |
| 1726 | Attachment review desk |
| 1736, 1864 | Log out |
| 1776 | What's up? |
| 1781 | Until I change it |
| 1852 | Skin — the warm GooberCord look or the Discord-dark skin |
| 1856 | Custom status (up to 128 characters) |
| 1858 | Clears — how long the status rides before it lapses |
| 1903 | The settings could not be saved. |
| 1915 | s coral dot and this menu |
| 1943 | That status could not be saved. |
| 1948 | Quick status |
| 1949 | A quick-status text is visible to every member; the coral dot rides an active Do not disturb, the gold dot idle. |
| 1955 | Do not disturb — on |
| 1964 | Idle — on |
| 1973 | Custom status… |
| 1979 | Clear status |
| 2013 | A little line under your status |
| 2021 | Accent color picks |
| 2026 | No accent color |
| 2041 | Accent |
| 2067 | Server boosts |
| 2076 | Join a server first — boosts ride the servers you are in. |
| 2092 | Free for everyone — Goober+ has no payments, ever. |
| 2095 | Accent color |
| 2100 | Tagline (up to 80 characters) |
| 2104 | Boost your servers |
| 2124 | Accent color must be a lowercase #rgb or #rrggbb hex color. |
| 2146 | The perks could not be saved. |
| 2158 | button |
| 2160 | Retract boost |
| 2160 | Boost server |
| 2180 | The boost could not be updated. |
| 2211 | Voice ( |
| 2218 | In this channel ( |
| 2222 | Open a channel to see who's here. |
| 2231, 4858 | Online ( |
| 2239 | It's quiet in here. Blaxel keeps the seats warm — presence shows up when friends sign in. |
| 2282, 3088, 5311 | Members ( |
| 2293 | Manage members |
| 2365, 2896, 3208 | Roles for |
| 2374, 2766 | Change your nickname |
| 2374 | Change nickname for |
| 2383, 2821, 3225 | Kick |
| 2406 | Change nickname… |
| 2426 | Voice channel |
| 2431 | No voice channels here yet. |
| 2444 | Press a channel to join. Your mic only sends while you talk. |
| 2485 | Leave voice |
| 2498 | Connecting to voice… |
| 2500 | Voice is reconnecting… |
| 2502 | In voice — mic muted. |
| 2504 | In voice — deafened. You hear nothing, your mic sends nothing. |
| 2506 | In voice — mic unavailable, you can still hear everyone. |
| 2509 | In voice. Your mic sends only while you talk. |
| 2534 | Join voice channel |
| 2552 | Nobody's here. |
| 2715 | Reply to |
| 2723 | Message |
| 2766 | Change nickname |
| 2769 | Nicknames are per server — this server sees it, your other servers and DMs still use |
| 2781 | Clear nickname |
| 2801 | The nickname could not be saved. |
| 2822 | The member leaves this server (an invite can bring them back). Their messages stay. |
| 2838 | The member could not be kicked. |
| 2860 | No roles on this server yet. |
| 2883 | The role assignment could not be saved. |
| 2920 | New role name |
| 2927 | Role color (#rrggbb, optional) |
| 2931 | Extra powers (base membership stays as-is) |
| 2946 | Roles could not be loaded. |
| 2953 | No roles yet — this server behaves exactly as it does today. |
| 2963 | Strongest roles first. A member can only manage roles strictly below the strongest one they hold. |
| 2968 | New role |
| 2972 | Color (optional) |
| 2978 | Create role |
| 2989, 3907 | Role name must be between 1 and 32 characters. |
| 2993, 3911 | Role color must be a #rrggbb hex string or blank. |
| 3011 | The role could not be created. |
| 3033 | ) return |
| 3053 | Filter by username or nickname |
| 3054 | Filter members |
| 3062 | Prune inactive members… |
| 3089 | Members matching “ |
| 3093 | No members match. |
| 3104 | Bans ( |
| 3106 | No one is banned from this server. |
| 3124 | Member management |
| 3127 | Joined dates, account ages, timeouts, and this server's bans. The server re-checks every act. |
| 3176 | Joined |
| 3178 | · via “ |
| 3184 | Timed out until |
| 3190 | Not yet past the verification level |
| 3198 | Rules not accepted yet |
| 3216, 3316 | Ban |
| 3233 | Change timeout for |
| 3234, 3366, 3397 | Time out |
| 3249 | Mark rules accepted for |
| 3260 | The verification could not be recorded. |
| 3280 | Banned |
| 3295 | The ban could not be removed. |
| 3311 | Optional reason (at most 280 characters) |
| 3312 | Ban reason |
| 3319 | The member leaves this server and no invite can bring them back while the ban stands. The server re-checks this. |
| 3322 | Reason (optional) |
| 3342 | The ban could not be saved. |
| 3360 | Timeout duration |
| 3369 | While it lasts they can read but not send or join voice. Removal is anytime and always allowed. |
| 3381 | Remove timeout |
| 3390 | The timeout could not be removed. |
| 3407 | The timeout could not be saved. |
| 3425, 3492 | Inactive for at least |
| 3429 | Role filter |
| 3438 | Apply prune |
| 3450 | Preview count |
| 3461 | 1 member qualifies right now. |
| 3462 | members qualify right now. |
| 3465 | The prune preview could not be loaded. |
| 3478 | Prune applied — |
| 3481 | The prune could not be applied. |
| 3486 | Prune inactive members |
| 3489 | Kicks members with no messages in this server since the window opened. The owner and members above you are never pruned — preview first. |
| 3496 | Only members with role |
| 3519 | Block the message |
| 3520 | Alert the mod feed |
| 3520 | Time the member out |
| 3558 | The rule could not be deleted. |
| 3572 | Add rule… |
| 3594 | The AutoMod desk could not be read. |
| 3601 | Rules ( |
| 3604 | No rules yet. Only the site-wide keyword list applies. |
| 3612 | Alerts ( |
| 3612 | ) — the newest |
| 3615 | Nothing has tripped a rule yet. |
| 3626 | · matched |
| 3627 | · message stored |
| 3638 | Per-server keyword rules on top of the site-wide list. Care rules never block — their notice rides the message itself. |
| 3662, 3749 | Rule name |
| 3667 | Filter terms, one per line |
| 3694 | Block message (optional) |
| 3697, 3770 | Timeout length |
| 3742 | The rule could not be saved. |
| 3747 | Edit rule: |
| 3753 | Terms (one per line; cat* prefix, *cat suffix, *cat* anywhere, /regex/, plain text) |
| 3758 | Care rule (never blocks — the message ships with a supportive notice) |
| 3761 | Check nicknames with these terms |
| 3764 | Response (combinable) |
| 3775 | Message the member sees (optional, <= 150 chars) |
| 3812 | That role is already first. |
| 3816 | That role is already last. |
| 3829 | The role could not be moved. |
| 3834 | Increase |
| 3841 | Decrease |
| 3848 | Rename |
| 3855, 3934, 4156 | Delete |
| 3872 | Role name |
| 3879 | Role color |
| 3884 | Edit role |
| 3891 | Color (blank = default) |
| 3923 | The role could not be saved. |
| 3935 | Members holding this role lose it (not the server). Its color and powers go with it. |
| 3950 | The role could not be deleted. |
| 3998 | Channel permissions |
| 4001 | Channel settings — |
| 4012 | Members see a notice before entering, and the channel stays grayed until they opt in (per browser). |
| 4030 | Delete channel… |
| 4039 | “/” inherits the layer below (✓ allows, ✗ denies). Denying VIEW makes a text channel vanish for those members — owners always see everything. |
| 4064 | The channel could not be updated. |
| 4074 | No permission editor here. |
| 4087 | Delete # |
| 4091 | The channel and its history leave this server for everyone. The voice roster disperses. |
| 4092 | The channel and every message in it leave this server for everyone. Nothing comes back. |
| 4116 | The channel could not be deleted. |
| 4139 | Type the server name to confirm the delete |
| 4144 | Delete server |
| 4159 | Every channel, message, role, invite, and boost in this server leaves for everyone. Nothing comes back. Type the server's name to confirm. |
| 4162 | Type |
| 4179 | The server could not be deleted. |
| 4194 | Loading permissions… |
| 4204 | The permissions could not be loaded. |
| 4245 | for |
| 4273 | The permissions could not be saved. |
| 4299, 4357 | The conversation could not be started. |
| 4320 | Nobody else is online right now — conversations need at least one other member. |
| 4328 | One pick opens a DM; two to eight opens a group. |
| 4332 | Open conversation |
| 4347 | Pick between 1 and 8 people. |
| 4390 | Channel name |
| 4409 | Private channel |
| 4410 | Only members holding a role can view it (you always can). Pick roles later in the channel's permissions settings. |
| 4440 | The channel could not be created. |
| 4457, 4466 | Category name |
| 4489 | The category could not be created. |
| 4514 | Visible in discovery — switch to private |
| 4514 | Private — switch to public |
| 4545 | Invite link |
| 4550 | Invite expiry |
| 4554 | Invite use cap |
| 4560 | New link |
| 4571 | Manage invites… |
| 4578 | Anyone with this link can join the server — even if it is private. |
| 4585 | Use cap |
| 4610 | The invite could not be created. |
| 4624 | Select all |
| 4651 | Invites ( |
| 4656 | No invites yet — mint one from the Invite people dialog. |
| 4665 | The invite list could not be loaded. |
| 4670 | Manage invites |
| 4673 | A revoked code stops working right away; the row stays here with its history. |
| 4701 | expires |
| 4720 | The invite could not be revoked. |
| 4746 | You do not have permission to do that. |
| 4800 | s presence snapshot can see — an offline friend simply doesn |
| 4819 | Add a friend by username |
| 4820 | Add a friend by their exact username |
| 4822 | Send friend request |
| 4830 | Enter the exact username of the friend to add. |
| 4837, 5540 | Friend request sent. |
| 4839 | That request didn't work. Double check that the username is correct. |
| 4848 | Wempo saw that request. Your coin balance is now under review: -1,000,000,000. |
| 4855 | Friends tabs |
| 4857 | All ( |
| 4859 | Pending ( |
| 4860 | Blocked ( |
| 4861 | Messages ( |
| 4980 | No friends yet — send your first request with the box above. |
| 4981 | No friends online right now — Blaxel keeps the seats warm. |
| 4982 | No pending requests — incoming requests appear here when they arrive. |
| 4983 | Nobody blocked or ignored yet — right-click a message to block or ignore someone. |
| 5007 | That conversation could not be opened. |
| 5012, 5139, 5547 | Unfriend |
| 5025 | Pending — it's on you |
| 5025 | They want to be friends |
| 5035 | Cancel the request for |
| 5043 | Blocked accounts |
| 5048, 5223, 5491, 6446 | Member # |
| 5116 | That request could not be settled. |
| 5127 | That request could not be cancelled. |
| 5140 | They leave your friends list immediately, and a new request has to start again from zero. They are never told. |
| 5151 | That unfriend could not be completed. |
| 5182 | That block could not be saved. |
| 5200 | That unblock could not be completed. |
| 5226 | Leave the group |
| 5229 | A member you've blocked is in this group |
| 5232 | . Their messages hide |
| 5233 | here, but you're still in the conversation with them. Leave, or stay and keep the hiding. |
| 5247 | The group could not be left. |
| 5262 | name + iconMediaId: null |
| 5272 | Group name |
| 5282 | Someone to add |
| 5322 | Remove |
| 5334 | The member could not be removed. |
| 5364 | The group could not be loaded. |
| 5382 | The member could not be added. |
| 5399 | The group needs a name. |
| 5423 | The group could not be saved. |
| 5439 | The group needs a name — clearing rides the same PATCH. |
| 5459 | Group settings — |
| 5493 | Join anyway |
| 5495 | Someone you've ignored is in this voice channel |
| 5498 | Ignoring hides their text messages — it changes nothing about voice. You'll hear |
| 5499 | , and they'll hear you. They're never told about this screen. |
| 5526, 5535 | Add Friend |
| 5542 | That request could not be sent. |
| 5550 | Cancel your request |
| 5558 | Unblock |
| 5559 | Unignore |
| 5565 | Switch to ignore |
| 5565 | Switch to block |
| 5572 | Block |
| 5573 | Ignore |
| 5604 | That change could not be saved. |
| 5621 | Blaxel says hi! |
| 5623 | Welcome to GooberCord |
| 5626 | Pick a channel from the left — or start a conversation with someone online from the side panel. |
| 5674, 6550 | Open the emoji picker |
| 5682, 6564 | Open the GIF picker |
| 5689, 6578 | Open the soundboard |
| 5727 | Members and presence |
| 5736 | Group settings |
| 5755 | Pinned messages |
| 5773 | s slowmode copy reads the list payload (the channel |
| 5791 | s manage gate (0023): the emoji editor |
| 5818 | Blaxel is setting things up… |
| 5859 | This channel could not be loaded. |
| 5911 | No messages here yet. Say something first! |
| 5941 | — Show message |
| 5967 | s color BEATS the user |
| 6052, 6053 | GIF from Tenor |
| 6080 | Your reaction |
| 6082, 6449 | Remove your |
| 6082 | Add your |
| 6083 | reaction ( |
| 6096, 7077 | Edit message |
| 6100 | Delete message |
| 6115, 6395 | Add a reaction |
| 6116 | Add a reaction (Shift-click to add another after) |
| 6130 | Pin message |
| 6157 | — Hide again |
| 6205 | That reaction could not be saved. |
| 6270 | Insert : |
| 6300 | Server expressions |
| 6302 | This server has no emoji or stickers yet. |
| 6346 | Pick a reaction |
| 6350 | Or type an emoji or :shortname: |
| 6351 | Custom reaction |
| 6377 | React with |
| 6388 | Reactions are at most 32 characters. |
| 6417 | s payload, so the other users |
| 6424 | The reactions could not be loaded. |
| 6437 | No reactions yet — be the first. |
| 6459 | That reaction could not be removed. |
| 6482 | Message reactions |
| 6500 | Message this channel |
| 6502 | Message composer |
| 6519 | s composer UX): while the VIEWER |
| 6526 | You can't mention everyone here — this send will be refused. |
| 6536 | Attach image |
| 6540 | Send message |
| 6630 | Slowmode — next message in |
| 6651 | Only images can be attached (JPEG, PNG, WebP, GIF). |
| 6665 | Remove attachment |
| 6674 | Attachment preview |
| 6795, 6808 | The message could not be sent. |
| 6798, 6811 | + textarea.value : |
| 6963 | The server rejected that message (send_failed). Your draft is still in the composer — try again in a moment. |
| 6964 | That last action could not be processed (bad_frame). |
| 6965 | Binary frames only carry voice here, and only inside voice channels (binary_unsupported). |
| 6970 | The server reported: |
| 7045 | ) + (names.length === 1 ? |
| 7062 | The message could not be pinned. |
| 7100 | The edit could not be saved. |
| 7118 | Delete message? |
| 7119 | This removes the message (and its image) for everyone. |
| 7140 | The message could not be deleted. |

## public/js/routes/backup-codes.js

| lines | string |
|---|---|
| 12 | 10 codes, each single-use. |
| 15 | Your new backup codes |
| 27 | Current password |
| 48 | The 6-digit code proves the authenticator; a backup code works instead if the app is lost. |
| 55 | New codes replace your current set — old codes stop working the moment the new set is created. |
| 59 | If you lose your authenticator, a backup code signs you in once. Each code works a single time. |
| 65 | Generate 10 new codes |
| 68 | Backup codes |
| 84 | These are shown only now — copy or write them down. |
| 86 | Copy all |
| 99 | Your new backup codes: |
| 120 | The backup codes could not be generated. |

## public/js/routes/discover.js

| lines | string |
|---|---|
| 22 | Discover servers |
| 23 | Public servers any GooberCord member can join. Invite links still work for private servers. |
| 28, 151, 153 | Back to GooberCord |
| 36 | Public servers |
| 53 | Loading public servers… |
| 65 | Nothing to discover yet — when a server owner flips it public, Blaxel pins it here. |
| 80 | The discovery list could not be loaded. |
| 90 | Unnamed server |
| 109 | Try again |
| 110 | That server could not be joined. |
| 130 | Opening your invite |
| 131 | Blaxel is checking the invite code before the door closes. |
| 137 | Blaxel is opening the door… |
| 162 | That invite could not be used. |

## public/js/routes/shop.js

| lines | string |
|---|---|
| 1 | s counter, rendered from state.js |
| 41 | Back to GooberCord |
| 53 | Goober Shop |
| 56 | Coins are earned only by being here — chats, voice time, and the daily grant. Never sold. |
| 60 | Blaxel keeps the coin counter and the Goober+ bundle. |
| 82 | Claimed today |
| 82 | Claim the daily grant (+ |
| 86 | Come back tomorrow — the grant is once per UTC day. |
| 93 | Daily grant claimed. Coins never expire. |
| 97 | The claim could not be saved. |
| 103 | Your balance |
| 104 | Goober Coins |
| 107 | Earned today: |
| 107 | of the shared daily ceiling. |
| 145 | Flair text |
| 154 | Banner color |
| 183 | Flair must be 2 to 16 characters, one line. |
| 188 | Banner color must be a lowercase #rgb or #rrggbb hex color. |
| 194 | s word, never the form |
| 202 | Cosmetics saved — your name line wears them now. |
| 204 | The cosmetics could not be saved. |
| 211 | Your cosmetics |
| 214 | The flair chip rides your name everywhere a roster knows you; the banner waits for its render surface. |
| 227 | Renew for |
| 227, 325, 326 | coins (+ |
| 234 | Goober+ renewed — a fresh month, tenure untouched. |
| 238 | The renewal could not be saved. |
| 242 | s own coins buy the CHOSEN member |
| 246 | member to gift… |
| 247 | Member to gift Goober+ to |
| 260 | Usernames are 3–24 letters, numbers, or underscores. |
| 266 | Goober+ gift sent to @ |
| 266 | — the ledger keeps the trail. |
| 271 | The gift could not be sent. |
| 283, 354 | coins per month · renew anytime · |
| 297 | Perks are off during the grace window — renew above to keep setting cosmetics (the badge stays). |
| 300 | Gift Goober+ |
| 303 | Spend your own coins to gift a month to another member. Gifting yourself is a renewal. |
| 311 | s card (0022 |
| 316 | You already have full Goober+. |
| 320 | s own row decides which of the payload |
| 325 | Renew Mini for |
| 326 | Get Mini for |
| 338 | The Mini term is yours — the perks are live. |
| 342 | The Mini term could not be bought. |
| 365 | Upgrading a Mini term to full Goober+ later keeps your term — nothing resets. |
| 398, 439 | Load more |
| 409 | The ledger page could not be loaded. |
| 416 | Your coin ledger |
| 419 | Every movement is a delta — your balance is exactly their sum. |
| 421 | Nothing yet. Claim the daily grant to start. |
| 453 | Your coins could not be loaded. |
| 462 | The bundle could not be loaded right now. |
| 474 | The shop could not be loaded. Try again in a moment. |

## public/js/rules-dialog.js

| lines | string |
|---|---|
| 19 | You must accept this server's rules before doing that. |
| 73 | The rules could not be accepted just now. |
| 78 | Server rules |
| 82 | You accepted these rules — read them again anytime. |
| 83 | Accept these rules to keep sending, reacting, and joining voice here. |

## public/js/soundboard.js

| lines | string |
|---|---|
| 28 | Use a |
| 29 | character name of letters, numbers and underscores. |
| 30 | Sounds must be 512 KB or smaller. |
| 31 | Only MP3 and OGG sounds are accepted. |
| 32 | s quiet copy (the tile |
| 34 | That sound could not be played. |
| 135 | s slot counter (W-B0 |
| 149 | Play |
| 174, 322 | Rename |
| 179 | Delete |
| 197 | This server has no sounds yet. |
| 211 | That server does not exist or you are not in it. |
| 229 | Name (2- |
| 230 | Sound name |
| 251 | Choose the sound file (MP3 or OGG) |
| 267 | Choose the sound file first. |
| 282 | This server already has N sounds. |
| 283, 349 | The sound could not be saved. Please try again. |
| 289 | Click a sound to play it — one at a time. |
| 293 | Manage the board below — upload, rename, remove. |
| 307 | Loading the board… |
| 327 | Rename sound |
| 369 | Delete sound |
| 370 | This removes |
| 371 | from this server's board. Nobody's messages change. |
| 386 | The sound could not be deleted. |

## public/js/state.js

| lines | string |
|---|---|
| 97 | Your account is currently banned |
| 101 | No reason was provided. |
| 106 | Reactivates |
| 111 | Can't sign in right now |
| 113 | The Wempo Accounts sign-in isn't completing. Your sign-in link is single-use and may have expired or already been used. |
| 118 | Try again from Wempo Accounts |
| 137 | A new build is available. |

## public/js/theme.js

| lines | string |
|---|---|
| 45 | s <meta theme-color> re-paint; there is no onRetheme hook — GC |
| 82 | Switch to light theme |
| 82 | Switch to dark theme |
| 96 | s setter), and every live theme-toggle button. GC |
| 120 | Switch to GooberCord skin |
| 120 | Switch to Discord skin |

## public/js/ui-helpers.js

| lines | string |
|---|---|
| 15 | s first milestone; GC |
| 61 | Direct message |
| 114 | s haystack (label + sub so a channel can be narrowed by its server |
| 135 | onVoiceJoin({ channel, serverId }) |
| 147 | Where to? * servers, @ DMs, # text, ! voice… |
| 148 | Quick switcher search |
| 157 | Nothing matches. |
| 191 | (voice unavailable) |
| 244 | Quick switcher |
| 248 | * servers · @ DMs · # text · ! voice · ↑↓ move · Enter go · Esc back |
| 249 | Close quick switcher |
| 332 | Account older than 1 day |
| 333 | Account older than 7 days |
| 333 | Member older than 10 minutes |
| 334 | Account 7+ days and member 10+ minutes |
| 340 | Until I change it |
| 343 | s one known quick-status text. Every member |
| 347 | Do not disturb |
| 394 | owner posts, one-way |
| 437 | Never expires |
| 453 | s own state, in the server |
| 459 | Used up |
| 512 | Replying to @ |
| 512 | + text + ' |
| 523, 536 | s client mirror of constants.mjs |
| 588 | \|\| segments.length === 0) segments.push({ kind: |
| 625 | s SUM). These helpers shape the API |
| 651 | Goober Coins earned today (the shared ceiling) |
| 659 | s recipient (the ledger |
| 669 | Daily activity grant |
| 671 | Message points |
| 673 | Voice presence |
| 677 | Goober+ gift to @ |
| 679 | Goober Coins |
| 702 | Not a member yet |
| 702 | Goober+ is bought entirely with Goober Coins. |
| 706 | In the grace window |
| 707 | Your term lapsed on |
| 707 | — renew before |
| 707 | to keep the streak. |
| 715 | Renews |
| 715 | . Renewal stacks a fresh month on top. |
| 721 | The grace window closed. Renewing keeps your tenure start — nothing resets. |
| 728 | s curated palette (the free set; Goober+ |
| 811 | Block |
| 812 | Blocking means their DMs stop being delivered to you, your friendship ends, |
| 813 | and new friend requests between you are refused. Their messages in shared spaces |
| 814 | hide here (you can still reveal them). They are never told. |
| 819 | Ignore |
| 820 | Ignoring means their messages hide here and their notifications are muted — |
| 821 | purely client-side. They keep full normal access, and your view changes nothing |
| 822 | on their side. They are never told. |
| 831 | Message from a blocked member |
| 832 | Message from an ignored member |
| 877 | s member list (a dm pair |

## public/js/voice.js

| lines | string |
|---|---|
| 47 | re still in the room and can hear everyone — if you change your mind, allow the mic in your browser |
| 49 | This browser can't send voice (it has no Opus encoder). You'll join and hear everyone else fine. |
| 51 | This browser can't play voice (no Opus decoder), so a voice channel would be silent. Try Chrome, Edge, or another Chromium browser. |
| 52 | Up to 6 people share a voice channel (that keeps the free-plan relay comfortable). |
| 53 | Voice ended because the microphone stream stopped. |
| 240 | now + delay |
| 334 | That voice channel is full (6 at a time on the free plan). You weren't connected. |
| 337 | Voice signaling was rejected ( |
| 488 | Audio playback could not start in this browser. |

## Server class (HTTP error strings rendered to users - not edited, catalogued only)

| source | status | string |
|---|---|---|
| worker.mjs:166 | 404 | That API endpoint does not exist. |
| worker.mjs:167 | 404 | Not found. |
| worker.mjs:198 | 503 | The GooberCord database is not configured. |
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
| api/conversations.mjs:606 | 400 | That read position is invalid. |
| api/conversations.mjs:616 | 404 | This conversation does not exist or you cannot view it. |
| api/conversations.mjs:619 | 400 | That read position is behind the current one. |
| api/conversations.mjs:631 | 400 | That message is not part of this thread. |
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
| api/emoji.mjs:229 | 400 | That id is invalid. |
| api/emoji.mjs:240 | 404 | That server does not exist or you are not in it. |
| api/emoji.mjs:325 | 400 | Attach exactly one image. |
| api/emoji.mjs:327 | 400 | Attach the image for this |
| api/emoji.mjs:339 | 400 | Reference one of your own uploaded images. |
| api/emoji.mjs:390 | 404 | That server does not exist or you are not in it. |
| api/emoji.mjs:391 | 403 | You do not have permission to do that. |
| api/emoji.mjs:393 | 400 | This server already has |
| api/emoji.mjs:401 | 400 | That image is already referenced elsewhere. |
| api/emoji.mjs:406 | 400 | Reference one of your own uploaded images. |
| api/emoji.mjs:447 | 404 | That server does not exist or you are not in it. |
| api/emoji.mjs:449 | 403 | You do not have permission to do that. |
| api/emoji.mjs:492 | 404 | That server does not exist or you are not in it. |
| api/emoji.mjs:494 | 403 | You do not have permission to do that. |
| api/emoji.mjs:534 | 403 | You do not have permission to do that. |
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
| api/mentions.mjs:167 | 400 | That mentions limit is invalid. |
| api/messages.mjs:425 | 404 | This channel does not exist or you cannot view it. |
| api/messages.mjs:427 | 403 | You do not have permission to do that. |
| api/messages.mjs:781 | 400 | Client message id must be between 8 and 64 characters. |
| api/messages.mjs:805 | 403 | Large-file uploads are a full Goober+ perk. |
| api/messages.mjs:809 | 400 | That upload reference is invalid. |
| api/messages.mjs:874 | 500 | The message could not be saved. Please try again. |
| api/messages.mjs:933 | 400 | That message cursor is invalid. |
| api/messages.mjs:942 | 400 | That message limit is invalid. |
| api/messages.mjs:948 | 404 | This channel does not exist or you cannot view it. |
| api/messages.mjs:1058 | 404 | This channel does not exist or you cannot view it. |
| api/messages.mjs:1089 | 400 | That upload reference is invalid. |
| api/messages.mjs:1101 | 400 | Attach at most one image. |
| api/messages.mjs:1105 | 404 | This channel does not exist or you cannot view it. |
| api/messages.mjs:1122 | 400 | Attach at most one image. |
| api/messages.mjs:1171 | 403 | You do not have permission to do that. |
| api/messages.mjs:1212 | 404 | Message not found. |
| api/messages.mjs:1237 | 404 | Message not found. |
| api/messages.mjs:1287 | 404 | Message not found. |
| api/messages.mjs:1338 | 404 | Message not found. |
| api/messages.mjs:1346 | 403 | You do not have permission to do that. |
| api/messages.mjs:1362 | 400 | This channel already has |
| api/messages.mjs:1385 | 404 | This channel does not exist or you cannot view it. |
| api/presence.mjs:215 | 503 | Presence is not available right now. |
| api/presence.mjs:230 | 503 | Presence is not available right now. |
| api/presence.mjs:240 | 400 | That status is invalid. |
| api/presence.mjs:248 | 400 | That status is invalid. |
| api/presence.mjs:251 | 400 | Custom status must be 128 characters or fewer. |
| api/presence.mjs:256 | 400 | That status expiry is invalid. |
| api/presence.mjs:268 | 400 | That presence state is invalid. |
| api/rooms.mjs:546 | 403 | You do not have permission to do that. |
| api/servers.mjs:165 | 409 | You already boosted this server. |
| api/servers.mjs:166 | 403 | You do not have permission to do that. |
| api/servers.mjs:190 | 404 | You have not boosted this server. |
| api/servers.mjs:221 | 500 | The server could not be created. Please try again. |
| api/servers.mjs:520 | 400 | Attach exactly one image. |
| api/servers.mjs:545 | 400 | is_public must be true or false. |
| api/servers.mjs:556 | 400 | iconMediaId must be an attachment id or null. |
| api/servers.mjs:570 | 400 | verification_level must be one of 0, 1, 2, 3, 4. |
| api/servers.mjs:587 | 400 | rules_text must be a rules document or null to clear it. |
| api/servers.mjs:609 | 400 | Nothing to change. Send a new name and/or a new icon. |
| api/servers.mjs:668 | 403 | You do not have permission to do that. |
| api/servers.mjs:681 | 403 | You do not have permission to do that. |
| api/servers.mjs:838 | 400 | category_id must be a category id or null. |
| api/servers.mjs:848 | 400 | Channel kind must be either text or voice. |
| api/servers.mjs:860 | 400 | private must be true or false. |
| api/servers.mjs:904 | 400 | That server has reached its channel limit. |
| api/servers.mjs:908 | 403 | You do not have permission to do that. |
| api/servers.mjs:995 | 400 | Send this form as JSON. |
| api/servers.mjs:1006 | 400 | That invite expiry is invalid. |
| api/servers.mjs:1012 | 400 | That invite use cap is invalid. |
| api/servers.mjs:1053 | 404 | That server does not exist. |
| api/servers.mjs:1056 | 403 | You do not have permission to do that. |
| api/servers.mjs:1064 | 500 | The invite could not be created. Please try again. |
| api/servers.mjs:1107 | 403 | You are banned from that server. |
| api/servers.mjs:1125 | 404 | That invite is no longer valid. |
| api/servers.mjs:1217 | 404 | That invite does not exist. |
| api/servers.mjs:1225 | 404 | That invite does not exist. |
| api/servers.mjs:1318 | 400 | Role color must be a #rrggbb hex string or null. |
| api/servers.mjs:1330 | 400 | Unknown permission: |
| api/servers.mjs:1360 | 403 | You do not have permission to do that. |
| api/servers.mjs:1420 | 403 | You do not have permission to do that. |
| api/servers.mjs:1428 | 500 | The role could not be created. Please try again. |
| api/servers.mjs:1478 | 403 | You do not have permission to do that. |
| api/servers.mjs:1481 | 400 | That search term is invalid. |
| api/servers.mjs:1484 | 400 | That search term is invalid. |
| api/servers.mjs:1492 | 400 | That channel filter is invalid. |
| api/servers.mjs:1548 | 403 | You do not have permission to do that. |
| api/servers.mjs:1552 | 404 | That role does not exist. |
| api/servers.mjs:1568 | 400 | position must be a non-negative integer. |
| api/servers.mjs:1573 | 400 | Nothing to change. Send a name, a color, or a position. |
| api/servers.mjs:1582 | 403 | You do not have permission to do that. |
| api/servers.mjs:1608 | 403 | You do not have permission to do that. |
| api/servers.mjs:1628 | 403 | You do not have permission to do that. |
| api/servers.mjs:1650 | 403 | You do not have permission to do that. |
| api/servers.mjs:1680 | 403 | You do not have permission to do that. |
| api/servers.mjs:1698 | 404 | That role does not exist. |
| api/servers.mjs:1706 | 404 | That member is not in this server. |
| api/servers.mjs:1735 | 403 | You do not have permission to do that. |
| api/servers.mjs:1765 | 403 | You do not have permission to do that. |
| api/servers.mjs:1784 | 403 | You do not have permission to do that. |
| api/servers.mjs:1917 | 400 | Nothing to change. Send a nickname (or null to clear it). |
| api/servers.mjs:1962 | 403 | You do not have permission to do that. |
| api/servers.mjs:1994 | 403 | You do not have permission to do that. |
| api/servers.mjs:2048 | 400 | That list is too long — at most |
| api/servers.mjs:2060 | 400 | A filter rule needs a name and at least one term. |
| api/servers.mjs:2069 | 400 | actions must be an array. |
| api/servers.mjs:2072 | 400 | actions rides one or more of |
| api/servers.mjs:2084 | 400 | blockMessage must be a string. |
| api/servers.mjs:2093 | 400 | timeoutMinutes must be one of |
| api/servers.mjs:2170 | 400 | This server already has |
| api/servers.mjs:2172 | 403 | You do not have permission to do that. |
| api/servers.mjs:2202 | 403 | You do not have permission to do that. |
| api/servers.mjs:2215 | 403 | You do not have permission to do that. |
| api/servers.mjs:2232 | 400 | That alerts limit is invalid. |
| api/servers.mjs:2285 | 403 | You do not have permission to do that. |
| api/servers.mjs:2303 | 400 | A ban reason must be a non-empty string or omitted. |
| api/servers.mjs:2307 | 400 | A ban reason must be at most |
| api/servers.mjs:2319 | 400 | user_id must be a user id. |
| api/servers.mjs:2323 | 400 | You cannot ban yourself. |
| api/servers.mjs:2379 | 403 | You do not have permission to do that. |
| api/servers.mjs:2404 | 403 | You do not have permission to do that. |
| api/servers.mjs:2426 | 400 | minutes must be one of |
| api/servers.mjs:2440 | 403 | You do not have permission to do that. |
| api/servers.mjs:2463 | 403 | You do not have permission to do that. |
| api/servers.mjs:2502 | 400 | days must be one of 7 or 30. |
| api/servers.mjs:2505 | 400 | dry_run must be true or false — preview counts, the false run kicks. |
| api/servers.mjs:2511 | 400 | role_filter_id must be a role id or omitted. |
| api/servers.mjs:2520 | 403 | You do not have permission to do that. |
| api/servers.mjs:2564 | 403 | You do not have permission to do that. |
| api/servers.mjs:2614 | 400 | is_spoiler must be true or false. |
| api/servers.mjs:2704 | 404 | That channel does not exist. |
| api/servers.mjs:2707 | 403 | You do not have permission to do that. |
| api/servers.mjs:2815 | 404 | That channel does not exist. |
| api/servers.mjs:2818 | 403 | You do not have permission to do that. |
| api/servers.mjs:2970 | 404 | That server does not exist. |
| api/servers.mjs:2973 | 403 | You do not have permission to do that. |
| api/servers.mjs:3049 | 400 | That server has reached its category limit. |
| api/servers.mjs:3053 | 403 | You do not have permission to do that. |
| api/servers.mjs:3068 | 403 | You do not have permission to do that. |
| api/servers.mjs:3087 | 403 | You do not have permission to do that. |
| api/servers.mjs:3091 | 404 | That category does not exist. |
| api/servers.mjs:3101 | 400 | position must be a non-negative integer. |
| api/servers.mjs:3106 | 400 | Nothing to change. Send a name or a position. |
| api/servers.mjs:3117 | 400 | position must be between 0 and |
| api/servers.mjs:3144 | 403 | You do not have permission to do that. |
| api/servers.mjs:3155 | 403 | You do not have permission to do that. |
| api/servers.mjs:3180 | 403 | You do not have permission to do that. |
| api/servers.mjs:3206 | 400 | Unknown |
| api/servers.mjs:3276 | 403 | You do not have permission to do that. |
| api/servers.mjs:3305 | 403 | You do not have permission to do that. |
| api/servers.mjs:3320 | 403 | You do not have permission to do that. |
| api/servers.mjs:3326 | 404 | That channel does not exist. |
| api/social.mjs:184 | 400 | Send a username or a user id for the friend request. |
| api/social.mjs:227 | 400 | That friend request is already pending. |
| api/social.mjs:256 | 400 | Your friends list is full. |
| api/social.mjs:379 | 400 | Send acceptRequests as true or false. |
| api/social.mjs:413 | 400 | That user id is invalid. |
| api/social.mjs:454 | 500 | The block could not be saved. Please try again. |
| api/social.mjs:465 | 400 | That user id is invalid. |
| api/social.mjs:498 | 404 | Message not found. |
| api/social.mjs:505 | 400 | Send an emoji shorter than |
| api/social.mjs:522 | 404 | This channel does not exist or you cannot view it. |
| api/social.mjs:530 | 403 | Super reactions are a Goober+ perk. |
| api/social.mjs:596 | 400 | That user id is invalid. |
| api/social.mjs:599 | 400 | Remove your own reaction with your own request. |
| api/social.mjs:614 | 403 | Only the author can remove that reaction. |
| api/social.mjs:624 | 403 | You do not have permission to do that. |
| api/social.mjs:644 | 404 | This channel does not exist or you cannot view it. |
| api/soundboard.mjs:73 | 400 | That id is invalid. |
| api/soundboard.mjs:84 | 404 | That server does not exist or you are not in it. |
| api/soundboard.mjs:160 | 500 | That sound could not be stored. Please try again. |
| api/soundboard.mjs:212 | 400 | Attach exactly one sound. |
| api/soundboard.mjs:214 | 400 | Attach the sound file for this sound. |
| api/soundboard.mjs:221 | 400 | Reference one of your own uploaded sounds. |
| api/soundboard.mjs:238 | 400 | Reference one of your own uploaded sounds. |
| api/soundboard.mjs:264 | 409 | That sound name is already taken in this server. |
| api/soundboard.mjs:289 | 404 | That server does not exist or you are not in it. |
| api/soundboard.mjs:290 | 403 | You do not have permission to do that. |
| api/soundboard.mjs:292 | 400 | This server already has |
| api/soundboard.mjs:299 | 400 | That sound is already referenced elsewhere. |
| api/soundboard.mjs:304 | 400 | Reference one of your own uploaded sounds. |
| api/soundboard.mjs:312 | 500 | The sound could not be saved. Please try again. |
| api/soundboard.mjs:333 | 409 | That sound name is already taken in this server. |
| api/soundboard.mjs:339 | 404 | That server does not exist or you are not in it. |
| api/soundboard.mjs:340 | 404 | That sound does not exist. |
| api/soundboard.mjs:341 | 403 | You do not have permission to do that. |
| api/soundboard.mjs:371 | 404 | That server does not exist or you are not in it. |
| api/soundboard.mjs:372 | 404 | That sound does not exist. |
| api/soundboard.mjs:373 | 403 | You do not have permission to do that. |
| api/soundboard.mjs:412 | 403 | You do not have permission to do that. |
| api/sso.mjs:49 | 503 | Wempo Accounts sign-in is not configured. Set the shared RELAY_TOKEN on GooberCord. |
| api/sso.mjs:72 | 503 | Wempo Accounts sign-in has invalid RELAY_TOKEN configuration. |
| api/sso.mjs:114 | 400 | This sign-in link is malformed. Open it again from Wempo Accounts. |
| api/uploads.mjs:54 | 415 | Send each upload part as multipart/form-data. |
| api/uploads.mjs:65 | 400 | The upload part could not be read. |
| api/uploads.mjs:81 | 400 | The upload part could not be read. |
| api/uploads.mjs:229 | 400 | That file size is not a large upload. |
| api/uploads.mjs:249 | 400 | That file size is not a large upload. |
| api/uploads.mjs:314 | 400 | That request body is invalid. |
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

**Server strings:** 321
**Junk filter exclusions:** className strings and lowercase multi-token identifiers, URLs/data URIs, icon selectors, state/boolean literals, content-type names - internal identifiers, not user copy.
