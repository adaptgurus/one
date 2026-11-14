"""Real loopback HTTP/XML-RPC negative tests; all management effects are spies.
Uses three ephemeral loopback ports, a run-generated token, and joins all servers.
No native API, database, service, host power or VM lifecycle call is made.
"""
import contextlib,secrets,socketserver,threading,time,unittest,xmlrpc.client
from xmlrpc.server import SimpleXMLRPCServer
from rollback_guard import wait_strict_sync,complete_restoration,UnsafeSnapshot
from read_only_probe import Transport
from test_rollback_guard import xml

class Server(socketserver.ThreadingMixIn,SimpleXMLRPCServer):
    daemon_threads=True
    allow_reuse_address=False

class XMLRPCBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.token=secrets.token_urlsafe(24);self.started=time.monotonic();self.mode='normal';self.calls=[];self.servers=[];self.threads=[];self.query_count=0
        for i in range(3):
            server=Server(('127.0.0.1',0),logRequests=False,allow_none=False)
            def status(token,node=i):
                if token!=self.token:raise ValueError('test authentication refused')
                self.query_count+=1
                elapsed=time.monotonic()-self.started
                if self.mode=='missing-identity' and node==1:return xml(node).replace('<SERVER_ID>1</SERVER_ID>','')
                if self.mode=='split' and node==1:return xml(node,state=3)
                if self.mode=='wrong-identity' and node==1:return xml(node,server_id=9)
                lag=node==1 and (self.mode=='never' or self.mode=='late' and elapsed<0.35)
                return xml(node,commit=9 if lag else 10)
            server.register_function(status,'one.zone.raftstatus')
            thread=threading.Thread(target=lambda s=server:s.serve_forever(poll_interval=0.02),daemon=True)
            thread.start();self.servers.append(server);self.threads.append(thread)
    def tearDown(self):
        for s in self.servers:s.shutdown();s.server_close()
        for t in self.threads:t.join(timeout=2);self.assertFalse(t.is_alive())
    def read(self,i,remaining):
        endpoint='http://127.0.0.1:'+str(self.servers[i].server_address[1])+'/RPC2'
        with xmlrpc.client.ServerProxy(endpoint,transport=Transport(min(.25,remaining))) as api:
            return api.one.zone.raftstatus(self.token)
    def probe(self,seconds,authority,floors):
        return wait_strict_sync(self.read,timeout=seconds,interval=.03,authority=authority,floors=floors)
    def restore(self):
        return complete_restoration(lambda:True,self.probe,lambda:self.calls.append('enabled'),
            lambda i:self.calls.append(('services',i)),lambda i:self.calls.append(('finish',i)),
            acceptance_timeout=.18,recovery_timeout=.8)
    def test_actual_http_success(self):
        r=self.restore();self.assertTrue(r['qualification_passed']);self.assertGreaterEqual(self.query_count,8)
    def test_actual_http_late_followers_complete_restoration_not_acceptance(self):
        self.mode='late';r=self.restore();self.assertTrue(r['restoration_complete']);self.assertTrue(r['acceptance_deadline_missed']);self.assertFalse(r['qualification_passed']);self.assertIn('enabled',self.calls)
    def test_actual_http_permanent_lag_never_unfreezes(self):
        self.mode='never';r=self.restore();self.assertFalse(r['restoration_complete']);self.assertEqual(self.calls,[])
    def test_actual_http_split_leader_never_unfreezes(self):
        self.mode='split';r=self.restore();self.assertFalse(r['restoration_complete']);self.assertEqual(self.calls,[])
    def test_actual_http_wrong_endpoint_identity_never_unfreezes(self):
        self.mode='wrong-identity';r=self.restore();self.assertFalse(r['restoration_complete']);self.assertEqual(self.calls,[])
    def test_actual_http_missing_identity_never_unfreezes(self):
        self.mode='missing-identity';r=self.restore();self.assertFalse(r['restoration_complete']);self.assertEqual(self.calls,[])

if __name__=='__main__':unittest.main(verbosity=2)
