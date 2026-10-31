import { describe, expect, test } from "bun:test";

import { knownHostsName, parseRemote } from "../src/remote.ts";

const ssh = (input: string) => {
  const parsed = parseRemote(input);
  return parsed.ok ? parsed.link.sshUrl : `!${parsed.reason}`;
};

describe("links omzetten (plan §3.2)", () => {
  test.each([
    ["https://gitlab.com/team/brein", "git@gitlab.com:team/brein.git"],
    ["https://gitlab.com/team/sub/brein.git", "git@gitlab.com:team/sub/brein.git"],
    ["https://gitlab.com/team/brein/-/tree/main/knowledge", "git@gitlab.com:team/brein.git"],
    ["https://github.com/team/brein/tree/main", "git@github.com:team/brein.git"],
    ["https://github.com/team/brein/blob/main/AGENTS.md", "git@github.com:team/brein.git"],
    ["github.com/team/brein", "git@github.com:team/brein.git"],
    ["https://GitLab.Example.nl:8443/team/brein/", "git@gitlab.example.nl:team/brein.git"],
    ["git@gitlab.com:team/brein.git", "git@gitlab.com:team/brein.git"],
    ["git@gitlab.com:team/brein", "git@gitlab.com:team/brein.git"],
    ["ssh://git@gitlab.example.nl:2222/team/brein.git", "ssh://git@gitlab.example.nl:2222/team/brein.git"],
    ["ssh://git@gitlab.example.nl:22/team/brein.git", "git@gitlab.example.nl:team/brein.git"],
    ["  https://gitlab.com/team/brein  ", "git@gitlab.com:team/brein.git"],
  ])("%s", (input, expected) => {
    expect(ssh(input)).toBe(expected);
  });

  test("weigert links met inloggegevens, andere protocollen en onzin", () => {
    expect(ssh("https://oauth2:glpat-abc@gitlab.com/team/brein.git")).toBe("!credentials");
    expect(ssh("https://user@gitlab.com/team/brein.git")).toBe("!credentials");
    expect(ssh("ftp://gitlab.com/team/brein")).toBe("!unsupported");
    expect(ssh("https://gitlab.com/brein")).toBe("!invalid");
    expect(ssh("https://gitlab.com/team/../brein")).toBe("!invalid");
    expect(ssh("")).toBe("!empty");
  });

  test("naam en known_hosts-vorm", () => {
    const parsed = parseRemote("ssh://git@gitlab.example.nl:2222/team/sub/klantenservice.git");
    expect(parsed.ok && parsed.link.name).toBe("klantenservice");
    expect(parsed.ok && knownHostsName(parsed.link)).toBe("[gitlab.example.nl]:2222");
    const plain = parseRemote("git@gitlab.com:team/brein.git");
    expect(plain.ok && knownHostsName(plain.link)).toBe("gitlab.com");
  });
});

describe("vreemde links (review #5)", () => {
  test("een kapotte %-code of een host die met - begint is geen link", () => {
    expect(parseRemote("https://gitlab.com/team/%zz").ok).toBe(false);
    expect(parseRemote("git@-oProxyCommand=x:team/brein.git").ok).toBe(false);
    expect(parseRemote("-oProxyCommand=x@gitlab.com:team/brein.git").ok).toBe(false);
    expect(parseRemote("ssh://-x@gitlab.com/team/brein.git").ok).toBe(false);
  });
});
