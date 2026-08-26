import { describe, expect, test } from "bun:test";
import { parseP4WorkspaceInfo } from "./p4";

const completeP4Info = [
  "User name: alice",
  "Client name: workspace",
  "Client root: /work/project",
  "Server address: perforce.example:1666",
].join("\n");

describe("parseP4WorkspaceInfo", () => {
  test("decodes the fields needed to query a workspace", () => {
    expect(parseP4WorkspaceInfo(completeP4Info)).toEqual({
      clientName: "workspace",
      clientRoot: "/work/project",
      normalizedRoot: "/work/project",
      userName: "alice",
      serverAddress: "perforce.example:1666",
    });
  });

  test("rejects missing or empty required fields", () => {
    expect(parseP4WorkspaceInfo(completeP4Info.replace("User name: alice", ""))).toBeNull();
    expect(
      parseP4WorkspaceInfo(completeP4Info.replace("User name: alice", "User name: ")),
    ).toBeNull();
    expect(parseP4WorkspaceInfo(completeP4Info.replace("Client name: workspace", ""))).toBeNull();
    expect(
      parseP4WorkspaceInfo(completeP4Info.replace("Client root: /work/project", "")),
    ).toBeNull();
  });

  test("allows an absent server address", () => {
    expect(
      parseP4WorkspaceInfo(completeP4Info.replace("Server address: perforce.example:1666", "")),
    ).toMatchObject({
      clientName: "workspace",
      clientRoot: "/work/project",
      userName: "alice",
      serverAddress: "",
    });
  });
});
