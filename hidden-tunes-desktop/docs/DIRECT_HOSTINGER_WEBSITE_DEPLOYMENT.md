# Direct Hostinger Website deployment

The tracked entry point completes the established flow without replacing WordPress or deploying the backend:

`hidden-tunes-desktop/dist` → `HiddenTunes-Web/scripts/sync-desktop-parity.mjs` → `HiddenTunes-Web/dist` → Hostinger `public_html/staging`.

Commands, run from `hidden-tunes-desktop`:

```text
npm run deploy -- --dry-run
npm run deploy -- --production
npm run deploy -- --rollback <release-id>
```

The fixed allowlisted target is `u489896272@72.61.152.132:65002`, document root `/home/u489896272/domains/hiddentunes.com/public_html`. Authentication must come from the existing SSH key/agent. No credential is stored here.

The command refuses a dirty Desktop Website source, builds Desktop, runs the sibling Website synchronization and route/parity checks, validates `dist/index.html` assets, rejects source maps and environment/private files, and confirms the live `.htaccess` keeps `/catalog-api` ahead of the SPA rule.

Production uploads into a timestamped directory, validates the staged tree, renames the current `staging` directory to `staging-rollback-<release-id>`, then promotes the staged directory. WordPress, `.htaccess`, `proxy-preview`, `/catalog-api`, backend services, databases, certificates and Hostinger configuration are not modified. A failed promotion restores the prior `staging` directory.

Rollback restores the named `staging-rollback-<release-id>` and retains the displaced failed release. The independent WordPress backup and restore procedure remains at `D:\HiddenTunes\Evidence\WebsiteReplacement-20260814\backup-validation\RESTORE-PROCEDURE.md`.
