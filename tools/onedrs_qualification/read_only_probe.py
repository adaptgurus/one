"""Fixed lab endpoints; ONLY one.zone.raftstatus, never native mutation calls."""
from dataclasses import asdict
from pathlib import Path
import datetime
import http.client
import json
import os
import xmlrpc.client
from rollback_guard import wait_strict_sync

IPS={0:'172.17.60.80',1:'172.17.60.81',2:'172.17.60.82'}
class Transport(xmlrpc.client.Transport):
    def __init__(self, timeout):
        super().__init__(); self.timeout=timeout
    def make_connection(self, host):
        return http.client.HTTPConnection(host, timeout=self.timeout)


def main():
    os.umask(0o077)
    auth=Path('/var/lib/one/.one/one_auth').read_text().strip()
    samples=[]
    def read(i, remaining):
        with xmlrpc.client.ServerProxy('http://'+IPS[i]+':2633/RPC2',
                                      transport=Transport(min(4.0,remaining))) as api:
            response=api.one.zone.raftstatus(auth)
        if not isinstance(response,(list,tuple)) or len(response)<2 or response[0] is not True:
            raise RuntimeError('authenticated native read refused')
        return response[1]
    outcome=wait_strict_sync(read,expected_ids=tuple(IPS),timeout=15,audit=samples.append)
    print(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'scope':'READ_ONLY_STRICT_NATIVE_SYNC_PROBE','mutation_calls':0,
        'receipt':asdict(outcome),'samples':samples},indent=2))

if __name__=='__main__':main()
