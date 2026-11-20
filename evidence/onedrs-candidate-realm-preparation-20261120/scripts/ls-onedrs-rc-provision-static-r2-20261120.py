#!/usr/bin/env python3
"""Resume only the owned unbooted candidate realm with static networking."""
import importlib.util, json, pathlib, os, pwd, shutil, traceback, xml.etree.ElementTree as ET
s=importlib.util.spec_from_file_location('p','/root/ls-onedrs-rc-provision-20261120.py');p=importlib.util.module_from_spec(s);s.loader.exec_module(p)
D,IMG=p.D,p.IMG

def main():
 os.umask(0o077)
 if (D/'static-r2-result.json').exists():raise RuntimeError('R2 already executed; do not replay')
 m=json.loads((D/'provisioning.json').read_text())
 assert m['state']=='PREPARING' and m['native_candidate_installed'] is False
 assert p.sha(p.BASE)==p.BASE_SHA
 members=m['members'];names=set(p.run(['virsh','list','--all','--name']).split())
 assert not any(x['name'] in names for x in members)
 info=p.run(['virsh','net-info',p.NET]);assert 'Active:         no' in info
 x=ET.fromstring(p.run(['virsh','net-dumpxml',p.NET]));assert x.findtext('uuid')=='dac45dfe-107a-4e39-97b5-60802ab29421'
 assert shutil.disk_usage('/').free>50*1024**3
 before=p.snapshot();p.save('static-r2-before-host.json',before)
 owner=pwd.getpwnam('oneadmin')
 for node in members:
  d=D/node['name'];xml=ET.parse(d/'domain.xml').getroot()
  assert xml.findtext('name')==node['name'] and xml.findtext('uuid')==node['uuid']
  q=json.loads(p.run(['qemu-img','info','--output=json',IMG/(node['name']+'.qcow2')]))
  assert q['backing-filename']==str(p.BASE) and q['actual-size']<2*1024**2
  n=f'''version: 1
config:
  - type: physical
    name: eth0
    mac_address: '{node['mac']}'
    subnets:
      - type: static
        address: {node['ip']}
        netmask: 255.255.255.0
        gateway: 192.168.247.1
        dns_nameservers: [192.168.14.142]
'''
  (d/'network-config').write_text(n)
  iso=IMG/(node['name']+'-cidata.iso');backup=IMG/(node['name']+'-cidata-dhcp-r1.iso')
  assert iso.exists() and not backup.exists();iso.rename(backup)
  p.run(['genisoimage','-quiet','-output',iso,'-volid','cidata','-joliet','-rock',d/'user-data',d/'meta-data',d/'network-config'])
  os.chown(iso,owner.pw_uid,owner.pw_gid);iso.chmod(0o600);p.run(['chcon','-t','virt_content_t',iso])
 netxml=f'<network><name>{p.NET}</name><uuid>dac45dfe-107a-4e39-97b5-60802ab29421</uuid><forward mode="nat"/><bridge name="{p.BRIDGE}" stp="on" delay="0"/><dns enable="no"/><ip address="192.168.247.1" netmask="255.255.255.0"/></network>'
 (D/'network-static-r2.xml').write_text(netxml)
 p.run(['virsh','net-define',D/'network-static-r2.xml']);p.run(['virsh','net-start',p.NET])
 for node in members:
  assert shutil.disk_usage('/').free>15*1024**3
  p.run(['virsh','define',D/node['name']/'domain.xml']);p.run(['virsh','start',node['name']])
 after=p.snapshot();p.save('static-r2-after-host.json',after)
 changes=[n for n,v in before['domains'].items() if after['domains'].get(n)!=v]
 network_changes=[n for n,v in before['networks'].items() if n!=p.NET and after['networks'].get(n)!=v]
 missing_routes=[r for r in before['routes'] if r not in after['routes']]
 result={'ended_utc':p.now(),'state':'BOOT_REQUESTED_CUSTODY_PRESERVED' if not changes and not network_changes and not missing_routes else 'BOOT_REQUESTED_CUSTODY_DIFFERENCE','members':members,'existing_domain_count':len(before['domains']),'changed_existing_domains':changes,'changed_existing_networks':network_changes,'missing_existing_routes':missing_routes,'free_bytes_after':after['free_bytes'],'source_sha256':p.sha(__file__),'network_mode':'static addresses; no additional DNS or DHCP daemon','host_inotify_limits_changed':False,'original_failure_preserved':True,'native_candidate_installed':False,'soak_started':False}
 p.save('static-r2-result.json',result);print(json.dumps(result))

if __name__=='__main__':
 try:main()
 except Exception as e:
  p.save('static-r2-failure.json',{'at_utc':p.now(),'state':'STOPPED','error':str(e),'traceback':traceback.format_exc(),'automatic_rollback':False});raise
