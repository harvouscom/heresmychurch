import { describe, it, expect } from 'vitest';
import { decide, spamReason, QUIET_MS, type PolicyInput, type Candidate } from '../../supabase/functions/make-server-283d8046/moderation/policy.ts';
import { actorGroup, nameSimilarity, timesIn } from '../../supabase/functions/make-server-283d8046/moderation/signals.ts';

const NOW = 1_800_000_000_000;
const cand = (value: string, o: Partial<Candidate> = {}): Candidate => ({ value, people: 1, partnerOnly: false, firstAt: NOW - 1000, spam: spamReason('x', value), ...o });
const run = (field: string, o: Partial<PolicyInput> = {}, c: Candidate[] = [cand('v')]) => decide({ field, current: 'old', claimed: false, appliedBlankFill: false, candidates: c, now: NOW, ...o });

describe('moderation policy', () => {
  it('approves phone and service times on website evidence, two people, or three quiet days', () => {
    expect(run('phone', { evidence: 'supported' }).outcome).toBe('approve');
    expect(run('serviceTimes', {}, [cand('Sun 9am', { people: 2 })]).outcome).toBe('approve');
    expect(run('phone', {}, [cand('5125550100', { firstAt: NOW - QUIET_MS - 1 })]).outcome).toBe('approve');
    expect(run('phone').outcome).toBe('wait');
    expect(run('phone', { evidence: 'contradicted' }).outcome).toBe('reject');
  });
  it('never lets the partner key alone, or a dispute, count as agreement', () => {
    expect(run('phone', {}, [cand('a', { people: 2, partnerOnly: true })]).outcome).toBe('wait');
    expect(run('phone', {}, [cand('a', { people: 2 }), cand('b')]).outcome).toBe('escalate');
  });
  it('lists: additions approve after agreement or quiet days; removals go to a reviewer', () => {
    expect(run('languages', { listAddsOnly: true }, [cand('English, Spanish', { people: 2 })]).outcome).toBe('approve');
    expect(run('ministries', { listAddsOnly: false }).outcome).toBe('escalate');
    expect(run('denomination', { denominationMatchesName: true }).outcome).toBe('approve');
  });
  it('pastor and email need the church website; a claimed church email always needs a person', () => {
    expect(run('pastorName', { evidence: 'supported' }).outcome).toBe('approve');
    expect(run('pastorName').outcome).toBe('escalate');
    expect(run('email', { evidence: 'supported' }).outcome).toBe('approve');
    expect(run('email', { evidence: 'supported', claimed: true }).outcome).toBe('escalate');
  });
  it('website: rejects dead or parked sites, approves a named site replacing a dead one', () => {
    expect(run('website', { website: { reachable: false, nameOnPage: false, parked: false, oldSiteGone: false } }).outcome).toBe('reject');
    expect(run('website', { website: { reachable: true, nameOnPage: true, parked: true, oldSiteGone: true } }).outcome).toBe('reject');
    expect(run('website', { website: { reachable: true, nameOnPage: true, parked: false, oldSiteGone: true } }).outcome).toBe('approve');
    expect(run('website', { website: { reachable: true, nameOnPage: true, parked: false, oldSiteGone: false } }).outcome).toBe('escalate');
  });
  it('name: small fixes approve, renames escalate; address: near pin approves, far escalates', () => {
    expect(run('name', { nameSimilarity: 0.9 }).outcome).toBe('approve');
    expect(run('name', { nameSimilarity: 0.3 }).outcome).toBe('escalate');
    expect(run('address', { addressDistanceM: 40 }).outcome).toBe('approve');
    expect(run('address', { addressDistanceM: 5000 }).outcome).toBe('escalate');
    expect(run('address', { addressDistanceM: null }).outcome).toBe('escalate');
  });
  it('hides a closed church only with two reports and outside evidence and no recent activity', () => {
    const closure = { siteDeadChecks: 2, osmClosed: false, googleClosed: false, recentActivity: false };
    expect(run('reportClosed', { closure }, [cand('closed', { people: 2 })]).outcome).toBe('hide');
    expect(run('reportClosed', { closure }, [cand('closed')]).outcome).toBe('wait');
    expect(run('reportClosed', { closure: { ...closure, recentActivity: true } }, [cand('closed', { people: 2 })]).outcome).toBe('wait');
    expect(run('reportClosed', { closure: { ...closure, siteDeadChecks: 0 } }, [cand('closed', { people: 3, firstAt: NOW - 22 * 86400000 })]).outcome).toBe('escalate');
  });
  it('hides the newer duplicate only when it is clearly the same church and neither is claimed', () => {
    const dup = { targetExists: true, distanceM: 30, nameScore: 0.95, sameAddress: false, reportedIsNewerOrThinner: true, eitherClaimed: false };
    expect(run('reportDuplicate', { duplicate: dup }).outcome).toBe('hide');
    expect(run('reportDuplicate', { duplicate: { ...dup, eitherClaimed: true } }).outcome).toBe('escalate');
    expect(run('reportDuplicate', { duplicate: { ...dup, distanceM: 900 } }).outcome).toBe('escalate');
    expect(run('reportDuplicate', { duplicate: { ...dup, targetExists: false } }).outcome).toBe('reject');
  });
  it('moves and scope reports always go to a reviewer', () => {
    expect(run('reportRelocated').outcome).toBe('escalate');
    expect(run('reportOutOfScope').outcome).toBe('escalate');
  });
  it('rejects spam first, and keeps a published blank fill that passes', () => {
    expect(spamReason('name', 'Best casino bonus')).toBeTruthy();
    expect(spamReason('pastorName', 'call 512-555-0100 now')).toBeTruthy();
    expect(spamReason('website', 'https://church.example')).toBeTruthy();
    expect(spamReason('name', "St. Mary's Catholic Church")).toBeNull();
    expect(decide({ field: 'name', current: '', claimed: false, appliedBlankFill: false, candidates: [{ value: 'Free viagra', people: 3, partnerOnly: false, firstAt: NOW, spam: spamReason('name', 'Free viagra') }], now: NOW }).outcome).toBe('reject');
    expect(run('phone', { appliedBlankFill: true }).outcome).toBe('approve');
  });
  it('groups people by network and compares names and times sensibly', () => {
    expect(actorGroup('203.0.113.7')).toBe(actorGroup('203.0.113.99'));
    expect(actorGroup('203.0.113.7')).not.toBe(actorGroup('203.0.114.7'));
    expect(nameSimilarity("St. Mary's Church", 'Saint Marys Church')).toBe(1);
    expect(nameSimilarity('Grace Church', 'Hope Fellowship')).toBeLessThan(0.5);
    expect(timesIn('Sunday 9 AM and 10:30a.m.')).toEqual(['9:00am', '10:30am']);
  });
});
