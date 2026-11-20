#!/usr/bin/python3
"""One-off owned nested-lab network configuration, not a product network agent."""
from pathlib import Path
import hashlib,json,os,subprocess,sys
MEMBERS=[
("ls-onedrs-rc-01","192.168.247.11","7f0e6ce9-dd5d-4598-a863-5fac81b27bc1"),
("ls-onedrs-rc-02","192.168.247.12","3f3f7e61-e460-48af-868a-d806f9c7afb2"),
("ls-onedrs-rc-03","192.168.247.13","3872092d-4ebd-43cb-a515-74174cd2e2fe"),
("ls-onedrs-rc-04","192.168.247.14","b9e1a75f-78f8-46da-89c2-5183ab69ada3"),
("ls-onedrs-rc-05","192.168.247.15","22a9092c-bfc7-4f90-81ea-988d25c37e34")]
BR="br-rc-guest";VX="vxrc24720";STATE=Path("/var/lib/ls-onedrs-rc-guest-network-20261120")
def run(a):return subprocess.check_output(a,text=True,stdin=subprocess.DEVNULL).strip()
def save(value):
 tmp=STATE/"ownership.new";fd=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(fd,"w") as f:json.dump(value,f,sort_keys=True);f.write("\n");f.flush();os.fsync(f.fileno())
 os.replace(tmp,STATE/"ownership.json")
 fd=os.open(STATE,os.O_DIRECTORY);os.fsync(fd);os.close(fd)
def verify(links,node,bridge_mac,vx_mac,peers):
 by={x["ifname"]:x for x in links};br=by[BR];vx=by[VX];alias="ls-onedrs-rc-20261120:"+node[2]
 assert br.get("ifalias")==alias+":bridge" and vx.get("ifalias")==alias+":vxlan"
 assert br["mtu"]==1450 and vx["mtu"]==1450
 assert br["address"]==bridge_mac and vx["address"]==vx_mac
 assert br["linkinfo"]["info_kind"]=="bridge" and vx["linkinfo"]["info_kind"]=="vxlan"
 data=vx["linkinfo"]["info_data"]
 assert data["id"]==24720 and data["local"]==node[1] and data["port"]==4789
 assert data.get("learning") is False or data.get("learning")==0
 assert vx.get("master")==BR and data.get("link")=="eth0"
 assert "UP" in br["flags"] and "UP" in vx["flags"]
 addr=json.loads(run(["ip","-json","-4","address","show","dev",BR]))
 expected="10.247.20."+node[1].rsplit(".",1)[1]
 assert [(x["local"],x["prefixlen"]) for row in addr for x in row["addr_info"]]==[(expected,24)]
 fdb=json.loads(run(["bridge","-json","fdb","show","dev",VX]))
 zero=[x["dst"] for x in fdb if x.get("mac")=="00:00:00:00:00:00"]
 assert len(zero)==4 and set(zero)==set(peers)
 return {"bridge":br,"vxlan":vx,"addresses":addr,"flood_peers":sorted(zero)}
def main():
 assert os.geteuid()==0 and len(sys.argv)==2 and sys.argv[1] in ["0","1","2","3","4"]
 index=int(sys.argv[1]);node=MEMBERS[index]
 assert run(["hostname"])==node[0]+".candidate-lab.internal" and Path("/sys/class/dmi/id/product_uuid").read_text().strip().lower()==node[2]
 assert run(["getenforce"])=="Enforcing"
 own=node[1].rsplit(".",1)[1]
 addresses=json.loads(run(["ip","-json","-4","address","show","dev","eth0"]))
 assert any(x.get("local")==node[1] for row in addresses for x in row["addr_info"])
 links=json.loads(run(["ip","-json","-details","link","show"]))
 assert next(x for x in links if x["ifname"]=="eth0")["mtu"]>=1500
 bridge_mac="52:54:00:dc:27:"+own;vx_mac="52:54:00:dd:27:"+own
 peers=[n[1] for n in MEMBERS if n!=node];boot=Path("/proc/sys/kernel/random/boot_id").read_text().strip()
 STATE.mkdir(mode=0o700,exist_ok=True);assert not STATE.is_symlink() and STATE.stat().st_uid==0 and STATE.stat().st_mode&0o777==0o700
 present={x["ifname"] for x in links}&{BR,VX}
 if present:
  assert present=={BR,VX} and (STATE/"ownership.json").is_file(),"Refuse foreign or partial network adoption"
  old=json.loads((STATE/"ownership.json").read_text())
  assert old["realm"]=="ls-onedrs-rc-20261120" and old["uuid"]==node[2] and old["boot_id"]==boot and old["phase"]=="READY"
  result=verify(links,node,bridge_mac,vx_mac,peers)
  assert old["ifindices"]=={x["ifname"]:x["ifindex"] for x in links if x["ifname"] in [BR,VX]}
 else:
  marker={"realm":"ls-onedrs-rc-20261120","uuid":node[2],"boot_id":boot,"phase":"CREATING"}
  save(marker)
  alias="ls-onedrs-rc-20261120:"+node[2]
  run(["ip","link","add","name",BR,"address",bridge_mac,"mtu","1450","type","bridge","stp_state","0"])
  run(["ip","link","set","dev",BR,"alias",alias+":bridge"])
  run(["ip","link","add","name",VX,"type","vxlan","id","24720","local",node[1],"dev","eth0","dstport","4789","nolearning"])
  run(["ip","link","set","dev",VX,"address",vx_mac,"mtu","1450","alias",alias+":vxlan"])
  run(["ip","link","set","dev",VX,"master",BR])
  for peer in peers:run(["bridge","fdb","append","00:00:00:00:00:00","dev",VX,"dst",peer])
  run(["ip","address","add","10.247.20."+own+"/24","dev",BR])
  run(["ip","link","set","dev",VX,"up"]);run(["ip","link","set","dev",BR,"up"])
  links=json.loads(run(["ip","-json","-details","link","show"]))
  result=verify(links,node,bridge_mac,vx_mac,peers)
  marker["phase"]="READY";marker["ifindices"]={x["ifname"]:x["ifindex"] for x in links if x["ifname"] in [BR,VX]};save(marker)
 print(json.dumps({"status":"PASS","scope":"OWNED_NESTED_BRIDGE_VXLAN_CONFIGURATION_ONLY","node":node[0],"network":result}))
if __name__=="__main__":main()
