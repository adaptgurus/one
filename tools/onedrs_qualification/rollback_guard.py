"""Strict, bounded lab restoration checks; no process or native mutation API.

Two complete samples and closing leader reads must agree on role/term and on
COMMIT == LOG_INDEX across every enrolled member. This is sampled evidence,
not an atomic linearizable snapshot or authorization to enable management.
The separate restoration coordinator preserves a missed acceptance deadline.
"""
from dataclasses import asdict, dataclass
import http.client
import math
import re
import time
import xml.etree.ElementTree as ET
import xmlrpc.client


class UnsafeSnapshot(RuntimeError):
    """Malformed identity, topology change, or regressing committed state."""


class EvidenceError(RuntimeError):
    """Evidence write failed; never classify this as a transport retry."""


class SyncTimeout(TimeoutError):
    def __init__(self, diagnostic, authority=None, floors=None):
        self.diagnostic = diagnostic
        self.authority = authority
        self.floors = dict(floors or {})
        super().__init__('strict synchronization deadline: ' + str(diagnostic))


@dataclass(frozen=True)
class Status:
    server_id: int
    state: int
    term: int
    commit: int
    log_index: int


@dataclass(frozen=True)
class SyncReceipt:
    leader_id: int
    term: int
    common_index: int
    samples: int
    elapsed_seconds: float
    statuses: dict


def parse_status(xml, expected_id):
    if type(xml) is not str or len(xml) > 65536:
        raise UnsafeSnapshot('missing or oversized RAFT response')
    if '<!DOCTYPE' in xml.upper() or '<!ENTITY' in xml.upper():
        raise UnsafeSnapshot('DTD/entity declarations are not admitted')
    try:
        root = ET.fromstring(xml)
    except ET.ParseError as exc:
        raise UnsafeSnapshot('malformed RAFT XML') from exc
    if root.tag != 'RAFT' or root.attrib:
        raise UnsafeSnapshot('wrong or namespaced RAFT root')
    names = ['SERVER_ID', 'STATE', 'TERM', 'COMMIT', 'LOG_INDEX']
    values = []
    for key in names:
        matches = [c for c in root if c.tag == key]
        if len(matches) != 1:
            raise UnsafeSnapshot('missing/duplicate RAFT field ' + key)
        c = matches[0]
        text = (c.text or '').strip()
        if c.attrib or len(c) or not re.fullmatch(r'[0-9]{1,20}', text):
            raise UnsafeSnapshot('invalid RAFT field ' + key)
        value = int(text)
        if value > (1 << 64) - 1:
            raise UnsafeSnapshot('out-of-range RAFT field ' + key)
        values.append(value)
    status = Status(*values)
    if type(expected_id) is not int or status.server_id != expected_id:
        raise UnsafeSnapshot('endpoint/server identity mismatch')
    if status.log_index < status.commit:
        raise UnsafeSnapshot('log index precedes committed index')
    return status


def wait_strict_sync(read_status, expected_ids=(0, 1, 2), timeout=90,
                     interval=1, clock=time.monotonic, sleep=time.sleep,
                     audit=lambda event: None, authority=None, floors=None):
    """read_status(id, remaining_seconds) must enforce that call deadline.

    Transient transport failures and incomplete initial elections may be retried.
    Once established, leader/term identity cannot change during this check.
    Runtime errors, malformed XML and committed-state regression fail immediately.
    """
    ids = tuple(expected_ids)
    if (len(ids) < 3 or len(set(ids)) != len(ids)
            or any(type(i) is not int or i < 0 for i in ids)):
        raise ValueError('exact unique enrolled server IDs are required')
    if not all(type(v) in (int, float) and math.isfinite(v) and v > 0
               for v in (timeout, interval)):
        raise ValueError('positive finite timeout and interval are required')
    if authority is not None and (not isinstance(authority, tuple)
            or len(authority) != 2 or authority[0] not in ids
            or type(authority[1]) is not int or authority[1] < 0):
        raise ValueError('invalid pinned authority')
    previous = dict(floors or {})
    if any(i not in ids or not isinstance(s, Status) or s.server_id != i
           for i, s in previous.items()):
        raise ValueError('invalid previous status floor')
    start = clock(); deadline = start + timeout
    rounds = 0; consecutive = 0; last = {'reason': 'no complete snapshot'}

    def emit(event):
        try:
            audit(event)
        except Exception as exc:
            raise EvidenceError('synchronization evidence write failed') from exc

    def fetch(i):
        remaining = deadline - clock()
        if remaining <= 0:
            raise SyncTimeout(last, authority, previous)
        status = parse_status(read_status(i, remaining), i)
        if clock() >= deadline:
            raise SyncTimeout({'reason': 'read exceeded total deadline'}, authority, previous)
        return status

    def track(i, status):
        old = previous.get(i)
        if old and (status.term < old.term or status.commit < old.commit
                    or (status.term == old.term and status.log_index < old.log_index)):
            raise UnsafeSnapshot('state regression on server ' + str(i))
        previous[i] = status

    while clock() < deadline:
        rounds += 1
        try:
            statuses = {i: fetch(i) for i in ids}
            for i, status in statuses.items():
                track(i, status)
            leaders = [i for i, s in statuses.items() if s.state == 3]
            terms = {s.term for s in statuses.values()}
            if len(leaders) > 1:
                raise UnsafeSnapshot('multiple reported leaders')
            coherent = (len(leaders) == 1 and len(terms) == 1
                        and all(s.state in (2, 3) for s in statuses.values()))
            if authority is not None:
                lid, term = authority
                if (not coherent or leaders[0] != lid or terms != {term}):
                    raise UnsafeSnapshot('pinned leader/term changed')
            if not coherent:
                consecutive = 0
                last = {'reason': 'initial election not coherent',
                        'statuses': {i: asdict(s) for i, s in statuses.items()}}
            else:
                lid = leaders[0]; term = statuses[lid].term
                if authority is None:
                    authority = (lid, term)
                closing = fetch(lid); track(lid, closing)
                if closing.state != 3 or closing.term != term:
                    raise UnsafeSnapshot('closing leader read changed authority')
                common = closing.commit
                synced = (closing.log_index == common
                          and all(s.commit == common and s.log_index == common
                                  for s in statuses.values()))
                consecutive = consecutive + 1 if synced else 0
                last = {'reason': 'synchronized' if synced else 'member lag or advancing log',
                        'leader': lid, 'term': term, 'leader_closing_commit': common,
                        'per_host_commit_delta': {i: common - s.commit for i, s in statuses.items()},
                        'statuses': {i: asdict(s) for i, s in statuses.items()},
                        'consecutive_complete_samples': consecutive}
                emit({'kind': 'raft_sample', 'round': rounds, **last})
                if consecutive >= 2:
                    return SyncReceipt(lid, term, common, rounds,
                                       round(clock() - start, 6), statuses)
            if not coherent:
                emit({'kind': 'raft_sample', 'round': rounds, **last})
        except SyncTimeout:
            raise
        except (OSError, http.client.HTTPException, xmlrpc.client.ProtocolError) as exc:
            consecutive = 0
            last = {'reason': 'transport unavailable', 'error_type': type(exc).__name__}
            emit({'kind': 'raft_transport', 'round': rounds, **last})
        remaining = deadline - clock()
        if remaining <= 0:
            break
        sleep(min(interval, remaining))
    raise SyncTimeout(last, authority, previous)


def complete_restoration(verify_original, probe, unfreeze, restore_services,
                         finish, expected_ids=(0, 1, 2), audit=lambda event: None,
                         acceptance_timeout=90, recovery_timeout=150):
    """Bounded completion using explicitly supplied, already authorized actions.

    No upgrade/downgrade/restart retry is performed here. A first deadline miss
    remains qualification failure even when the later original-state restoration
    succeeds. Unsafe topology or binary/configuration drift never unfreezes writes.
    """
    expected_ids = tuple(expected_ids)
    if (len(expected_ids) < 3 or len(set(expected_ids)) != len(expected_ids)
            or any(type(i) is not int or i < 0 for i in expected_ids)):
        raise ValueError('exact unique enrolled server IDs are required')
    if not all(type(v) in (int, float) and math.isfinite(v) and v > 0
               for v in (acceptance_timeout, recovery_timeout)):
        raise ValueError('positive finite restoration deadlines are required')
    out = {'qualification_passed': False, 'restoration_complete': False,
           'acceptance_deadline_missed': False, 'errors': [], 'events': []}
    def record(event):
        audit(event)  # A failed evidence write must stop before the next effect.
        out['events'].append(event)
    def original():
        if verify_original() is not True:
            raise UnsafeSnapshot('original package/config/workload guards failed')
    try:
        original()
        try:
            receipt = probe(acceptance_timeout, None, {})
        except SyncTimeout as exc:
            out['acceptance_deadline_missed'] = True
            record({'kind': 'acceptance_timeout', 'diagnostic': exc.diagnostic})
            original()
            receipt = probe(recovery_timeout, exc.authority, exc.floors)
        if (not isinstance(receipt, SyncReceipt) or set(receipt.statuses) != set(expected_ids)
                or type(receipt.samples) is not int or receipt.samples < 2
                or type(receipt.elapsed_seconds) not in (int, float)
                or not math.isfinite(receipt.elapsed_seconds) or receipt.elapsed_seconds < 0):
            raise UnsafeSnapshot('invalid complete synchronization receipt')
        if (receipt.leader_id not in expected_ids or any(not isinstance(s, Status) or s.server_id != i or s.term != receipt.term or s.commit != receipt.common_index or s.log_index != receipt.common_index or s.state != (3 if i == receipt.leader_id else 2) for i, s in receipt.statuses.items())):
            raise UnsafeSnapshot('inconsistent synchronization receipt')
        original()
        record({'kind': 'original_state_and_sync_verified', 'term': receipt.term,
                'leader': receipt.leader_id, 'common_index': receipt.common_index})
        unfreeze(); record({'kind': 'original_management_enabled'})
        for node in expected_ids:
            try:
                restore_services(node)
                record({'kind': 'original_services_restored', 'node': node})
            except Exception as exc:
                out['errors'].append({'step': 'restore_services', 'node': node,
                                      'error_type': type(exc).__name__, 'error': str(exc)[:300]})
        if out['errors']:
            return out  # Keep verification keys available for unresolved hosts.
        original()
        for node in expected_ids:
            try:
                finish(node)
                record({'kind': 'original_state_and_key_cleanup_verified', 'node': node})
            except Exception as exc:
                out['errors'].append({'step': 'finish', 'node': node,
                                      'error_type': type(exc).__name__, 'error': str(exc)[:300]})
        out['restoration_complete'] = not out['errors']
        out['qualification_passed'] = out['restoration_complete'] and not out['acceptance_deadline_missed']
    except Exception as exc:
        out['errors'].append({'step': 'restoration_gate', 'error_type': type(exc).__name__, 'error': str(exc)[:300]})
    return out
