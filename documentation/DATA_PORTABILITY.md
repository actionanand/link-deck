# Data portability

LinkDeck supports two deliberately different portability formats.

## Complete LinkDeck backup

Complete backups preserve profiles, nested folders, bookmarks, notes, tags, favourites, visit metadata and settings.

- Encrypted `.linkdeck` files use PBKDF2-SHA-256 and AES-256-GCM.
- Plain `.json` backups contain the same snapshot without encryption.
- Restore detects both formats automatically.
- Encrypted backup passphrases are never stored and cannot be recovered.

## Browser bookmark HTML

Netscape Bookmark HTML is intended for Chrome, Edge, Firefox and compatible browsers. It preserves browser-compatible titles, URLs, timestamps, favicons and nested folder structure.

Browser HTML is never encrypted. Browsers may discard LinkDeck-only notes, tags, favourites and visit history. Use a complete encrypted backup when those fields must be preserved.

Before importing, LinkDeck reports detected bookmarks, folders, toolbar folder and duplicate URLs. Duplicate handling supports skip, replace, merge and keep-both policies within the selected profile.
