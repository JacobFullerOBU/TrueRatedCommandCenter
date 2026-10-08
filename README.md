# True Rated Command Center

Personal hub for truerated.co: live stats, metrics, tasks, content calendar, moderation log, uptime.

## Run
Serve this folder over http (Firebase sign-in won't work from file://):

    python -m http.server 8080

Then open http://localhost:8080. Manual data lives in your browser (Data tab → export backups).

## Live tab
Signs in to the True Rated Firebase project (mediareviews-3cf32) with your admin account and reads
`reviews`, `reviewers` and `suggestions`. "Log to Metrics" records today's totals into the Metrics tab.
The web config in config.js is public by design; your database rules are what protect the data.
