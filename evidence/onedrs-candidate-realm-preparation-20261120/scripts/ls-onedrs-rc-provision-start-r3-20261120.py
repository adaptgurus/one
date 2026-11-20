#!/usr/bin/env python3
"""Start only the verified candidate realm after correcting its directory traversal mode."""
import importlib.util,json,os,pwd,shutil,traceback,xml.etree.ElementTree as ET
s=importlib.util.spec_from_file_location('p','/root/ls-onedrs-rc-provision-20261120.py');p=importlib.util.module_from_spec(s);s.loader.exec_module(p)
D,IMG=p.D,p.IMG

def main():
 os.umask(0o077)
 assert not (D/'start-r3-result.json').exists()
 members=json.loads((D/'provisioning.json').read_text())['members']
 assert p.sha(p.BASE)==p.BASE_SHA
 existing=set(p.run(['virsh','list','--all','--name']).split())
 assert p.run(['virsh','domuuid',members[0]['name']]).strip()==members[0]['uuid']
 assert p.run(['virsh','domstate',members[0]['name']]).strip()=='shut off'
 assert all(n['name'] not in existing for n in members[1:])
 assert 'Active:         yes' in p.run(['virsh','net-info',p.NET])
 x=ET.fromstring(p.run(['virsh','net-dumpxml',p.NET]));assert x.findtext('uuid')=='dac45dfe-107a-4e39-97b5-60802ab29421' and x.find('dns').get('enable')=='no' and x.find('./ip/dhcp') is None
 assert IMG.stat().st_uid==0 and IMG.stat().st_mode&0o777==0o700
 before=p.snapshot();p.save('start-r3-before-host.json',before)
 owner=pwd.getpwnam('oneadmin');os.chown(IMG,0,owner.pw_gid);IMG.chmod(0o750)
 for n in members:
  assert shutil.disk_usage('/').free>15*1024**3
  d=D/n['name'];x=ET.parse(d/'domain.xml').getroot();assert x.findtext('uuid')==n['uuid']
  if n['name'] not in existing:p.run(['virsh','define',d/'domain.xml'])
  p.run(['virsh','start',n['name']])
 after=p.snapshot();p.save('start-r3-after-host.json',after)
 changes=[n for n,v in before['domains'].items() if after['domains'].get(n)!=v]
 network_changes=[n for n,v in before['networks'].items() if after['networks'].get(n)!=v]
 missing_routes=[r for r in before['routes'] if r not in after['routes']]
 result={'at_utc':p.now(),'state':'BOOT_REQUESTED_CUSTODY_PRESERVED' if not changes and not network_changes and not missing_routes else 'BOOT_REQUESTED_CUSTODY_DIFFERENCE','members':members,'existing_domain_count':len(before['domains']),'changed_existing_domains':changes,'changed_existing_networks':network_changes,'missing_existing_routes':missing_routes,'free_bytes_after':after['free_bytes'],'source_sha256':p.sha(__file__),'image_directory_mode':'0750 root:oneadmin','private_seed_modes':'0600 oneadmin:oneadmin','native_candidate_installed':False,'soak_started':False,'earlier_failures_preserved':True}
 p.save('start-r3-result.json',result);print(json.dumps(result))

if __name__=='__main__':
 try:main()
 except Exception as e:
  p.save('start-r3-failure.json',{'at_utc':p.now(),'state':'STOPPED','error':str(e),'traceback':traceback.format_exc(),'automatic_rollback':False});raise
