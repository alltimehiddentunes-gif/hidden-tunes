# Responsive

| Width | Behaviour |
|-------|-----------|
| 1024 | Player remains visible; sidebar ~184px; rail ~220px; no horizontal overflow (smoke PASS) |
| 1280 | Stable three-column; rail ~260–310px |
| 1440 | Comfortable centre + rail ~330px |
| 1720 | Rail ~360px |

Previously, `@media (max-width: 1265px)` hid `.queue-rail--workspace`. That rule was replaced so the persistent player **shrinks** instead of disappearing.
