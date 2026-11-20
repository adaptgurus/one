import sys,json,hashlib,importlib.metadata as metadata
from pathlib import Path
p=Path(sys.argv[1]); root=p/'usr/lib/one/python'; sched=p/'var/lib/one/remotes/scheduler/one_drs'
sys.path[:0]=[str(root),str(sched)]
import pulp,yaml,xsdata,typing_extensions
from lib.models import vm,plan,cluster,vm_group
expected={'PuLP':'3.3.2','PyYAML':'6.0.1','xsdata':'26.2','typing_extensions':'4.16.0'}
versions={k:metadata.version(k) for k in expected}
if versions!=expected: raise RuntimeError('Packaged dependency versions differ')
for m in [pulp,yaml,xsdata,typing_extensions]:
 if not Path(m.__file__).resolve().is_relative_to(root): raise RuntimeError('Dependency loaded outside packaged closure')
for m in [vm,plan,cluster,vm_group]:
 if not Path(m.__file__).resolve().is_relative_to(sched): raise RuntimeError('Model loaded outside packaged runtime')
solver=pulp.PULP_CBC_CMD(msg=False,timeLimit=5)
cbc=Path(solver.path).resolve(); digest=hashlib.sha256(cbc.read_bytes()).hexdigest()
if not cbc.is_relative_to(root) or digest!='2e17077752aa52b06385ad248c9e90bb4f1ce34038c34c94e1012ca6adea5cc7': raise RuntimeError('Packaged solver differs')
x=pulp.LpVariable('x',0,3,cat='Integer');y=pulp.LpVariable('y',0,3,cat='Integer')
m=pulp.LpProblem('packaged_closure',pulp.LpMinimize);m+=x+y;m+=2*x+y>=5
status=m.solve(solver)
if pulp.LpStatus[status]!='Optimal' or pulp.value(m.objective)!=3: raise RuntimeError('Packaged solver failed')
print(json.dumps({'status':'PASS','versions':versions,'models_imported':['vm','plan','cluster','vm_group'],'modules_from_package':True,'cbc_sha256':digest,'solver_status':pulp.LpStatus[status],'integer_objective':pulp.value(m.objective)}))
