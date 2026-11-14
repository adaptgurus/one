import json,os,socket,subprocess,xmlrpc.client,xml.etree.ElementTree as E,time,shlex
from pathlib import Path
D=Path('/root/onedrs-scheduler-features-20261113');S=Path('/var/lib/layersentry/onedrs-lab-service-20261113')
socket.setdefaulttimeout(15)
admin_auth=Path('/var/lib/one/.one/one_auth').read_text().strip()
service_auth=(S/'one_auth').read_text().strip()
api=xmlrpc.client.ServerProxy('http://127.0.0.1:2633/RPC2',allow_none=False)
def request(method,*args,admin=False):return getattr(api,method)(admin_auth if admin else service_auth,*args)
def call(method,*args,admin=False):
 r=request(method,*args,admin=admin)
 if not r[0]:raise RuntimeError(method+': '+str(r[1])[:800])
 return r[1]
def manifest():return json.loads((D/'manifest.json').read_text())
def save(m):(D/'manifest.json').write_text(json.dumps(m,indent=2)+'\n')
def run(cmd,host=None):
 argv=['bash','-lc',cmd] if host is None or host=='172.17.60.80' else ['ssh','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=4','root@'+host,cmd]
 return subprocess.run(argv,capture_output=True,text=True,timeout=20,check=True).stdout
def owned(m):
 r=E.fromstring(call('one.vm.info',m['vmid'],False));assert r.findtext('NAME')==m['run'] and r.findtext('UID')==str(m['uid']) and r.findtext('USER_TEMPLATE/LAYERSENTRY_LAB_OPERATION_ID')==m['run'],'VM ownership drift';return r
def status(m):
 r=owned(m);history=r.findall('HISTORY_RECORDS/HISTORY');h=history[-1] if history else E.Element('HISTORY')
 return {'id':int(r.findtext('ID')),'state':int(r.findtext('STATE')),'lcm':int(r.findtext('LCM_STATE')),'host':h.findtext('HID'),'ds':h.findtext('DS_ID'),'seq':h.findtext('SEQ'),'deploy_id':r.findtext('DEPLOY_ID')}
def wait(m,pred,seconds=55):
 start=time.monotonic()
 while time.monotonic()-start<seconds:
  s=status(m)
  if pred(s):return s
  time.sleep(.5)
 raise RuntimeError('native state deadline: '+json.dumps(s))
