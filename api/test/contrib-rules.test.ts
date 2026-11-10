import { describe, expect, it } from "vitest";
import { isBlankContributionValue, isHeldVote, liveVotes, normalizePhone, VOTE_TTL_MS } from "../../supabase/functions/make-server-283d8046/contrib-rules.ts";

describe("normalizePhone", () => {
  it("keeps the 10-digit form for the US and Canada", () => {
    expect(normalizePhone("(512) 555-0100")).toBe("5125550100");
    expect(normalizePhone("+1 512 555 0100", "US")).toBe("5125550100");
    expect(normalizePhone("1-416-555-0100", "CA")).toBe("4165550100");
    expect(normalizePhone("555-0100", "US")).toBe("");
  });

  it("keeps a leading + elsewhere, and reads 00 as +", () => {
    expect(normalizePhone("+44 20 7946 0000", "GB")).toBe("+442079460000");
    expect(normalizePhone("0044 20 7946 0000", "GB")).toBe("+442079460000");
    expect(normalizePhone("+61 2 9374 4000", "AU")).toBe("+61293744000");
  });

  it("accepts national numbers of 8–15 digits elsewhere, and rejects the rest", () => {
    expect(normalizePhone("020 7946 0000", "GB")).toBe("02079460000");
    expect(normalizePhone("1234567", "DE")).toBe("");
    expect(normalizePhone("+1234567890123456", "DE")).toBe("");
    expect(normalizePhone("", "FR")).toBe("");
  });
});

describe("vote expiry", () => {
  const now = Date.UTC(2026, 10, 6);
  it("drops votes older than 365 days and keeps newer or undated ones", () => {
    const votes = [
      { field: "phone", timestamp: now - VOTE_TTL_MS - 1 },
      { field: "phone", timestamp: now - VOTE_TTL_MS },
      { field: "phone", timestamp: now - 1000 },
      { field: "phone" },
    ];
    expect(liveVotes(votes, now)).toEqual(votes.slice(1));
    expect(VOTE_TTL_MS).toBe(365 * 86_400_000);
  });
});

describe("held votes", () => {
  it("holds only Lookup's email and pastorName votes", () => {
    expect(isHeldVote({ field: "email", source: "lookup:acme" })).toBe(true);
    expect(isHeldVote({ field: "pastorName", source: "lookup:acme" })).toBe(true);
    expect(isHeldVote({ field: "email", source: "suggestion" })).toBe(false);
    expect(isHeldVote({ field: "phone", source: "lookup:acme" })).toBe(false);
  });
});

describe("regionFromChurchId", () => {
  it("reads community ids in countries whose code is also a US state", async () => {
    const { regionFromChurchId } = await import("../../supabase/functions/make-server-283d8046/church-keys.ts");
    expect(regionFromChurchId("community-CA-ON-1793998225776-98s1rx")).toBe("ON");
    expect(regionFromChurchId("community-CA-1793998225776-98s1rx")).toBe("CA");
    expect(regionFromChurchId("community-TX-1793998225776-98s1rx")).toBe("TX");
    expect(regionFromChurchId("community-GB-GREATERLONDON-1793998225776-x")).toBe("GREATERLONDON");
  });
});

describe("first contributions", () => {
  it("recognizes missing values without treating existing numbers or lists as blank", () => {
    for (const value of [undefined, null, "", "  ", []]) expect(isBlankContributionValue(value)).toBe(true);
    for (const value of [0, 100, ["English"], "Unknown", "Sun 9 AM"]) expect(isBlankContributionValue(value)).toBe(false);
  });
  it("holds replacement proposals from every source", () => {
    expect(isHeldVote({ field: "phone", source: "suggestion", needsModeration: true })).toBe(true);
    expect(isHeldVote({ field: "serviceTimes", source: "partner:harvous", needsModeration: true })).toBe(true);
  });
});
