"""Finite model combinations, not physical failure or deployment acceptance."""
import itertools,json,time
from rollback_guard import wait_strict_sync,SyncTimeout,UnsafeSnapshot
from test_rollback_guard import Clock,xml
start=time.monotonic();total=passed=rejected=0
for states in itertools.product(range(5),repeat=3):
 for commits in itertools.product(range(9,12),repeat=3):
  for tails in itertools.product(range(2),repeat=3):
   clock=Clock()
   def read(i,b):return xml(i,state=states[i],commit=commits[i],log_index=commits[i]+tails[i])
   should=(states.count(3)==1 and all(s in [2,3] for s in states) and len(set(commits))==1 and not any(tails))
   try:
    wait_strict_sync(read,timeout=1.5,clock=clock.now,sleep=clock.sleep)
    accepted=True;passed+=1
   except (SyncTimeout,UnsafeSnapshot):accepted=False;rejected+=1
   if accepted!=should:raise AssertionError((states,commits,tails,accepted,should))
   total+=1
print(json.dumps({'scope':'FINITE_MODEL_TOPOLOGY_COMMIT_SUFFIX_COMBINATIONS_NOT_PHYSICAL_FAILURE','combinations':total,'accepted':passed,'rejected':rejected,'false_acceptances':0,'false_rejections':0,'result':'PASS','elapsed_seconds':round(time.monotonic()-start,3)},indent=2))
