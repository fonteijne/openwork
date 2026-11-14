// A stand-in for the Slack CLI: prints JSON like the real script and logs every call with its stdin.
import { appendFileSync, readFileSync } from "node:fs";

const [command, ...args] = process.argv.slice(2);
const stdin = command === "reply" || command === "post_message" ? readFileSync(0, "utf8") : "";
if (process.env.FAKE_SLACK_LOG) appendFileSync(process.env.FAKE_SLACK_LOG, `${JSON.stringify({ command, args, stdin })}\n`);
if (command === "check_access") process.exit(process.env.FAKE_SLACK_DOWN ? 1 : 0);
if (command === "unreads") console.log(JSON.stringify([{ channel_id: "C1", name: "sales", unread: 2, mentions: 1 }]));
else if (command === "reply" || command === "post_message") {
  if (args[0] === "C-GEEN") { console.log(JSON.stringify({ ok: false, error: "channel_not_found" })); process.exit(1); }
  console.log(JSON.stringify({ ok: true, channel_id: args[0], ts: "2.0", text: stdin }));
} else console.log(JSON.stringify({ ok: true, command, args }));
