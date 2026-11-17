// A stand-in for the Slack CLI: prints JSON like the real script and logs every call with its stdin.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

const [command, ...args] = process.argv.slice(2);
const stdin = command === "reply" || command === "post_message" ? readFileSync(0, "utf8") : "";
if (process.env.FAKE_SLACK_LOG) appendFileSync(process.env.FAKE_SLACK_LOG, `${JSON.stringify({ command, args, stdin })}\n`);
// An older script without the To-dos commands.
if (process.env.FAKE_SLACK_OLD && (command === "todos" || command === "todo_done")) { console.error(`Unknown command: ${command}`); process.exit(1); }
// What was ticked off, so a later `todos` leaves it out like Slack does.
const doneFile = `${process.env.FAKE_SLACK_LOG ?? "/tmp/fake-slack"}.done`;
const done = () => (existsSync(doneFile) ? readFileSync(doneFile, "utf8").split("\n").filter(Boolean) : []);
const TODOS = [
  { id: "reminder:Sa1", kind: "reminder", text: "Offerte nalopen", done: false, due: null, created: 1763020000, completed: null, channel_id: null, channel: null, ts: null, author: null, link: null },
  {
    id: "message:C1:1763000000.000100", kind: "message", text: "Kun jij  de prijslijst\ndelen?", done: false, due: 1794567600, created: 1763000000, completed: null,
    channel_id: "C1", channel: "#sales", ts: "1763000000.000100", author: "Mila Bakker", link: "https://bonzai.slack.com/archives/C1/p1763000000000100",
  },
  { id: "message:C2:1763000001.000100", kind: "message", text: "Een id als naam", done: false, due: null, created: 1763000001, completed: null, channel_id: "C2", channel: "@U020WN463K3", ts: "1763000001.000100", author: "U020WN463K3", link: "slack://x" },
  { id: "reminder:Sa9", kind: "reminder", text: "al klaar", done: true, due: null, created: 1, completed: 2, channel_id: null, channel: null, ts: null, author: null, link: null },
];
if (command === "check_access") process.exit(process.env.FAKE_SLACK_DOWN ? 1 : 0);
if (command === "unreads") console.log(JSON.stringify([{ channel_id: "C1", name: "sales", unread: 2, mentions: 1 }]));
else if (command === "todos") {
  if (process.env.FAKE_SLACK_DOWN) { console.error("Error: Slack session expired"); process.exit(1); }
  console.log(JSON.stringify(TODOS.filter((todo) => !done().includes(todo.id)), null, 2));
} else if (command === "todo_done") {
  const [id, ...rest] = args;
  if (id === "reminder:SaWEG") { console.error("Error: saved.update failed: item_not_found"); process.exit(1); }
  const reopen = rest.includes("--reopen");
  writeFileSync(doneFile, `${done().filter((entry) => entry !== id).concat(reopen ? [] : [id]).join("\n")}\n`);
  console.log(JSON.stringify({ ok: true, done: !reopen }));
} else if (command === "reply" || command === "post_message") {
  if (args[0] === "C-GEEN") { console.log(JSON.stringify({ ok: false, error: "channel_not_found" })); process.exit(1); }
  console.log(JSON.stringify({ ok: true, channel_id: args[0], ts: "2.0", text: stdin }));
} else console.log(JSON.stringify({ ok: true, command, args }));
