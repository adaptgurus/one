"""Cascading Raft restoration failures on an isolated fake clock and fake XML.

No real controller shutdown, API writes, network partition or service actions.
"""
import unittest
from rollback_guard import (
    SyncTimeout, UnsafeSnapshot, complete_restoration, wait_strict_sync,
)
from test_rollback_guard import Clock, xml


class CascadeRestorationTests(unittest.TestCase):
    def test_two_followers_unavailable_never_authorize_restoration(self):
        clock = Clock()
        events = []
        def read(i, remaining):
            if i in (1, 2):
                raise ConnectionRefusedError("two nodes unavailable")
            return xml(i)
        def probe(timeout, authority, floors):
            return wait_strict_sync(
                read, timeout=timeout, interval=1,
                clock=clock.now, sleep=clock.sleep,
                authority=authority, floors=floors,
            )
        result = complete_restoration(
            lambda: True, probe,
            lambda: events.append("unfreeze"),
            lambda i: events.append(("restore", i)),
            lambda i: events.append(("finish", i)),
            acceptance_timeout=3, recovery_timeout=4,
        )
        self.assertFalse(result["restoration_complete"])
        self.assertFalse(result["qualification_passed"])
        self.assertTrue(result["acceptance_deadline_missed"])
        self.assertEqual(events, [])

    def test_leader_plus_follower_loss_refuses_complete_barrier(self):
        clock = Clock()
        def read(i, remaining):
            if i in (0, 1):
                raise ConnectionRefusedError("leader plus follower unavailable")
            return xml(i)
        with self.assertRaises(SyncTimeout):
            wait_strict_sync(
                read, timeout=3, interval=1,
                clock=clock.now, sleep=clock.sleep,
            )

    def test_contested_leaders_after_one_good_sample_fail_immediately(self):
        clock = Clock()
        def read(i, remaining):
            return xml(i, state=3 if clock.t >= 1 and i == 1 else None)
        with self.assertRaisesRegex(UnsafeSnapshot, "multiple reported leaders"):
            wait_strict_sync(
                read, timeout=7, interval=1,
                clock=clock.now, sleep=clock.sleep,
            )

    def test_transient_dual_failure_then_recovery_keeps_missed_acceptance(self):
        clock = Clock()
        effects = []
        def read(i, remaining):
            if i in (1, 2) and clock.t < 4:
                raise ConnectionRefusedError("two followers temporarily offline")
            return xml(i)
        def probe(timeout, authority, floors):
            return wait_strict_sync(
                read, timeout=timeout, interval=1,
                clock=clock.now, sleep=clock.sleep,
                authority=authority, floors=floors,
            )
        result = complete_restoration(
            lambda: True, probe,
            lambda: effects.append("unfreeze"),
            lambda i: effects.append(("restore", i)),
            lambda i: effects.append(("finish", i)),
            acceptance_timeout=3, recovery_timeout=6,
        )
        self.assertTrue(result["restoration_complete"])
        self.assertTrue(result["acceptance_deadline_missed"])
        self.assertFalse(result["qualification_passed"])
        self.assertEqual(effects[0], "unfreeze")
        self.assertEqual(sum(x == "unfreeze" for x in effects), 1)

    def test_stale_follower_commit_cannot_be_overridden_by_majority(self):
        clock = Clock()
        def read(i, remaining):
            return xml(i, commit=8 if i == 2 else 10)
        with self.assertRaises(SyncTimeout) as error:
            wait_strict_sync(
                read, timeout=3, interval=1,
                clock=clock.now, sleep=clock.sleep,
            )
        self.assertEqual(
            error.exception.diagnostic["per_host_commit_delta"][2], 2
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
