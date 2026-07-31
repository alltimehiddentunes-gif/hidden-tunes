# Mature catalog validation — network retry

Date: 2026-07-31

| Attempt | Result | Detail |
| ------: | ------ | ------ |
| 1 | Fail | `ConnectTimeoutError` to `admin.hiddentunes.com:443` (10s). Not a deterministic code failure. |
| 2 | **Pass** | Production API reachable. `backendMatureTotal: 1766`, `reachableViaPagination: 1766`, `firstPage/secondPage: 40`, `lastPage: 45`, mature/safe cache keys distinct. |

Command:

```text
node scripts/test-mature-podcast-catalog.mjs
```

Exit codes: attempt 1 = `1`, attempt 2 = `0`.
