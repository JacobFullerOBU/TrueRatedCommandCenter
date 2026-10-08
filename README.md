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

## Make a post
On the Live tab, press Refresh, then "Make a post". Pick one of the most-reviewed titles and one of its
spoiler-free reviews to get a 1080x1080 image and a caption. The suggested posting time comes from the
Instagram tab's best hour and weekday (6pm when there's no Instagram data yet). "Add to calendar" drops
it into the Content tab on the next matching date.
